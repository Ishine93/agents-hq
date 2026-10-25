// Outils « qg » donnés à chaque agent (serveur MCP dans le processus du serveur) :
// - montrer : afficher des images dans le site (captures, rendus) ;
// - demander : te poser une question, avec options illustrées, et attendre ta réponse.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { etage as trouverEtage } from './config.js';
import { message, emettre } from './bus.js';
import { servicesPublics, demarrer as demarrerService, arreter as arreterService, journaux as journauxService } from './services.js';
import { copierImage, piecePublique, sauverCapture } from './pieces.js';
import { capturerPage, telechargerImage } from './recherche.js';
import { demanderDecision } from './decisions.js';
import { t as tr } from './i18n.js';

export const OUTILS_QG = [
  'mcp__qg__montrer', 'mcp__qg__demander', 'mcp__qg__services', 'mcp__qg__service_demarrer', 'mcp__qg__service_journaux', 'mcp__qg__service_arreter',
  'mcp__qg__capturer_page', 'mcp__qg__telecharger_image',
];

const texte = (t) => ({ content: [{ type: 'text', text: t }] });
const resumeService = (s) =>
  `${s.nom} (${s.type}) — ${s.etat}${s.port ? `, port ${s.port}` : ''}${s.externe ? `, port déjà en écoute hors du QG (PID ${s.externe.pid})` : ''}${s.erreur ? `, erreur : ${s.erreur}` : ''}`;

