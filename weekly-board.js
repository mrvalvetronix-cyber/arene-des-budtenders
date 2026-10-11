// Tableau hebdomadaire — les 🪙 cumulés de toutes les parties,
// remis à zéro chaque dimanche à 00h01 (heure de Toronto).
const fs = require('fs');
const path = require('path');
const BOARD_FILE = process.env.BOARD_FILE || path.join(__dirname, 'scores-hebdo.json');

function cleanName(n, max) {
  return String(n || '').trim().replace(/\s+/g, ' ').slice(0, max || 16) || 'Joueur';
}

function torontoParts(d) {
  const p = {};
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  });
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return p;
}

// Identifiant de la semaine en cours : la date (AAAA-MM-JJ) du dimanche 00h01
// qui l'a ouverte, en heure de Toronto. Avant dimanche 00h01, on est encore
// dans la semaine précédente.
function currentWeekId(d) {
  const p = torontoParts(d || new Date());
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  const w = (wd === undefined) ? 0 : wd;
  let back = w;
  if (w === 0 && p.hour === '00' && p.minute === '00') back = 7;
  const dt = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

function loadBoard() {
  try {
    const b = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
    if (b && typeof b === 'object' && b.totals && typeof b.totals === 'object') return b;
  } catch (e) { /* absent ou corrompu → on repart à zéro */ }
  return { weekId: null, totals: {} };
}

/* Cache mémoire : currentBoard()/recordScores()/boardTop() sont appelés à
   chaque message get_board et à chaque fin de partie. On évite la relecture
   + le JSON.parse du fichier à chaque appel en le gardant en mémoire, avec
   revalidation par stat (mtime/ctime/taille) pour détecter toute écriture
   externe (autre processus, édition manuelle, tests). */
let cache = null;
let cacheStamp = null;
function stampOf() {
  try {
    const s = fs.statSync(BOARD_FILE);
    return { m: s.mtimeMs, c: s.ctimeMs, z: s.size };
  } catch (e) { return null; }
}
function boardCached() {
  const st = stampOf();
  if (cache && st && cacheStamp &&
      st.m === cacheStamp.m && st.c === cacheStamp.c && st.z === cacheStamp.z) {
    return cache;
  }
  cache = loadBoard();
  cacheStamp = st;
  return cache;
}

function saveBoard(b) {
  try { fs.writeFileSync(BOARD_FILE, JSON.stringify(b)); }
  catch (e) { console.error('tableau hebdo — sauvegarde:', e.message); }
  cache = b;
  cacheStamp = stampOf();
}

// Retourne le tableau de la semaine en cours, en le réinitialisant si on a
// changé de semaine (dimanche 00h01 heure de Toronto).
function currentBoard() {
  const b = boardCached();
  const id = currentWeekId();
  if (b.weekId !== id) {
    b.weekId = id;
    b.totals = {};
    saveBoard(b);
  }
  return b;
}

// Ajoute les 🪙 d'une partie terminée au cumul hebdomadaire.
function recordScores(players, winnerName) {
  const b = currentBoard();
  for (const p of players || []) {
    const n = cleanName(p.name, 24);
    const e = b.totals[n] || (b.totals[n] = { coins: 0, wins: 0, games: 0 });
    e.coins += Math.max(0, Math.floor(Number(p.coins) || 0));
    e.games += 1;
    if (winnerName && n === winnerName) e.wins += 1;
  }
  saveBoard(b);
  return b;
}

// Top N de la semaine, trié par 🪙.
function boardTop(n) {
  const b = currentBoard();
  return Object.entries(b.totals)
    .map(([name, s]) => ({ name, coins: s.coins | 0, wins: s.wins | 0, games: s.games | 0 }))
    .sort((x, y) => y.coins - x.coins || x.name.localeCompare(y.name))
    .slice(0, n || 10);
}

module.exports = { BOARD_FILE, currentWeekId, loadBoard, saveBoard, currentBoard, recordScores, boardTop };
