// Moteur simulé (mode --demo) : même interface que le vrai moteur, sans aucune session Claude.
// Sert à tester l'ordonnanceur, les permissions et le site sans consommer de quota.
import { etagesActifs, REGLAGES } from './config.js';
import { t as tr } from './i18n.js';
import { modification } from './bus.js';
import { modificationDe } from './session.js';
import { suiviPensees } from './pensees.js';
import { profilEffectif, nomProfil } from './travail.js';
import { scenario as scenarioParCle, scenarioDe, CODES_DEMO } from './scenarios-demo.js';

// Code « écrit » par les agents simulés : de vrais diffs (lignes + et −) pour l'onglet Code et le vieil écran.
const CODES = {
  'src/Shared/Config.luau': {
    avant: ['local Config = {}', '', 'Config.VitesseEnnemi = 12', 'Config.VaguesMax = 10', 'Config.DelaiVague = 8', '', 'return Config'],
    apres: ['local Config = {}', '', '-- réglages calibrés sur le bench du pathfinding', 'Config.VitesseEnnemi = 14', 'Config.VaguesMax = 12', 'Config.EnnemisMax = 20', 'Config.DelaiVague = 6', '', 'return Config'],
  },
  'src/Client/HUD.luau': {
    avant: ['local HUD = {}', '', 'function HUD.afficherVague(n)', '	print("Vague " .. n)', 'end', '', 'return HUD'],
    apres: ['local HUD = {}', 'local TweenService = game:GetService("TweenService")', '', 'function HUD.afficherVague(n, total)', '	local texte = string.format("Vague %d / %d", n, total)', '	HUD.Titre.Text = texte', '	TweenService:Create(HUD.Titre, TweenInfo.new(0.4), { TextTransparency = 0 }):Play()', 'end', '', 'return HUD'],
  },
  'bench/resultats.json': {
    avant: null,
    apres: ['{', '  "pathfinding": {', '    "chemins": 500,', '    "moyenneMs": 1.8,', '    "pireMs": 6.2', '  },', '  "date": "simulation"', '}'],
  },
};
function patchSimule(avant, apres) {
  // diff minimal : préfixe et suffixe communs, le milieu remplacé (suffit pour la démo)
  let d = 0;
  while (d < avant.length && d < apres.length && avant[d] === apres[d]) d++;
  let f = 0;
  while (f < avant.length - d && f < apres.length - d && avant[avant.length - 1 - f] === apres[apres.length - 1 - f]) f++;
  const ctx = Math.max(0, d - 2);
  const lignes = [...avant.slice(ctx, d).map((l) => ' ' + l), ...avant.slice(d, avant.length - f).map((l) => '-' + l), ...apres.slice(d, apres.length - f).map((l) => '+' + l), ...avant.slice(avant.length - f, avant.length - f + 2).map((l) => ' ' + l)];
  return [{ oldStart: ctx + 1, oldLines: avant.length - f - ctx, newStart: ctx + 1, newLines: apres.length - f - ctx, lines: lignes }];
}
function ecrireSimule(t, d, nom, chemin) {
  const c = CODES[chemin] || CODES_DEMO[chemin];
  if (!c || t.x.profil === 'lecture' || t.etage === 'direction') return;
  const r = c.avant
    ? { filePath: chemin, originalFile: c.avant.join('\n'), structuredPatch: patchSimule(c.avant, c.apres), type: 'update' }
    : { filePath: chemin, originalFile: null, structuredPatch: [], type: 'create', content: c.apres.join('\n') + '\n' };
  modification(t, d.id, modificationDe(r, nom, null));
}

// Deuxième réflexion, entre deux outils : le fil de la fiche montre plusieurs blocs et les actions intercalées.
const PENSEES_MILIEU = () => [
  tr('Les premiers résultats sont là. Avant d’aller plus loin, je vérifie qu’ils tiennent la route.'),
  tr('Si un point coince, je préfère le corriger maintenant plutôt qu’à la fin.'),
];

const attendre = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new Error('abort'));
    }, { once: true });
  });

