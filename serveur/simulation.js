// Moteur simulé (mode --demo) : même interface que le vrai moteur, sans aucune session Claude.
// Sert à tester l'ordonnanceur, les permissions et le site sans consommer de quota.
import { etagesActifs } from './config.js';
import { t as tr } from './i18n.js';

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

export function creerSimulation() {
  return {
    async planifier(d, { reponse = null } = {}) {
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
            tache('T5', tr('Note de synthèse technique'), 'direction', 'synthese', 'haiku', 'low', ['T3', 'T4'], ['T3', 'T4'], 'lecture', { mode: 'self' }),
          ],
        },
      };
    },

    // Pensées simulées (réflexion, rédaction, rapport) pour voir les bulles de réflexion en démo.
    async penserSimule(cible, dossierId, signal, idees) {
      const { pensee } = await import('./bus.js');
      let texte = '';
      for (const idee of idees) {
        texte += (texte ? ' ' : '') + idee;
        pensee(cible, dossierId, { phase: 'reflexion', outil: null, extrait: texte.slice(-280), taille: texte.length });
        await attendre(1300, signal);
      }
      pensee(cible, dossierId, { phase: 'redaction', outil: null, extrait: '', taille: 1800 });
      await attendre(900, signal);
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

    async verifier(t, d, sortie, ctx) {
      try {
        for (let i = 0; i < 3; i++) {
          await attendre(2000, ctx.abortController.signal);
          ctx.surActivite();
        }
      } catch {
        return { verdict: null, echec: 'abort' };
      }
      if (t.ref === 'T3' && t.x.reworks === 0) {
        return { verdict: { verdict: 'rework', issues: [{ gravite: 'bloquant', detail: tr('Le cas « chemin bloqué » n’est pas testé.'), fichier: 'tests/pathfinding.spec.luau' }], preuve: tr('Lecture des tests.') } };
      }
      return { verdict: { verdict: 'pass', issues: [], preuve: tr('Tous les critères sont remplis (simulation).') } };
    },

    async reagir(d, evenements, complements = []) {
      await attendre(3000);
      const relance = evenements.some((e) => e.startsWith('T4'));
      const ops = relance ? [{ op: 'relancer', ref: 'T4', consigne: tr('Garde la compatibilité avec l’ancien format de spawn.'), modele: 'opus', effort: 'xhigh', raison: tr('manque de contexte') }] : [];
      // Complément de l'utilisateur : on le transmet à toutes les tâches pas encore finies ;
      // si tout est fini, on ajoute une tâche confiée à un agent de la réserve.
      const nouvellesTaches = [];
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
      return { sortie: { message: tr('Dossier {id} terminé (simulation) : bench et tests calibrés en place, module de spawn refait, note de synthèse prête.', { id: d.id }) } };
    },
  };
}