// captures : liste (partagée avec la session) des captures reçues par l'agent, la plus récente à la fin.
export function serveurQg(t, d, { captures, signal }) {
  const cwd = trouverEtage(t.etage)?.projet;
  const resoudre = (chemins = [], nbCaptures = 0) => {
    const pieces = [];
    const erreurs = [];
    for (const c of chemins) {
      try {
        pieces.push(copierImage(d.id, t.etage, c, cwd));
      } catch (e) {
        erreurs.push(e.message);
      }
    }
    if (nbCaptures > 0) pieces.push(...captures.slice(-nbCaptures));
    return { pieces, erreurs };
  };

  return createSdkMcpServer({
    name: 'qg',
    version: '1.0.0',
    tools: [
      tool(
        'montrer',
        "Affiche une ou plusieurs images à l'utilisateur dans le site du QG (captures d'écran, rendus, visuels générés), avec une légende. Ne bloque pas. Pour les captures que tu viens de recevoir d'un outil (ex. Roblox Studio), utilise dernieresCaptures.",
        {
          legende: z.string().describe('Ce que montrent les images'),
          images: z.array(z.string()).describe('Chemins de fichiers image du projet (png, jpg, webp, gif)').default([]),
          dernieresCaptures: z.number().int().min(0).max(6).describe('Nombre de captures reçues récemment à joindre').default(0),
        },
        async ({ legende, images, dernieresCaptures }) => {
          const { pieces, erreurs } = resoudre(images, dernieresCaptures);
          if (pieces.length) message(d.id, 'systeme', `${t.ref} : ${legende}`, [t.etage], pieces.map((p) => ({ ...piecePublique(p), legende })));
          const texte = pieces.length ? `${pieces.length} image(s) affichée(s) à l'utilisateur.` : 'Aucune image affichée.';
          return { content: [{ type: 'text', text: erreurs.length ? `${texte} Problèmes : ${erreurs.join(' ; ')}` : texte }] };
        },
      ),
      tool(
        'demander',
        "Pose une question à l'utilisateur et ATTEND sa réponse : avis sur des captures, choix entre plusieurs options (chacune peut avoir une image). À réserver aux décisions qui lui reviennent (goût, gameplay, priorité, direction artistique). Pour une question technique, décide toi-même ou rends blocked.",
        {
          question: z.string(),
          options: z
            .array(z.object({ libelle: z.string(), image: z.string().optional().describe("Chemin d'une image illustrant l'option") }))
            .max(6)
            .describe('Options proposées ; vide = réponse libre')
            .default([]),
          images: z.array(z.string()).describe('Images à montrer avec la question').default([]),
          dernieresCaptures: z.number().int().min(0).max(6).default(0),
        },
        async ({ question, options, images, dernieresCaptures }) => {
          const { pieces, erreurs } = resoudre(images, dernieresCaptures);
          const opts = options.map((o) => {
            if (!o.image) return { libelle: o.libelle };
            try {
              return { libelle: o.libelle, piece: copierImage(d.id, t.etage, o.image, cwd) };
            } catch (e) {
              erreurs.push(e.message);
              return { libelle: o.libelle };
            }
          });
          const reponse = await demanderDecision(t, { question, options: opts, pieces }, signal);
          return { content: [{ type: 'text', text: erreurs.length ? `${reponse}\n(Images non affichées : ${erreurs.join(' ; ')})` : reponse }] };
        },
      ),
      // Recherche visuelle : l'agent voit l'image (contenu image du résultat), et elle s'affiche dans le site.
      tool(
        'capturer_page',
        "Prend une capture d'écran d'une page web publique (navigateur isolé, sans compte) et te la montre : page d'un jeu Roblox ou Steam, tendances, visuels… Elle s'affiche aussi chez l'utilisateur.",
        {
          url: z.string().describe('Adresse http(s) publique'),
          legende: z.string().describe('Ce que tu cherches à voir').default(''),
          largeur: z.number().int().min(320).max(2560).default(1366),
          hauteur: z.number().int().min(320).max(4000).default(900),
        },
        async ({ url, legende, largeur, hauteur }) => {
          emettre('outil', { tache: t.id, nom: 'mcp__qg__capturer_page', cible: new URL(url).host }, d.id);
          try {
            const { base64, type } = await capturerPage(url, { largeur, hauteur });
            const p = sauverCapture(d.id, base64, type, legende || tr('Capture de {url}', { url }));
            message(d.id, 'systeme', legende ? tr('{nom} a capturé {url} — {legende}', { nom: t.prenom || t.ref, url, legende }) : tr('{nom} a capturé {url}', { nom: t.prenom || t.ref, url }), [t.etage], [piecePublique(p)]);
            return { content: [{ type: 'image', data: base64, mimeType: type }, { type: 'text', text: `Capture de ${url} (affichée à l'utilisateur).` }] };
          } catch (e) {
            return texte(`Capture impossible : ${e.message}`);
          }
        },
      ),
      tool(
        'telecharger_image',
        "Télécharge une image du web (vignette de jeu, capture, visuel, miniature) pour la regarder ; elle s'affiche aussi chez l'utilisateur.",
        { url: z.string().describe("Adresse http(s) de l'image"), legende: z.string().default('') },
        async ({ url, legende }) => {
          try {
            const { base64, type } = await telechargerImage(url);
            const p = sauverCapture(d.id, base64, type, legende || url);
            message(d.id, 'systeme', legende ? tr('{nom} a trouvé une image : {legende}', { nom: t.prenom || t.ref, legende }) : tr('{nom} a trouvé une image', { nom: t.prenom || t.ref }), [t.etage], [piecePublique(p)]);
            return { content: [{ type: 'image', data: base64, mimeType: type }, { type: 'text', text: `Image de ${url} (affichée à l'utilisateur).` }] };
          } catch (e) {
            return texte(`Image impossible à récupérer : ${e.message}`);
          }
        },
      ),
      // Serveurs longs du sous-sol (rojo serve…) : gérés par le QG, ils survivent à la fin de ta tâche.
      tool('services', "Liste les serveurs longs disponibles pour ton projet (ex. rojo serve) et leur état.", {}, async () => {
        const liste = servicesPublics().filter((s) => s.etage === t.etage);
        return texte(liste.length ? liste.map(resumeService).join('\n') : 'Aucun serveur long défini pour ce projet.');
      }),
      tool(
        'service_demarrer',
        "Démarre un serveur long de ton projet (ex. type 'rojo' = rojo serve, pour que Roblox Studio se synchronise). Il reste allumé après ta tâche. N'utilise jamais Bash pour ça.",
        { type: z.string().describe("Type de service, ex. 'rojo'") },
        async ({ type }) => {
          emettre('service_action', { tache: t.id, service: `${t.etage}:${type}`, action: 'demarrer' }, d.id);
          try {
            const s = await demarrerService(t.etage, type, t.ref);
            message(d.id, 'systeme', s.port ? tr('{ref} a démarré {service} (port {port}) au sous-sol.', { ref: t.ref, service: s.nom, port: s.port }) : tr('{ref} a démarré {service} au sous-sol.', { ref: t.ref, service: s.nom }), [t.etage, 'sous-sol']);
            return texte(`${resumeService(s)}\nDernières lignes :\n${s.dernieresLignes.slice(-8).join('\n')}`);
          } catch (e) {
            return texte(`Impossible de démarrer : ${e.message}`);
          }
        },
      ),
      tool(
        'service_journaux',
        "Lit les dernières lignes du journal d'un serveur long de ton projet.",
        { type: z.string(), lignes: z.number().int().min(1).max(200).default(60) },
        async ({ type, lignes }) => texte(journauxService(t.etage, type, lignes).join('\n') || '(journal vide)'),
      ),
      tool(
        'service_arreter',
        "Arrête un serveur long de ton projet. Seulement si ta mission le demande : l'utilisateur s'en sert peut-être.",
        { type: z.string() },
        async ({ type }) => {
          emettre('service_action', { tache: t.id, service: `${t.etage}:${type}`, action: 'arreter' }, d.id);
          return texte(arreterService(t.etage, type) ? 'Arrêt demandé.' : "Ce serveur n'a pas été lancé par le QG (ou il est déjà arrêté).");
        },
      ),
    ],
  });
}