const MODELES_REELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' };
const OUTILS = [
  ['Read', 'src/Server/Shop.luau'], ['Grep', 'PathFinder'], ['Glob', 'src/**/*.luau'], ['Edit', 'src/Shared/Config.luau'],
  ['Bash', 'rojo build -o build/verif.rbxl'], ['Read', 'DECISIONS.md'], ['Write', 'bench/resultats.json'], ['Bash', 'selene src'],
  ['TodoWrite', 'plan de travail'], ['Edit', 'src/Client/HUD.luau'],
];

// Grand scénario du dossier (démo lancée depuis le QG, ou demande qui le cite), s'il a ses étages.
function scenarioDu(d) {
  const sc = (d.x?.scenario && scenarioParCle(d.x.scenario)) || scenarioDe(d.texte);
  if (!sc) return null;
  const actifs = new Set(etagesActifs().map((e) => e.id));
  return sc.taches().every((x) => actifs.has(x.etage)) ? sc : null;
}
const etapeDe = (d, t) => scenarioDu(d)?.taches().find((x) => x.ref === t.ref) || null;

function tache(ref, titre, etage, nature, modele, effort, deps, inputsFrom, profil, verification) {
  return {
    ref, titre, etage, nature, modele, effort,
    justification: tr('{modele}/{effort} : adapté à une tâche de type {nature}.', { modele, effort, nature }),
    deps: deps.map((r) => ({ ref: r, besoin: 'done', artefact: '' })),
    inputsFrom,
    profil,
    prompt: tr('Mission simulée : {titre}.', { titre }),
    doneWhen: [tr('{titre} terminé', { titre })],
    verification: { checks: [], maxRework: 1, modele: 'opus', effort: 'high', ...verification },
    risque: 'low',
    approbation: false,
    agent: '',
  };
}

// Le DG simulé suit le plafond de tâches du niveau de coût du dossier (choisi avec la pastille, aussi en démo) :
// il garde les premières tâches et oublie les dépendances vers celles qu'il retire.
function bornerAuProfil(sortie, d) {
  const profil = profilEffectif(d);
  if (!profil.maxTaches || sortie.taches.length <= profil.maxTaches) return sortie;
  const taches = sortie.taches.slice(0, profil.maxTaches);
  const refs = new Set(taches.map((t) => t.ref));
  for (const t of taches) {
    t.deps = t.deps.filter((x) => refs.has(x.ref));
    t.inputsFrom = t.inputsFrom.filter((r) => refs.has(r));
  }
  const niveau = nomProfil(profil, REGLAGES.langueInterface === 'en' ? 'en' : 'fr');
  return { ...sortie, taches, message: `${sortie.message} ${tr('Niveau de coût {niveau} : {n} tâches au plus, je garde les premières.', { niveau, n: profil.maxTaches })}` };
}

// Lot C : limites simulées du compte (la démo ne lit pas les vraies) : 30 % de la fenêtre de 5 h déjà pris.
const DEBUT_SIMULATION = Date.now();
const limitesSimulees = () => ({ maj: Date.now(), essai: Date.now(), disponible: true, abonnement: 'max', fenetres: { five_hour: { utilisation: 30, reinit: DEBUT_SIMULATION + 3 * 3600000 } } });

