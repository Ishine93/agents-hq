// Bibliothèque de phrases (bon enfant, en français et en anglais) : ce que disent les agents selon la situation,
// avec les vraies cibles des outils. Le choix est pseudo-aléatoire mais stable pour une même graine.
// La langue est lue au moment où la phrase est choisie (pas au chargement du module).
import { hacher } from './sprites.js';
import { t as tr, langueCourante } from './i18n.js';

const choisir = (liste, graine) => liste[hacher(String(graine)) % liste.length];
const enAnglais = () => langueCourante() === 'en';
// Liste française ou anglaise selon la langue de l'interface.
const L = (fr, en) => (enAnglais() ? en : fr);

function nomFichier(c) {
  const s = String(c || '').replace(/\\/g, '/').trim();
  if (!s) return '';
  const dernier = s.split(/[\s]/)[0].split('/').filter(Boolean).pop() || s;
  return dernier.length > 26 ? dernier.slice(0, 25) + '…' : dernier;
}
function domaine(c) {
  const m = String(c || '').match(/^[a-z]+:\/\/([^/?#]+)/i);
  const d = m ? m[1] : String(c || '').split('/')[0];
  return d.replace(/^www\./, '') || L('la page', 'the page');
}
function court(c, n = 30) {
  const s = String(c || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
// « store.steampowered.com » → « la page Steam » quand on reconnaît le site.
const SITES = [[/steam/i, 'Steam', 'la page Steam', 'the Steam page'], [/roblox|rbxcdn/i, 'Roblox', 'la page Roblox', 'the Roblox page'],
  [/youtube|ytimg/i, 'YouTube', 'la vidéo YouTube', 'the YouTube video'], [/github/i, 'GitHub', 'la page GitHub', 'the GitHub page'],
  [/reddit|redd\.it/i, 'Reddit', 'le fil Reddit', 'the Reddit thread'], [/wikipedia/i, 'Wikipédia', 'la page Wikipédia', 'the Wikipedia page'],
  [/itch\.io/i, 'itch.io', 'la page itch.io', 'the itch.io page']];
function nomSite(d) {
  for (const [re, , page, pageEn] of SITES) if (re.test(d)) return L(page, pageEn);
  return d;
}
function marque(d) {
  for (const [re, nom] of SITES) if (re.test(d)) return nom;
  return d;
}

// Phrase pour un appel d'outil : { icone, texte } (l'icône est choisie ailleurs).
export function phraseOutil(nom, cible, graine) {
  const n = String(nom || '');
  const b = n.toLowerCase();
  const f = nomFichier(cible);
  const g = graine + '|' + n + '|' + cible;
  if (n === 'Read' || n === 'NotebookRead') {
    return choisir(L([`Je lis ${f}`, `Voyons voir ${f}…`, `Petit coup d'œil à ${f}`, `J'épluche ${f}`], [`Reading ${f}`, `Let's see ${f}…`, `Quick peek at ${f}`, `Going through ${f}`]), g);
  }
  if (n === 'Write') return choisir(L([`J'écris ${f}`, `Je rédige ${f}`, `Nouveau fichier : ${f}`], [`Writing ${f}`, `Drafting ${f}`, `New file: ${f}`]), g);
  if (n === 'Edit' || n === 'MultiEdit' || n === 'NotebookEdit') {
    return choisir(L([`Je retouche ${f}`, `Quelques retouches dans ${f}`, `Coup de pinceau sur ${f}`, `J'ajuste ${f}`], [`Touching up ${f}`, `A few tweaks in ${f}`, `A lick of paint on ${f}`, `Adjusting ${f}`]), g);
  }
  if (n === 'Grep') {
    return choisir(L([`Je cherche « ${court(cible, 22)} »`, `Où se cache « ${court(cible, 20)} » ?`, `Je fouille le code…`], [`Looking for “${court(cible, 22)}”`, `Where's “${court(cible, 20)}” hiding?`, `Digging through the code…`]), g);
  }
  if (n === 'Glob' || n === 'LS') return choisir(L([`Je fais le tour des fichiers`, `Inventaire : ${court(cible, 22)}`], [`Browsing the files`, `Inventory: ${court(cible, 22)}`]), g);
  if (n === 'WebSearch') return choisir(L([`Je cherche : ${court(cible, 26)}…`, `Je demande au web : ${court(cible, 22)}`], [`Searching: ${court(cible, 26)}…`, `Asking the web: ${court(cible, 22)}`]), g);
  if (n === 'WebFetch') return choisir(L([`Je consulte ${domaine(cible)}`, `Je lis ${domaine(cible)}`], [`Checking ${domaine(cible)}`, `Reading ${domaine(cible)}`]), g);
  if (b === 'mcp__qg__capturer_page') return L(`Je capture ${nomSite(domaine(cible))}`, `Capturing ${nomSite(domaine(cible))}`);
  if (b === 'mcp__qg__telecharger_image') {
    return choisir(L([`Je télécharge une image (${marque(domaine(cible))})`, `Je récupère une image de ${marque(domaine(cible))}`], [`Downloading an image (${marque(domaine(cible))})`, `Grabbing an image from ${marque(domaine(cible))}`]), g);
  }
  if (b === 'mcp__qg__montrer') return choisir(L(['Je te montre ça', 'Regarde un peu ça !'], ['Let me show you this', 'Check this out!']), g);
  if (b === 'mcp__qg__demander') return choisir(L(["J'ai une question pour toi", 'Ton avis compte !'], ['I have a question for you', 'Your opinion matters!']), g);
  if (b.startsWith('mcp__qg__service')) return choisir(L(['Je passe par la salle des serveurs', 'Un tour au sous-sol'], ['Swinging by the server room', 'A trip to the basement']), g);
  if (b.startsWith('mcp__') && /roblox|studio/.test(b)) return choisir(L(['Je pilote Studio', 'Studio, à nous deux !', 'Je teste dans Studio'], ["I'm driving Studio", "Studio, it's you and me!", 'Testing in Studio']), g);
  if (b.startsWith('mcp__') && /unreal/.test(b)) return choisir(L(["J'ouvre l'éditeur Unreal", 'Unreal, au travail !'], ['Opening the Unreal editor', 'Unreal, get to work!']), g);
  if (n === 'Bash' || n === 'PowerShell') {
    const c = String(cible || '');
    if (/test|jest|vitest|pytest|runtests|spec/i.test(c)) {
      return choisir(L(['Je lance les tests… croisez les doigts', 'Allez les tests, au vert !', 'Moment de vérité : les tests'], ['Running the tests… fingers crossed', 'Come on tests, go green!', 'Moment of truth: the tests']), g);
    }
    if (/selene|lint|stylua|eslint/i.test(c)) return choisir(L(['Je passe un coup de lint', 'Contrôle du style…'], ['Running a quick lint', 'Style check…']), g);
    if (/build|compile|msbuild|unrealeditor|rojo build/i.test(c)) return choisir(L(['Je compile, ça chauffe…', 'Build en cours…'], ["Compiling, it's heating up…", 'Build in progress…']), g);
    if (/npm (i|install)|pip install|add /i.test(c)) return choisir(L([`J'installe ${court(c.split(' ').pop(), 22)}`, 'Petite installation…'], [`Installing ${court(c.split(' ').pop(), 22)}`, 'Quick install…']), g);
    if (/^git /i.test(c)) return choisir(L([`Je consulte git ${c.split(' ')[1] || ''}`.trim(), "Je regarde l'historique"], [`Checking git ${c.split(' ')[1] || ''}`.trim(), 'Looking at the history']), g);
    return choisir(L([`$ ${court(c, 26)}`, 'Petite commande…'], [`$ ${court(c, 26)}`, 'Quick command…']), g);
  }
  if (n === 'TodoWrite') return choisir(L(['Je fais ma liste', 'Je range mes idées'], ['Making my list', 'Sorting out my ideas']), g);
  return court(n, 24);
}

const PHRASES = {
  briefingDg: ['{p}, tu prends {t} ?', '{p}, je te confie {t}.', '{p}, ça te dit : {t} ?', '{p}, à toi : {t} !'],
  briefingAgent: ["Je m'occupe de ça !", "C'est parti !", 'Compte sur moi.', 'Ça marche, chef !', 'Avec plaisir !'],
  reembauche: ['Je connais ce code !', 'Je reprends du service !', 'Ah, mon vieux projet !'],
  fini: ['Mission accomplie !', 'Et voilà le travail !', 'Plié !', 'Terminé, je pose ça ici.'],
  bloque: ['Presque… il manque un détail', 'Fait, avec une réserve'],
  echec: ['Aïe, je coince…', 'Là, je bloque.', 'Houston, on a un problème.'],
  rework: ['Ok, je corrige ça', 'Bien vu, je reprends', "Retour à l'établi"],
  attente: ['Je prends un café en attendant {p}', "J'attends {p}, rien ne presse", '{p} bosse, moi je savoure mon café'],
  attenteSans: ['Je prends un café en attendant', 'Petite pause, je suis prêt'],
  autorisation: ['Je peux ?', 'Une petite autorisation ?'],
  verifDebut: ['Voyons ce travail…', 'Je sors ma loupe'],
  verifOk: ['Impeccable !', 'Rien à redire.'],
  verifKo: ['Il reste à revoir…', 'Presque, mais non.'],
  reactionsBlague: ['Haha !', 'Elle est nulle… mais je ris', 'Excellent !', 'Je la ressortirai', 'Ouh là…', 'Pas mal !'],
  reactionsFait: ['Ah bon ?', "Je l'ignorais !", 'Fascinant.', 'Comme quoi !'],
  reponsesBavardage: ['Carrément !', 'Tu m’étonnes.', 'Ah bon ?', 'Haha, pas faux !', 'Moi je dis : café.', 'Bien dit.', 'On en reparle au déjeuner ?', "C'est clair."],
  ambiance: ['Il fait beau aujourd’hui, non ?', 'Ce café a un goût de vendredi.', 'Vivement le week-end !', 'Quelqu’un a vu mon stylo ?', 'La machine à café fait un drôle de bruit.'],
  joyPassage: ['Courage, l’équipe !', 'Qui veut un café ?', 'Souriez, vous codez !', 'Je passe juste dire bonjour !', 'Tout roule par ici ?', 'Pensez à boire de l’eau !'],
};

// Mêmes situations, en anglais (mêmes repères {p} et {t}).
const PHRASES_EN = {
  briefingDg: ['{p}, can you take {t}?', "{p}, I'm handing you {t}.", '{p}, fancy {t}?', '{p}, over to you: {t}!'],
  briefingAgent: ["I'm on it!", "Let's go!", 'Count on me.', 'You got it, boss!', 'With pleasure!'],
  reembauche: ['I know this code!', 'Back in action!', 'Ah, my old project!'],
  fini: ['Mission accomplished!', 'And there you have it!', 'Done and dusted!', 'Finished, leaving this here.'],
  bloque: ['Almost… one detail missing', 'Done, with a caveat'],
  echec: ["Ouch, I'm stuck…", "I'm stuck here.", 'Houston, we have a problem.'],
  rework: ["OK, I'll fix that", 'Good catch, back at it', 'Back to the workbench'],
  attente: ['Grabbing a coffee while I wait for {p}', 'Waiting for {p}, no rush', "{p}'s working, I'm enjoying my coffee"],
  attenteSans: ['Grabbing a coffee while I wait', "Quick break, I'm ready"],
  autorisation: ['May I?', 'A quick permission?'],
  verifDebut: ["Let's see this work…", 'Out comes my magnifying glass'],
  verifOk: ['Spotless!', 'Nothing to add.'],
  verifKo: ['Still needs work…', 'Close, but no.'],
  reactionsBlague: ['Haha!', "It's terrible… but I'm laughing", 'Brilliant!', "I'm stealing that one", 'Oh dear…', 'Not bad!'],
  reactionsFait: ['Really?', "I didn't know that!", 'Fascinating.', 'Who knew!'],
  reponsesBavardage: ['Totally!', 'You bet.', 'Really?', 'Haha, fair point!', 'I say: coffee.', 'Well said.', 'Talk about it over lunch?', 'For sure.'],
  ambiance: ["Lovely weather today, isn't it?", 'This coffee tastes like Friday.', "Can't wait for the weekend!", 'Has anyone seen my pen?', 'The coffee machine is making a funny noise.'],
  joyPassage: ['Keep it up, team!', 'Who wants a coffee?', "Smile, you're coding!", 'Just popping by to say hi!', 'All good over here?', 'Remember to drink some water!'],
};

// Réserve minimale si le serveur n'a encore rien récolté.
export const BLAGUES_SECOURS = [
  { setup: 'Pourquoi les développeurs confondent Halloween et Noël ?', chute: 'Parce que OCT 31 = DEC 25.' },
  { setup: 'Que dit un pixel à un autre pixel ?', chute: "On se voit à l'écran !" },
  { setup: 'Combien de développeurs faut-il pour changer une ampoule ?', chute: "Aucun, c'est un problème matériel." },
];
export const FAITS_SECOURS = ['Le premier jeu vidéo commercial, Computer Space, est sorti en 1971.', 'Une loutre de mer range sa pierre préférée dans une poche sous son bras.'];
const BLAGUES_SECOURS_EN = [
  { setup: 'Why do programmers mix up Halloween and Christmas?', chute: 'Because OCT 31 = DEC 25.' },
  { setup: 'What did one pixel say to the other?', chute: 'See you on screen!' },
  { setup: 'How many programmers does it take to change a light bulb?', chute: "None, that's a hardware problem." },
];
const FAITS_SECOURS_EN = ['The first commercial video game, Computer Space, came out in 1971.', 'Sea otters keep their favourite rock in a pouch under their arm.'];
// Réserves dans la langue de l'interface.
export const blaguesSecours = () => L(BLAGUES_SECOURS, BLAGUES_SECOURS_EN);
export const faitsSecours = () => L(FAITS_SECOURS, FAITS_SECOURS_EN);

// ['Hugo', 'Inès', 'Marc'] → « Hugo, Inès et Marc »
export function enumerer(noms) {
  const l = (noms || []).filter(Boolean);
  if (l.length <= 1) return l[0] || '';
  return tr('{debut} et {fin}', { debut: l.slice(0, -1).join(', '), fin: l[l.length - 1] });
}

function listeDe(sorte) {
  return (enAnglais() && PHRASES_EN[sorte]) || PHRASES[sorte] || [];
}

export function phrase(sorte, graine, vars = {}) {
  const liste = listeDe(sorte);
  if (!liste.length) return '';
  return choisir(liste, graine + '|' + sorte).replace(/\{(\w)\}/g, (_, k) => vars[k] || '');
}

export function liste(sorte) {
  return listeDe(sorte);
}

// « Bench du pathfinding » → « le bench du pathfinding » (pour les phrases du DG).
// En anglais : « The pathfinding bench » → « the pathfinding bench », sinon le titre entre guillemets.
export function sujet(titre) {
  const t = String(titre || '').trim();
  if (enAnglais()) {
    if (!t) return 'this';
    const debutEn = t.charAt(0).toLowerCase() + t.slice(1);
    return /^(the|a|an)\b/i.test(debutEn) ? court(debutEn, 34) : court('“' + t + '”', 36);
  }
  if (!t) return 'ça';
  const debut = t.charAt(0).toLowerCase() + t.slice(1);
  return /^(le|la|les|l'|un|une|des|du)\b/i.test(debut) ? court(debut, 34) : court('« ' + t + ' »', 36);
}