export function creerSimulation() {
  return {
    simulation: true, // l'ordonnanceur n'écrit rien dans conso.json pour la démo
    limites: limitesSimulees,
    async planifier(d, options) {
      const r = await this.planSimule(d, options);
      if (r.sortie?.taches?.length) r.sortie = bornerAuProfil(r.sortie, d);
      return r;
    },

    async planSimule(d, { reponse = null } = {}) {
      const sc = scenarioDu(d);
      if (sc) {
        d.x.scenario = sc.cle;
        await this.penserSimule('dg', d.id, null, sc.pensees());
        return {
          sortie: {
            titre: sc.titre(),
            message: sc.message(),
            clarification: '',
            taches: sc.taches().map((x) => tache(x.ref, x.titre, x.etage, x.nature, x.modele, x.effort, x.deps || [], x.inputs || [], x.profil, x.verif)),
          },
        };
      }
      await this.penserSimule('dg', d.id, null, [
        tr('La demande mélange une mesure et ce qui en dépend : je sépare le bench des tests.'),
        tr('Le bench est clair, Sonnet en effort élevé suffit ; la refonte du spawn est plus délicate, je prends Opus.'),
        tr('Je prévois une vérification indépendante pour les tests.'),
      ]);
      if (d.texte.trim().endsWith('?') && !reponse) {
        return { sortie: { titre: tr('Question du DG'), message: '', clarification: tr('Sur quel jeu veux-tu que je travaille en priorité ?'), taches: [] } };
      }
      const actifs = etagesActifs().filter((e) => e.id !== 'direction').map((e) => e.id);
      // Réserve : si un agent disponible a déjà travaillé sur l'étage du bench, le DG simulé le réembauche.
      const { disponiblesPour } = await import('./equipe.js');
      const reserve = disponiblesPour(d.compte);
      const e1 = actifs.includes(d.etageAffiche) ? d.etageAffiche : actifs[0];
      const e2 = actifs.find((id) => id !== e1) || e1;
      return {
        sortie: {
          titre: tr('Démo : bench puis tests calibrés'),
          message: tr("J'ai découpé ta demande en 5 tâches sur deux étages : le bench d'abord, les tests ensuite, avec une vérification."),
          clarification: '',
          taches: [
            { ...tache('T1', tr('Bench du pathfinding'), e1, 'bench', 'sonnet', 'high', [], [], 'edition+tests', { mode: 'self' }), agent: reserve.find((a) => a.etage === e1)?.id || '' },
            { ...tache('T2', tr('Inventaire des scripts serveur'), e2, 'analyse', 'haiku', 'low', [], [], 'lecture', { mode: 'none' }), agent: reserve.find((a) => a.etage === e2)?.id || '' },
            tache('T3', tr('Tests calibrés sur le bench'), e1, 'test', 'sonnet', 'medium', ['T1'], ['T1'], 'edition+tests', { mode: 'agent', modele: 'opus' }),
            tache('T4', tr('Refonte du module de spawn'), e2, 'impl', 'opus', 'high', ['T2'], ['T2'], 'edition', { mode: 'agent', modele: 'sonnet', effort: 'medium' }),
            // QG_SIM_VALIDATION_USER (tests) : le DG simulé demande ta validation pour la synthèse
            tache('T5', tr('Note de synthèse technique'), 'direction', 'synthese', 'haiku', 'low', ['T3', 'T4'], ['T3', 'T4'], 'lecture', { mode: process.env.QG_SIM_VALIDATION_USER ? 'user' : 'self' }),
          ],
        },
      };
    },

    // Pensées simulées : un bloc de réflexion (une idée par paragraphe) écrit mot à mot, puis la rédaction.
    // Le flux passe par le vrai suivi des pensées (serveur/pensees.js) : même format qu'une vraie session.
    async penserSimule(cible, dossierId, signal, idees, { redaction = true, verificateur = false } = {}) {
      const { pensee } = await import('./bus.js');
      const suivre = suiviPensees((p) => pensee(cible, dossierId, verificateur ? { ...p, verificateur: true } : p));
      try {
        suivre({ type: 'content_block_start', content_block: { type: 'thinking', thinking: '' } });
        for (const [i, idee] of idees.entries()) {
          const mots = (i ? '\n\n' : '') + idee;
          const morceaux = mots.match(/\S+\s*|\s+/g) || [];
          for (const m of morceaux) {
            suivre({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: m } });
            await attendre(Math.max(40, Math.round(1300 / morceaux.length)), signal);
          }
        }
        suivre({ type: 'content_block_stop' });
      } finally {
        suivre.terminer();
      }
      if (!redaction) return;
      pensee(cible, dossierId, { phase: 'redaction', outil: null, extrait: '', taille: 1800 });
      await attendre(900, signal);
    },

    // B9 : la démo ne lance aucune commande ; les contrôles de la fiche passent toujours.
    async controler(t, d, commandes) {
      await attendre(600);
      return { ok: true, resultats: commandes.map((commande) => ({ commande, ok: true, code: 0, duree: 600 })), echec: null };
    },

    // Demande directe (1.0.10) : l'agent réfléchit, utilise quelques outils, lance un sous-agent, puis répond.
    async produireDirect(t, d, ctx) {
      const signal = ctx.abortController.signal;
      const session = ctx.resume || `sim-${t.id}`;
      try {
        await attendre(1200, signal);
        ctx.surInit({ model: MODELES_REELS[t.modele] || t.modele, session_id: session });
        await this.penserSimule(t.id, d.id, signal, [tr('Je regarde ce qui existe déjà avant de répondre.')]);
        for (let i = 0; i < 4; i++) {
          await attendre(1800, signal);
          const [nom, cible] = OUTILS[i % OUTILS.length];
          ctx.surOutil(nom, tr(cible));
          if (i === 1) ctx.surSousAgents?.(2);
          if (i === 3) ctx.surSousAgents?.(0);
        }
        return { sessionId: session, texte: tr('(simulation) Voilà ce que j’ai trouvé : tout est en place, rien à changer pour l’instant.') };
      } catch (e) {
        return { sessionId: session, texte: null, echec: String(e?.message || e) };
      }
    },

    async produire(t, d, ctx) {
      const signal = ctx.abortController.signal;
      const session = ctx.resume || `sim-${t.id}-${t.tentative}`;
      // Injection simulée : un complément interrompt le tour et ajoute deux appels d'outils.
      let complements = 0;
      if (ctx.canal) ctx.canal.injecter = async () => ((complements += 1), true);
      try {
        await attendre(1500, signal);
        ctx.surInit({ model: MODELES_REELS[t.modele], session_id: session });
        const etape = etapeDe(d, t);
        if (etape) return await this.produireEtape(t, d, ctx, etape, session, () => complements);
        await this.penserSimule(t.id, d.id, signal, [
          tr('Bon, ma mission : {mission}.', { mission: t.titre.toLowerCase() }),
          tr('Je commence par regarder ce qui existe déjà dans le projet.'),
          tr('Le plus sûr est de procéder par petites étapes vérifiables.'),
        ]);
        const n = t.etat === 'rework' ? 3 : 4 + (t.ref.charCodeAt(1) % 4);
        for (let i = 0; i < n; i++) {
          await attendre(2200 + ((i * 937) % 1800), signal);
          const [nom, cible] = OUTILS[(i + t.ref.charCodeAt(1)) % OUTILS.length];
          ctx.surOutil(nom, tr(cible));
          ctx.surContexte?.(24000 + i * 9000 + (t.ref.charCodeAt(1) % 5) * 3000);
          if (nom === 'Edit' || nom === 'Write') ecrireSimule(t, d, nom, cible);
          if (i === 1) await this.penserSimule(t.id, d.id, signal, PENSEES_MILIEU(), { redaction: false });
          if (i === 1 && t.ref === 'T3' && t.etat !== 'rework') {
            const res = await ctx.canUseTool('Bash', { command: 'npm install --save-dev luau-test-kit' }, { signal });
            ctx.surOutil('Bash', res.behavior === 'allow' ? tr('npm install (autorisé)') : tr('autre approche'));
          }
        }
        for (let i = 0; i < complements * 2; i++) {
          await attendre(1500, signal);
          ctx.surOutil('Edit', tr('prise en compte du complément'));
        }
        if (ctx.canal) ctx.canal.injecter = async () => false;
        if (t.ref === 'T4' && t.tentative === 2) {
          const { demanderDecision } = await import('./decisions.js');
          ctx.surOutil('mcp__qg__demander', tr('Quelle variante de spawn ?'));
          await demanderDecision(t, { question: tr('Quelle variante de spawn préfères-tu ?'), options: [{ libelle: tr('Vagues fixes') }, { libelle: tr('Vagues adaptatives') }, { libelle: tr('Spawn continu') }], pieces: [] }, signal);
        }
        if (t.ref === 'T4' && t.tentative === 1) {
          return { sessionId: session, sortie: { status: 'blocked', summary: tr('Le module de spawn dépend d’un service non documenté ; il faut plus de contexte.'), changedFiles: [], artifacts: [], handoffNotes: '', questionsForDg: [tr('Faut-il garder la compatibilité avec l’ancien format ?')], selfCheck: [] } };
        }
        return {
          sessionId: session,
          sortie: {
            status: 'done',
            summary: tr('{titre} : fait (simulation).', { titre: t.titre }),
            changedFiles: t.x.profil === 'lecture' ? [] : ['src/Shared/Config.luau'],
            artifacts: t.nature === 'bench' ? [{ path: 'bench/resultats.json', kind: 'bench' }] : [],
            handoffNotes: tr('Notes de passation simulées.'),
            questionsForDg: [],
            selfCheck: t.x.doneWhen.map((c) => ({ critere: c, ok: true, preuve: 'simulation' })),
          },
        };
      } catch {
        return { sessionId: session, sortie: null, echec: 'abort' };
      }
    },

    // Tâche d'un grand scénario : ses propres pensées, outils, fichiers, et au besoin un serveur du sous-sol.
    async produireEtape(t, d, ctx, etape, session, complements) {
      const signal = ctx.abortController.signal;
      const rework = t.etat === 'rework';
      await this.penserSimule(t.id, d.id, signal, rework
        ? [tr('Le vérificateur a raison, je corrige : {remarque}', { remarque: etape.rework || '' })]
        : [tr('Bon, ma mission : {mission}.', { mission: t.titre.toLowerCase() }), ...(etape.pensees || [])]);
      const pas = rework ? etape.pas.filter(([nom]) => nom === 'Edit' || nom === 'Bash').slice(-3) : etape.pas;
      for (let i = 0; i < pas.length; i++) {
        await attendre(3800 + ((i * 937 + t.ref.charCodeAt(1) * 311) % 2400), signal);
        if (i === 1 && etape.service && !rework) await this.allumerServeur(t, d, ctx, etape.service);
        const [nom, cible] = pas[i];
        ctx.surOutil(nom, cible);
        ctx.surContexte?.(30000 + i * 11000);
        if (nom === 'Edit' || nom === 'Write') ecrireSimule(t, d, nom, cible);
        if (i === 1 && !rework) await this.penserSimule(t.id, d.id, signal, PENSEES_MILIEU(), { redaction: false });
      }
      for (let i = 0; i < complements() * 2; i++) {
        await attendre(1500, signal);
        ctx.surOutil('Edit', tr('prise en compte du complément'));
      }
      if (ctx.canal) ctx.canal.injecter = async () => false;
      const ecrits = [...new Set(etape.pas.filter(([nom]) => nom === 'Edit' || nom === 'Write').map(([, f]) => f))];
      return {
        sessionId: session,
        sortie: {
          status: 'done',
          summary: etape.resume,
          changedFiles: t.x.profil === 'lecture' ? [] : ecrits,
          artifacts: [],
          handoffNotes: etape.passation || '',
          questionsForDg: [],
          selfCheck: t.x.doneWhen.map((c) => ({ critere: c, ok: true, preuve: 'simulation' })),
        },
      };
    },

    // Comme l'outil mcp__qg__service_demarrer : l'agent descend au sous-sol allumer le serveur (simulé en démo).
    async allumerServeur(t, d, ctx, type) {
      const { emettre, message } = await import('./bus.js');
      const { demarrer } = await import('./services.js');
      emettre('service_action', { tache: t.id, service: `${t.etage}:${type}`, action: 'demarrer' }, d.id);
      ctx.surOutil('mcp__qg__service_demarrer', type);
      try {
        const s = await demarrer(t.etage, type, t.ref);
        message(d.id, 'systeme', s.port ? tr('{ref} a démarré {service} (port {port}) au sous-sol.', { ref: t.ref, service: s.nom, port: s.port }) : tr('{ref} a démarré {service} au sous-sol.', { ref: t.ref, service: s.nom }), [t.etage, 'sous-sol']);
      } catch (e) {
        ctx.surOutil('mcp__qg__service_demarrer', tr('impossible : {raison}', { raison: e.message }));
      }
    },

    async verifier(t, d, sortie, ctx) {
      try {
        await this.penserSimule(t.id, d.id, ctx.abortController.signal, [
          tr('Je relis la mission et les critères « terminé quand », un par un.'),
          tr('Ensuite je compare avec ce que l’agent dit avoir fait, puis je regarde le diff pour vérifier par moi-même.'),
        ], { redaction: false, verificateur: true });
        for (let i = 0; i < 3; i++) {
          await attendre(2000, ctx.abortController.signal);
          ctx.surActivite();
        }
      } catch {
        return { verdict: null, echec: 'abort' };
      }
      const etape = etapeDe(d, t);
      if (etape) {
        if (etape.rework && t.x.reworks === 0) return { verdict: { verdict: 'rework', issues: [{ gravite: 'bloquant', detail: etape.rework, fichier: '' }], preuve: tr('Relecture et essai dans Studio.') } };
        return { verdict: { verdict: 'pass', issues: [], preuve: tr('Tous les critères sont remplis (simulation).') } };
      }
      if (t.ref === 'T3' && t.x.reworks === 0) {
        return { verdict: { verdict: 'rework', issues: [{ gravite: 'bloquant', detail: tr('Le cas « chemin bloqué » n’est pas testé.'), fichier: 'tests/pathfinding.spec.luau' }], preuve: tr('Lecture des tests.') } };
      }
      return { verdict: { verdict: 'pass', issues: [], preuve: tr('Tous les critères sont remplis (simulation).') } };
    },

    async reagir(d, evenements, complements = []) {
      await attendre(3000);
      const relance = !scenarioDu(d) && evenements.some((e) => e.startsWith('T4'));
      const ops = relance ? [{ op: 'relancer', ref: 'T4', consigne: tr('Garde la compatibilité avec l’ancien format de spawn.'), modele: 'opus', effort: 'xhigh', raison: tr('manque de contexte') }] : [];
      // Complément de l'utilisateur : on le transmet à toutes les tâches pas encore finies ;
      // si tout est fini, on ajoute une tâche confiée à un agent de la réserve.
      const nouvellesTaches = [];
      // « Réduire » sur la carte d'accord du coût : le DG simulé retire sa dernière tâche pas encore lancée.
      let retiree = null;
      if (evenements.some((e) => e.startsWith('Ton plan est estimé'))) {
        const { etat } = await import('./bus.js');
        const restantes = [...etat.taches.values()].filter((t) => t.dossier === d.id && ['planned', 'waiting', 'ready', 'queued'].includes(t.etat)).sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)));
        if (restantes.length > 1) {
          retiree = restantes.at(-1).ref;
          ops.push({ op: 'retirer', ref: retiree, consigne: '', modele: '', effort: '', raison: tr('plan réduit pour tenir sous ton seuil') });
        }
      }
      if (complements.length) {
        const { etat } = await import('./bus.js');
        const { disponiblesPour } = await import('./equipe.js');
        const siennes = [...etat.taches.values()].filter((t) => t.dossier === d.id);
        for (const t of siennes) {
          if (!['done', 'failed', 'cancelled', 'skipped'].includes(t.etat)) {
            ops.push({ op: 'informer', ref: t.ref, consigne: complements.map((c) => c.texte).join(' / '), modele: '', effort: '', raison: tr('complément utilisateur') });
          }
        }
        if (!ops.length && siennes.length) {
          const base = siennes.find((t) => t.ref === 'T1') || siennes[0];
          const ref = `T${Math.max(...siennes.map((t) => Number(t.ref.slice(1)))) + 1}`;
          const connaisseur = disponiblesPour(d.compte).find((a) => a.etage === base.etage);
          nouvellesTaches.push({ ...tache(ref, tr('Complément : {texte}', { texte: complements[0].texte.slice(0, 40) }), base.etage, 'test', 'sonnet', 'medium', [], [], 'edition+tests', { mode: 'self' }), agent: connaisseur?.id || '' });
        }
      }
      return {
        sortie: {
          message: complements.length
            ? (nouvellesTaches.length
              ? (nouvellesTaches[0].agent
                ? tr("Tout était fini : j'ajoute {ref} pour ce complément, confiée à {agent} qui connaît déjà ce code.", { ref: nouvellesTaches[0].ref, agent: nouvellesTaches[0].agent })
                : tr("Tout était fini : j'ajoute {ref} pour ce complément.", { ref: nouvellesTaches[0].ref }))
              : tr('Complément reçu : je le transmets aux tâches en cours ({refs}).', { refs: ops.filter((o) => o.op === 'informer').map((o) => o.ref).join(', ') }))
            : retiree
              ? tr('Je réduis le plan : je retire {ref}, sans toucher aux modèles ni aux efforts.', { ref: retiree })
              : relance
                ? tr('T4 manquait de contexte : je la relance en opus/xhigh avec la consigne de garder l’ancien format.')
                : tr('Bien reçu, on continue.'),
          question: '',
          ops,
          nouvellesTaches,
        },
      };
    },

    async synthese(d) {
      await attendre(3000);
      const sc = scenarioDu(d);
      if (sc) return { sortie: { message: sc.synthese() } };
      return { sortie: { message: tr('Dossier {id} terminé (simulation) : bench et tests calibrés en place, module de spawn refait, note de synthèse prête.', { id: d.id }) } };
    },
  };
}
