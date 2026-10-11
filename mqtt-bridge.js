'use strict';
/* Pont multijoueur « L’arène des budtender » — logique de jeu identique à server.js,
   transport MQTT via le relais public EMQX (wss://broker.emqx.io:8084/mqtt).
   Le client (artefact statique) parle directement au relais ; ce pont fait autorité. */
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const DATA = require('./game-data.js');
const BOARD = require('./weekly-board.js');

/* ---------- Journal des plantages : garde la trace AVANT de mourir ----------
   Le chien de garde relance le pont en cas d'arrêt, mais /tmp/bridge.log est
   réécrit à chaque redémarrage : sans ce journal, la cause du plantage est
   perdue. On consigne la pile d'appels dans crash.log (persistant), puis on
   quitte comme avant pour laisser le chien de garde relancer proprement. */
const CRASH_LOG = path.join(__dirname, 'crash.log');
function logCrash(kind, err) {
  try {
    fs.appendFileSync(CRASH_LOG,
      `[${new Date().toISOString()}] ${kind}: ${(err && err.stack) || err}\n`);
  } catch (_) { /* dernier recours : ne jamais masquer le plantage */ }
}
process.on('uncaughtException', (e) => { logCrash('uncaughtException', e); process.exit(1); });
process.on('unhandledRejection', (e) => { logCrash('unhandledRejection', e); process.exit(1); });


/* ---------- Comptes (gamertag + mot de passe) ---------- */
const crypto = require('crypto');
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')) || {}; }
catch (e) { accounts = {}; }
let accountsDirty = false;
setInterval(() => {
  if (!accountsDirty) return;
  accountsDirty = false;
  try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts)); }
  catch (e) { console.error('accounts save:', e.message); }
}, 5000);
const sessions = new Map(); // token -> gamertag
const authAttempts = new Map(); // cid -> { n, reset }

function cleanTag(t) {
  return String(t || '').trim().replace(/\s+/g, ' ').slice(0, 16);
}
function hashPw(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
function authOk(cid, tag) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, tag);
  if (sessions.size > 5000) { const k = sessions.keys().next().value; sessions.delete(k); }
  sendTo(cid, { t: 'auth_ok', gamertag: tag, stats: accounts[tag].stats, token });
}
function authRate(cid) {
  const now = Date.now();
  let a = authAttempts.get(cid);
  if (!a || now > a.reset) { a = { n: 0, reset: now + 60000 }; authAttempts.set(cid, a); }
  a.n++;
  /* Purge opportuniste : les entrées expirées ne servent plus (une fenêtre
     dépassée est réinitialisée à la prochaine tentative de toute façon) —
     évite que la Map ne croisse indéfiniment avec les cid éphémères. */
  if (authAttempts.size > 1000) {
    for (const [k, v] of authAttempts) if (now > v.reset) authAttempts.delete(k);
  }
  return a.n <= 10;
}
function handleAuth(cid, m) {
  if (!authRate(cid)) { sendTo(cid, { t: 'auth_error', msg: 'Trop de tentatives, réessaie dans une minute.' }); return; }
  if (m.t === 'me') {
    const tag = sessions.get(String(m.token || ''));
    if (tag && accounts[tag]) { sendTo(cid, { t: 'auth_ok', gamertag: tag, stats: accounts[tag].stats, token: m.token }); }
    else sendTo(cid, { t: 'auth_error', msg: 'Session expirée.' });
    return;
  }
  const tag = cleanTag(m.gamertag);
  const pw = String(m.password || '');
  if (tag.length < 3) { sendTo(cid, { t: 'auth_error', msg: 'Gamertag : 3 lettres minimum.' }); return; }
  if (pw.length < 4) { sendTo(cid, { t: 'auth_error', msg: 'Mot de passe : 4 caractères minimum.' }); return; }
  if (pw.length > 72) { sendTo(cid, { t: 'auth_error', msg: 'Mot de passe trop long.' }); return; }
  if (m.t === 'register') {
    if (accounts[tag]) { sendTo(cid, { t: 'auth_error', msg: 'Ce gamertag est déjà pris.' }); return; }
    const salt = crypto.randomBytes(16).toString('hex');
    accounts[tag] = { salt, hash: hashPw(pw, salt), created: Date.now(),
      stats: { games: 0, wins: 0, bestStreak: 0, coins: 0 } };
    accountsDirty = true;
    authOk(cid, tag);
    return;
  }
  if (m.t === 'login') {
    const acc = accounts[tag];
    const ok = acc && crypto.timingSafeEqual(Buffer.from(acc.hash, 'hex'), Buffer.from(hashPw(pw, acc.salt), 'hex'));
    if (!ok) { sendTo(cid, { t: 'auth_error', msg: 'Gamertag ou mot de passe incorrect.' }); return; }
    authOk(cid, tag);
    return;
  }
}
/* Lie le token de session au joueur (create/join) */
function linkToken(player, m) {
  const tag = sessions.get(String(m.token || ''));
  if (tag && accounts[tag]) player.gamertag = tag;
}
/* Stats persistantes en fin de partie */
function recordAccountStats(players, winnerName) {
  let changed = false;
  for (const p of players) {
    if (!p.gamertag || !accounts[p.gamertag]) continue;
    const st = accounts[p.gamertag].stats;
    st.games++;
    st.coins += (p.coins || 0);
    if ((p.bestStreak || 0) > (st.bestStreak || 0)) st.bestStreak = p.bestStreak;
    if (winnerName && p.name === winnerName) st.wins++;
    changed = true;
  }
  if (changed) accountsDirty = true;
}

/* ---------- Connexion Google (Google Identity Services) ----------
   Le client envoie le jeton ID (credential GIS) via MQTT ; on le vérifie
   auprès de Google avant de retrouver/créer le compte lié. */
const GOOGLE_CLIENT_ID = '90665097871-pk0t2vshc5c22h6e86l9he2nvv0unltb.apps.googleusercontent.com';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/* Vérifie un jeton ID Google via le point tokeninfo. Ne lève jamais :
   renvoie { ok:true, sub, email, name } ou { ok:false, msg }. */
async function verifyGoogleToken(idToken) {
  const tok = String(idToken || '').slice(0, 4096);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(tok))
    return { ok: false, msg: 'Jeton Google invalide.' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok),
      { signal: ctrl.signal });
    if (!res.ok) return { ok: false, msg: 'Jeton Google refusé.' };
    const info = await res.json();
    if (!info || typeof info !== 'object') return { ok: false, msg: 'Réponse Google invalide.' };
    if (info.aud !== GOOGLE_CLIENT_ID) return { ok: false, msg: 'Jeton émis pour une autre application.' };
    if (!GOOGLE_ISSUERS.has(String(info.iss))) return { ok: false, msg: 'Émetteur du jeton inconnu.' };
    const exp = Number(info.exp);
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return { ok: false, msg: 'Jeton Google expiré.' };
    const sub = String(info.sub || '');
    if (!sub) return { ok: false, msg: 'Jeton Google incomplet.' };
    return { ok: true, sub, email: String(info.email || ''), name: String(info.name || '') };
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return { ok: false, msg: aborted ? 'Google ne répond pas, réessaie.' : 'Vérification Google impossible.' };
  } finally { clearTimeout(timer); }
}
/* Gamertag à partir du nom Google, suffixé en cas de collision. */
function tagForGoogle(name) {
  const base = cleanTag(name) || 'Gladiateur';
  if (!accounts[base]) return base;
  for (let i = 2; i < 1000; i++) {
    const t = (base + ' ' + i).slice(0, 16);
    if (!accounts[t]) return t;
  }
  return (base + ' ' + Date.now().toString(36)).slice(0, 16);
}
function handleGoogleLogin(cid, m) {
  if (!authRate(cid)) { sendTo(cid, { t: 'auth_error', msg: 'Trop de tentatives, réessaie dans une minute.' }); return; }
  verifyGoogleToken(m.idToken).then((v) => {
    if (!v.ok) { sendTo(cid, { t: 'auth_error', msg: v.msg }); return; }
    let tag = null;
    for (const t of Object.keys(accounts)) {
      if (accounts[t] && accounts[t].googleSub === v.sub) { tag = t; break; }
    }
    if (!tag) {
      tag = tagForGoogle(v.name);
      accounts[tag] = { googleSub: v.sub, email: v.email, created: Date.now(),
        stats: { games: 0, wins: 0, bestStreak: 0, coins: 0 } };
      accountsDirty = true;
    }
    authOk(cid, tag);
  }).catch((e) => {
    console.error('google-login:', e && e.message);
    sendTo(cid, { t: 'auth_error', msg: 'Vérification Google impossible.' });
  });
}

/* ---------- Banque de questions du duel (renouvelée chaque dimanche) ---------- */
const DUEL_BANK_FILE = path.join(__dirname, 'duel-bank.json');
function validDuelQ(q) {
  return q && typeof q.q === 'string' && q.q.length > 4 &&
    Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every(o => typeof o === 'string' && o.length > 0) &&
    Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3 &&
    Number.isInteger(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 4 &&
    typeof q.cat === 'string' && q.cat.length > 0;
}
function loadDuelBank() {
  try {
    const arr = JSON.parse(fs.readFileSync(DUEL_BANK_FILE, 'utf8'));
    if (Array.isArray(arr) && arr.length >= 20 && arr.every(validDuelQ)) {
      console.log(`📚 Banque duel chargée : ${arr.length} questions`);
      return arr;
    }
    console.error('📚 duel-bank.json invalide — repli sur game-data.js');
  } catch (e) {
    console.error('📚 duel-bank.json illisible — repli sur game-data.js :', e.message);
  }
  return DATA.duelQuestions || [];
}
let DUEL_BANK = loadDuelBank();
// Rechargement à chaud : les nouveaux duels utilisent la nouvelle banque,
// les duels en cours gardent leurs questions. Aucun redémarrage requis.
try {
  fs.watchFile(DUEL_BANK_FILE, { interval: 5000 }, () => {
    const nb = loadDuelBank();
    if (nb && nb.length >= 20) { DUEL_BANK = nb; console.log('📚 Banque duel rechargée à chaud 🔥'); }
  });
} catch (e) { console.error('📚 surveillance duel-bank.json :', e.message); }

/* ---------- Banque de questions du duel — version anglaise ---------- */
const DUEL_BANK_EN_FILE = path.join(__dirname, 'duel-bank-en.json');
function loadDuelBankEn() {
  try {
    const arr = JSON.parse(fs.readFileSync(DUEL_BANK_EN_FILE, 'utf8'));
    if (Array.isArray(arr) && arr.length >= 20 && arr.every(validDuelQ)) {
      console.log(`📚 EN duel bank loaded: ${arr.length} questions`);
      return arr;
    }
    console.error('📚 duel-bank-en.json invalid');
  } catch (e) {
    console.error('📚 duel-bank-en.json not loaded:', e.message);
  }
  return [];
}
let DUEL_BANK_EN = loadDuelBankEn();
try {
  fs.watchFile(DUEL_BANK_EN_FILE, { interval: 5000 }, () => {
    const nb = loadDuelBankEn();
    if (nb && nb.length >= 20) { DUEL_BANK_EN = nb; console.log('📚 EN duel bank hot-reloaded 🔥'); }
  });
} catch (e) { console.error('📚 watch duel-bank-en.json:', e.message); }

/* Banque selon la langue de la salle ('en' ou 'fr', défaut 'fr') */
function bankFor(room) {
  const b = (room && room.settings && room.settings.lang === 'en') ? DUEL_BANK_EN : DUEL_BANK;
  return (b && b.length) ? b : DUEL_BANK;
}

const NS = 'budtender/v1';

/* Libellé de saison du tableau hebdo : « Semaine du 11 octobre 2026 » à
   partir du weekId (date du dimanche d'ouverture, AAAA-MM-JJ). */
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function seasonLabel(weekId) {
  const p = String(weekId || '').split('-');
  if (p.length !== 3) return 'Semaine en cours';
  const m = MOIS_FR[parseInt(p[1], 10) - 1];
  if (!m) return 'Semaine en cours';
  return 'Semaine du ' + parseInt(p[2], 10) + ' ' + m + ' ' + p[0];
}
const LOBBY = NS + '/lobby';
const STATUS_WILD = NS + '/c/+/status';
const UP_WILD = NS + '/r/+/up';
const inboxOf = (cid) => NS + '/c/' + cid + '/down';
const roomUpOf = (code) => NS + '/r/' + code + '/up';
const roomDownOf = (code) => NS + '/r/' + code + '/down';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TEAM_COLORS = ['#c65b8f', '#4d9db5', '#8a6fd6', '#d0693c', '#5da85f', '#c9a13b'];
const LOBBY_GRACE_MS = 12000;

const rooms = new Map();   // code -> room
const clients = new Map(); // cid -> ctx { cid, room, player }

// Cooldown revanche : après une revanche terminée, il faut attendre ce délai
// avant de pouvoir redéfier LA MÊME personne (clé = paire de noms triés).
// Surchargeable pour les tests via REMATCH_COOLDOWN_MIN (minutes, défaut 20).
const REMATCH_COOLDOWN_MS = Math.max(5000, (parseFloat(process.env.REMATCH_COOLDOWN_MIN) || 20) * 60000);
const rematchCooldowns = new Map(); // "pairKey" -> timestamp ms à partir duquel une revanche est de nouveau possible
function pairKey(a, b) { return JSON.stringify([a, b].sort()); }

/* ---------- MQTT ---------- */
function proxyAgent() {
  const p = process.env.https_proxy || process.env.HTTPS_PROXY ||
            process.env.http_proxy || process.env.HTTP_PROXY;
  if (!p) return undefined;
  const { HttpsProxyAgent } = require('https-proxy-agent');
  return new HttpsProxyAgent(p);
}
const agent = proxyAgent();
const mq = mqtt.connect(process.env.MQTT_BROKER || 'wss://broker.emqx.io:8084/mqtt', {
  clientId: 'budtender-bridge-' + Math.random().toString(36).slice(2, 10),
  clean: true, reconnectPeriod: 3000, connectTimeout: 20000,
  wsOptions: agent ? { agent, handshakeTimeout: 20000 } : { handshakeTimeout: 20000 },
  keepalive: 30
});

mq.on('connect', () => {
  console.log('🌉 Pont connecté au relais MQTT');
  mq.subscribe([LOBBY, STATUS_WILD, UP_WILD], { qos: 1 }, (err) => {
    if (err) console.error('subscribe err:', err.message);
    else console.log('📡 Abonné : lobby, statuts, salles');
  });
});
mq.on('reconnect', () => console.log('… reconnexion au relais …'));
mq.on('error', (e) => console.error('MQTT erreur:', e.message));

function sendTo(cid, msg) {
  if (!cid) return;
  mq.publish(inboxOf(cid), JSON.stringify(msg), { qos: 1 });
}
function broadcast(room, msg, exceptCid) {
  if (exceptCid) msg.xcid = exceptCid;
  mq.publish(roomDownOf(room.code), JSON.stringify(msg), { qos: 1 });
  if (exceptCid) delete msg.xcid;
}

/* ---------- Utilitaires (repris de server.js) ---------- */
function makeCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return rooms.has(c) ? makeCode() : c;
}
function shuffled(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function cleanName(n, max) { return String(n || '').trim().replace(/\s+/g, ' ').slice(0, max || 16) || 'Joueur'; }
function uniqueName(room, base) {
  base = cleanName(base);
  const taken = new Set([...room.players.values()].map(p => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has((base + ' ' + i).toLowerCase())) i++;
  return base + ' ' + i;
}

/* ---------- État des salles ---------- */
function newRoom(hostPlayer, settings) {
  const code = makeCode();
  const mode = settings.mode === 'tours' ? 'tours' : (settings.mode === 'duel' ? 'duel' : 'simu');
  const room = {
    code, phase: 'lobby',
    settings: {
      mode,
      lang: settings.lang === 'en' ? 'en' : 'fr',
      teams: mode === 'duel' ? false : !!settings.teams,
      maxPlayers: mode === 'duel' ? 2 : Math.min(16, Math.max(2, parseInt(settings.maxPlayers, 10) || 8))
    },
    players: new Map(), order: [],
    teams: [Object.assign({}, DATA.teamPresets[0]), Object.assign({}, DATA.teamPresets[1])],
    hostId: hostPlayer.id,
    deck: [], turnIdx: 0, turnOrder: [], turnTimer: null, turnLock: false,
    currentAnswer: -1, lastTurn: null, createdAt: Date.now(),
    duel: null
  };
  addPlayer(room, hostPlayer);
  rooms.set(code, room);
  return room;
}
function smallestTeam(room) {
  let best = 0, bestCount = Infinity;
  room.teams.forEach((t, i) => {
    const c = [...room.players.values()].filter(p => p.team === i).length;
    if (c < bestCount) { bestCount = c; best = i; }
  });
  return best;
}
function addPlayer(room, player) {
  player.name = uniqueName(room, player.name);
  player.team = -1; player.coins = 0; player.correct = 0;
  player.progress = 0; player.finished = false; player.connected = true;
  delete player.graceTimer;
  room.players.set(player.id, player);
  room.order.push(player.id);
  if (room.settings.teams) player.team = smallestTeam(room);
}
function snapshot(room) {
  const players = [...room.players.values()].map(p => ({
    name: p.name, team: p.team, coins: p.coins, correct: p.correct,
    progress: p.progress, finished: p.finished, connected: p.connected, isHost: p.id === room.hostId
  }));
  players.sort((a, b) => b.coins - a.coins || a.name.localeCompare(b.name));
  const teams = room.teams.map((t, i) => {
    const members = players.filter(p => p.team === i);
    return { name: t.name, color: t.color, emoji: t.emoji || '', score: members.reduce((s, p) => s + p.coins, 0), count: members.length };
  });
  return { t: 'state', code: room.code, phase: room.phase, mode: room.settings.mode, teamsEnabled: room.settings.teams, maxPlayers: room.settings.maxPlayers, players, teams };
}
function sendState(room) { broadcast(room, snapshot(room)); }

/* ---------- Déroulement (mode tour par tour) ---------- */
function turnQuestion(item) {
  if (item.kind === 'bank') {
    // Questions de la banque du duel (972) : mêmes questions dans les 3 modes.
    return { kind: 'quiz', source: item.cat, prompt: item.q, options: item.options, answer: item.answer, success: 'Bonne réponse!', fail: 'Pas cette fois — la prochaine sera la bonne.', reward: DATA.quizReward };
  }
  if (item.kind === 'quiz') {
    const z = DATA.quiz[item.id];
    return { kind: 'quiz', source: z.source, prompt: z.q, options: z.a, answer: z.ok, success: z.fact, fail: 'Pas cette fois — la prochaine sera la bonne.', reward: DATA.quizReward };
  }
  const q = DATA.quests[item.id];
  if (q.consultation) {
    return { kind: 'quest', title: q.title, speech: q.speech, prompt: 'Choisis la recommandation la plus adaptée.', options: q.consultation.options, answer: q.consultation.answer, success: q.consultation.success, fail: q.consultation.fail, reward: q.reward };
  }
  return { kind: 'quest', title: q.title, speech: q.speech, prompt: q.prompt, options: q.options, answer: q.answer, success: q.success, fail: q.fail, reward: q.reward };
}
function activePlayer(room) { return room.players.get(room.turnOrder[room.turnIdx % room.turnOrder.length]); }
function dealTurn(room) {
  if (room.phase !== 'play') return;
  let guard = 0;
  while (guard++ <= room.turnOrder.length) {
    const p = activePlayer(room);
    if (p && p.connected) break;
    room.turnIdx++;
  }
  if (room.turnIdx >= room.deck.length) { endGame(room); return; }
  const item = room.deck[room.turnIdx];
  const q = turnQuestion(item);
  room.currentAnswer = q.answer;
  const player = activePlayer(room);
  const payload = {
    t: 'turn', player: player.name, turn: room.turnIdx + 1, total: room.deck.length,
    question: { kind: q.kind, title: q.title || null, speech: q.speech || null, source: q.source || null, prompt: q.prompt, options: q.options },
    deadline: Date.now() + DATA.turnMs
  };
  room.lastTurn = payload;
  room.turnLock = false;
  broadcast(room, payload);
  clearTimeout(room.turnTimer);
  room.turnTimer = setTimeout(() => resolveTurn(room, null, true), DATA.turnMs + 500);
  maybeBotTurn(room);
}
function resolveTurn(room, choice, timedOut, skipped) {
  if (room.phase !== 'play' || room.turnLock) return;
  room.turnLock = true;
  clearTimeout(room.turnTimer);
  const item = room.deck[room.turnIdx];
  const q = turnQuestion(item);
  const player = activePlayer(room);
  const correct = !timedOut && !skipped && choice === q.answer;
  const coins = correct ? q.reward : 0;
  if (player) { player.coins += coins; if (correct) player.correct++; player.progress = room.turnIdx + 1; }
  const snap = snapshot(room);
  broadcast(room, {
    t: 'turn_result', player: player ? player.name : '?', correct, coins, timedOut: !!timedOut, skipped: !!skipped,
    text: skipped ? 'Question passée ⏭' : (timedOut ? 'Temps écoulé!' : (correct ? q.success : q.fail)),
    players: snap.players, teams: snap.teams
  });
  room.turnIdx++;
  room.turnTimer = setTimeout(() => {
    if (room.phase !== 'play') return;
    if (room.turnIdx >= room.deck.length) endGame(room); else dealTurn(room);
  }, 3000);
}
function endGame(room) {
  if (room.phase === 'over') return;
  room.phase = 'over';
  clearTimeout(room.turnTimer);
  const snap = snapshot(room);
  BOARD.recordScores(snap.players, snap.players.length ? snap.players[0].name : null); // tableau hebdo
  recordAccountStats([...room.players.values()], snap.players.length ? snap.players[0].name : null);
    broadcast(room, { t: 'over', players: snap.players, teams: snap.teams, mode: room.settings.mode, teamsEnabled: room.settings.teams });
}

/* ---------- Le duel enflammé (1v1) ---------- */
const DUEL_BASE = [0, 100, 200, 300, 500]; // points selon difficulté 1..4
function duelScores(room) {
  return [...room.players.values()]
    .map(p => ({ name: p.name, coins: p.coins, correct: p.correct, wrong: (room.duel && room.duel.wrongs[p.name]) || 0 }))
    .sort((a, b) => b.coins - a.coins || b.correct - a.correct || a.name.localeCompare(b.name));
}
function beginRematch(room) {
  // Revanche acceptée : scores remis à zéro, points ×2, aucune question facile.
  for (const p of room.players.values()) { p.coins = 0; p.correct = 0; p.progress = 0; p.finished = false; }
  room.phase = 'play';
  room.turnIdx = 0; room.lastTurn = null;
  const pool = bankFor(room).filter(q => (q.difficulty || 1) > 1);
  room.duel = {
    qi: 0,
    questions: shuffled(pool.slice()).slice(0, DATA.duelCount || 20),
    answers: {}, timer: null, wrongs: {}, streaks: {}
  };
  room.rematch = true;
  broadcast(room, { t: 'start', mode: 'duel', shiftName: DATA.shiftName, duelMs: DATA.duelMs, total: room.duel.questions.length, rematch: true });
  room.duel.timer = setTimeout(() => dealDuel(room), 1800);
  sendState(room);
}
function dealDuel(room) {
  const d = room.duel;
  if (!d || room.phase !== 'play') return;
  if (d.qi >= d.questions.length) { endDuel(room, null); return; }
  const q = d.questions[d.qi];
  d.answers = {};
  const payload = {
    t: 'duel_q', qi: d.qi + 1, total: d.questions.length,
    q: { prompt: q.q, options: q.options, difficulty: q.difficulty, cat: q.cat },
    deadline: Date.now() + DATA.duelMs,
    scores: duelScores(room), wrongs: Object.assign({}, d.wrongs)
  };
  d.payload = payload;
  broadcast(room, payload);
  clearTimeout(d.timer);
  d.timer = setTimeout(() => resolveDuel(room), DATA.duelMs + 500);
  scheduleDuelBots(room);
}
function resolveDuel(room) {
  const d = room.duel;
  if (!d || room.phase !== 'play') return;
  clearTimeout(d.timer);
  const q = d.questions[d.qi];
  const base = DUEL_BASE[q.difficulty] || 100;
  const results = [];
  let eliminated = null;
  for (const p of room.players.values()) {
    if (!p.connected) continue;
    const a = d.answers[p.name];
    if (a && a.skipped) {
      // Joker « Passer » : ni bonne réponse, ni faute, série préservée.
      results.push({ name: p.name, choice: -1, correct: false, pts: 0,
        streak: d.streaks[p.name] || 0, onFire: false, skipped: true });
      continue;
    }
    const correct = !!(a && a.choice === q.answer);
    let pts = 0, onFire = false;
    if (correct) {
      const remain = Math.max(0, (d.payload.deadline - (a ? a.at : d.payload.deadline)));
      pts = (base + Math.round(base * 0.5 * (remain / DATA.duelMs))) * (room.rematch ? 2 : 1);
      const streak = (d.streaks[p.name] || 0) + 1;
      d.streaks[p.name] = streak;
      onFire = streak >= 3;
      if (onFire) pts = Math.round(pts * 1.5); // EN FEU : x1.5
      p.coins += pts; p.correct++;
      if (streak > (p.bestStreak || 0)) p.bestStreak = streak;
    } else {
      d.streaks[p.name] = 0;
      d.wrongs[p.name] = (d.wrongs[p.name] || 0) + 1;
      if (d.wrongs[p.name] >= 3 && !eliminated) eliminated = p;
    }
    results.push({ name: p.name, choice: a ? a.choice : -1, correct, pts,
      streak: d.streaks[p.name] || 0, onFire });
  }
  broadcast(room, {
    t: 'duel_result', qi: d.qi + 1, total: d.questions.length, answer: q.answer,
    results, scores: duelScores(room), wrongs: Object.assign({}, d.wrongs),
    streaks: Object.assign({}, d.streaks),
    eliminated: eliminated ? eliminated.name : null
  });
  d.qi++;
  if (eliminated) {
    d.timer = setTimeout(() => endDuel(room, eliminated), 4000);
  } else if (d.qi >= d.questions.length) {
    d.timer = setTimeout(() => endDuel(room, null), 4000);
  } else {
    d.timer = setTimeout(() => dealDuel(room), 3500);
  }
}
function endDuel(room, eliminated) {
  if (room.phase === 'over') return;
  room.phase = 'over';
  const d = room.duel;
  if (d) clearTimeout(d.timer);
  const connected = [...room.players.values()].filter(p => p.connected);
  let winner = null;
  if (eliminated) {
    winner = connected.find(p => p.name !== eliminated.name) ||
             [...room.players.values()].find(p => p.name !== eliminated.name);
  } else {
    const ranked = connected.slice().sort((a, b) => b.coins - a.coins || b.correct - a.correct || a.name.localeCompare(b.name));
    winner = ranked[0];
  }
  const players = [...room.players.values()]
    .map(p => ({ name: p.name, coins: p.coins, correct: p.correct }))
    .sort((a, b) => b.coins - a.coins || b.correct - a.correct || a.name.localeCompare(b.name));
  BOARD.recordScores(players, winner ? winner.name : null); // tableau hebdo
  room.lastWinner = winner ? winner.name : null;
  // Cooldown revanche : après une revanche, prochaine revanche contre la même
  // personne seulement après REMATCH_COOLDOWN_MS. Sinon, on signale un cooldown
  // éventuellement encore actif (ex. nouveau duel lancé depuis le salon).
  const duelNames = [...room.players.values()].map(p => p.name);
  let rematchCooldownUntil = 0;
  if (duelNames.length === 2) {
    const key = pairKey(duelNames[0], duelNames[1]);
    if (room.rematch) {
      rematchCooldownUntil = Date.now() + REMATCH_COOLDOWN_MS;
      rematchCooldowns.set(key, rematchCooldownUntil);
      for (const [k, v] of rematchCooldowns) if (v <= Date.now()) rematchCooldowns.delete(k); // purge
    } else {
      rematchCooldownUntil = rematchCooldowns.get(key) || 0;
    }
  }
  recordAccountStats([...room.players.values()], winner ? winner.name : null);
  broadcast(room, {
    t: 'over', mode: 'duel', players, teams: [], teamsEnabled: false,
    winner: winner ? winner.name : null,
    eliminated: eliminated ? eliminated.name : null,
    rematch: !!room.rematch,
    rematchCooldownUntil,
    wrongs: d ? Object.assign({}, d.wrongs) : {}
  });
}
function resetForLobby(room) {
  room.phase = 'lobby'; room.rematch = false; room.lastWinner = null;
  if (room.rematchOffer) { clearTimeout(room.rematchOffer.timer); room.rematchOffer = null; }
  room.deck = []; room.turnIdx = 0; room.turnOrder = []; room.lastTurn = null;
  clearTimeout(room.turnTimer);
  if (room.duel) { clearTimeout(room.duel.timer); room.duel = null; }
  for (const p of room.players.values()) { p.coins = 0; p.correct = 0; p.progress = 0; p.finished = false; }
}

/* ---------- Bots d'arène 🤖 ---------- */
/* Remplissent les places restantes au démarrage et jouent comme des humains. */
const BOT_NAMES = ['Spartacus 🤖', 'Maximus 🤖', 'Xena 🤖', 'Leonidas 🤖', 'Achille 🤖',
  'Hector 🤖', 'Boudicca 🤖', 'César 🤖', 'Athéna 🤖', 'Arès 🤖', 'Némésis 🤖',
  'Titan 🤖', 'Persée 🤖', 'Thésée 🤖', 'Cléopâtre 🤖', 'Hannibal 🤖'];
const BOT_ACCURACY = 0.72;
const brnd = (a, b) => a + Math.random() * (b - a);
const botChoice = (answer, nOptions) =>
  Math.random() < BOT_ACCURACY ? answer : Math.floor(Math.random() * nOptions);

function fillBots(room) {
  const target = room.settings.mode === 'duel' ? 2 : room.settings.maxPlayers;
  let i = 0, added = 0;
  while (room.players.size < target && i < BOT_NAMES.length) {
    const bot = { id: 'bot-' + room.code + '-' + i + '-' + Date.now().toString(36), name: null, isBot: true };
    bot.name = uniqueName(room, BOT_NAMES[i]);
    addPlayer(room, bot);
    i++; added++;
  }
  if (added > 0) sendState(room);
  return added;
}

/* Duel : chaque bot répond après un délai humain */
function scheduleDuelBots(room) {
  const d = room.duel;
  if (!d) return;
  const q = d.questions[d.qi];
  if (!q) return;
  for (const p of room.players.values()) {
    if (!p.isBot || !p.connected) continue;
    if ((d.wrongs[p.name] || 0) >= 3) continue;
    const delay = brnd(2500, Math.max(3200, DATA.duelMs - 1500));
    setTimeout(() => {
      if (room.phase !== 'play' || room.duel !== d || d.answers[p.name]) return;
      d.answers[p.name] = { choice: botChoice(q.answer, q.options.length), at: Date.now() };
      broadcast(room, { t: 'duel_answered', qi: d.qi + 1, name: p.name });
      const active = [...room.players.values()].filter(x => x.connected);
      if (active.length && active.every(x => d.answers[x.name])) { clearTimeout(d.timer); resolveDuel(room); }
    }, delay);
  }
}

/* Tour par tour : le bot joue son tour automatiquement */
function maybeBotTurn(room) {
  const player = activePlayer(room);
  if (!player || !player.isBot) return;
  const turnIdx = room.turnIdx;
  const item = room.deck[turnIdx];
  if (!item) return;
  const q = turnQuestion(item);
  const nOptions = q.options.length;
  const delay = brnd(4000, 14000);
  setTimeout(() => {
    if (room.phase !== 'play' || room.turnIdx !== turnIdx || room.turnLock) return;
    resolveTurn(room, botChoice(q.answer, nOptions), false);
  }, delay);
}

/* Simultané : le bot simule une partie progressive */
function launchSimuBots(room) {
  for (const p of room.players.values()) {
    if (!p.isBot) continue;
    const results = room.deck.map(item => {
      const q = turnQuestion(item);
      const correct = Math.random() < BOT_ACCURACY;
      return { coins: correct ? q.reward : 0, correct };
    });
    let i = 0;
    const step = () => {
      if (room.phase !== 'play') return;
      if (i >= results.length) {
        p.finished = true;
        const snap = snapshot(room);
        broadcast(room, { t: 'leaderboard', players: snap.players, teams: snap.teams });
        if ([...room.players.values()].every(x => x.finished)) endGame(room);
        return;
      }
      const r = results[i];
      p.coins += r.coins; if (r.correct) p.correct++;
      p.progress = i + 1; i++;
      const snap = snapshot(room);
      broadcast(room, { t: 'leaderboard', players: snap.players, teams: snap.teams });
      setTimeout(step, brnd(5000, 11000));
    };
    setTimeout(step, brnd(3000, 8000));
  }
}


/* ---------- Déconnexion ---------- */
function handleBye(cid) {
  const ctx = clients.get(cid);
  if (!ctx || !ctx.room || !ctx.player) { clients.delete(cid); return; }
  const { room, player } = ctx;
  if (!player.connected && room.phase === 'lobby' && !room.players.has(player.id)) { clients.delete(cid); return; }
  player.connected = false;
  // Duel : quitter en pleine partie = forfait immédiat, pas de reconnexion
  if (room.settings.mode === 'duel' && room.phase === 'play') {
    endDuel(room, player);
    clients.delete(cid);
    return;
  }
  if (room.phase === 'lobby') {
    // grâce de reconnexion avant expulsion du lobby
    clearTimeout(player.graceTimer);
    player.graceTimer = setTimeout(() => {
      if (player.connected) return;
      room.players.delete(player.id);
      room.order = room.order.filter(id => id !== player.id);
      if (room.hostId === player.id && room.order.length) room.hostId = room.order[0];
      if (room.players.size === 0) { clearTimeout(room.turnTimer); rooms.delete(room.code); }
      else sendState(room);
    }, LOBBY_GRACE_MS);
    sendState(room);
  } else {
    const wasActive = room.settings.mode === 'tours' && room.phase === 'play' && activePlayer(room) === player;
    sendState(room);
    if (wasActive) { clearTimeout(room.turnTimer); room.turnTimer = setTimeout(() => resolveTurn(room, null, true), 2500); }
    if ([...room.players.values()].every(p => !p.connected)) {
      setTimeout(() => { if ([...room.players.values()].every(p => !p.connected)) { clearTimeout(room.turnTimer); rooms.delete(room.code); } }, 120000);
    }
  }
  clients.delete(cid);
}

/* ---------- Messages ---------- */
function handleMessage(ctx, m) {
  const cid = ctx.cid;
  if (m.t === 'register' || m.t === 'login' || m.t === 'me') { handleAuth(cid, m); return; }
  if (m.t === 'google-login') { handleGoogleLogin(cid, m); return; }
  if (m.t === 'create') {
    if (ctx.room) return;
    const player = { id: cid, name: cleanName(m.name) };
    linkToken(player, m);
    const room = newRoom(player, m);
    ctx.room = room; ctx.player = player;
    sendTo(cid, snapshot(room));
    sendTo(cid, { t: 'hello', you: player.name });
    return;
  }
  if (m.t === 'watch') {
    // Écran présentateur (activités de groupe) : observe une salle sans y jouer.
    const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const room = rooms.get(code);
    if (!room) { sendTo(cid, { t: 'error', msg: 'Code introuvable. Vérifie les 4 lettres.' }); return; }
    const snap = snapshot(room);
    // Question en cours (sans la réponse) pour l'affichage grand écran
    if (room.phase === 'play') {
      if (room.settings.mode === 'tours' && room.lastTurn) snap.question = room.lastTurn;
      else if (room.settings.mode === 'duel' && room.duel && room.duel.payload) snap.question = room.duel.payload;
    }
    sendTo(cid, snap);
    return;
  }
  if (m.t === 'join') {
    if (ctx.room) return;
    const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const room = rooms.get(code);
    if (!room) { sendTo(cid, { t: 'error', msg: 'Code introuvable. Vérifie les 4 lettres.' }); return; }
    const wanted = cleanName(m.name).toLowerCase();
    const existing = [...room.players.values()].find(p => p.name.toLowerCase() === wanted);
    if (existing) {
      if (!existing.connected) {
        clearTimeout(existing.graceTimer);
        const oldId = existing.id;
        clients.delete(oldId);
        room.players.delete(oldId);
        room.order = room.order.map(id => id === oldId ? cid : id);
        if (room.hostId === oldId) room.hostId = cid;
        existing.id = cid;
        existing.connected = true;
        ctx.room = room; ctx.player = existing;
        room.players.set(cid, existing);
        sendTo(cid, snapshot(room));
        sendTo(cid, { t: 'hello', you: existing.name });
        if (room.phase === 'play') {
          if (room.settings.mode === 'simu') sendTo(cid, { t: 'start', mode: 'simu', deck: room.deck, shiftName: DATA.shiftName });
          else if (room.lastTurn) sendTo(cid, room.lastTurn);
        }
        sendState(room);
        return;
      }
      sendTo(cid, { t: 'error', msg: 'Ce pseudo est déjà pris dans cette salle.' });
      return;
    }
    if (room.phase !== 'lobby') { sendTo(cid, { t: 'error', msg: 'La partie est déjà commencée.' }); return; }
    if (room.players.size >= room.settings.maxPlayers) { sendTo(cid, { t: 'error', msg: 'La salle est pleine.' }); return; }
    const player = { id: cid, name: cleanName(m.name) };
    linkToken(player, m);
    addPlayer(room, player);
    ctx.room = room; ctx.player = player;
    sendTo(cid, snapshot(room));
    sendTo(cid, { t: 'hello', you: player.name });
    sendState(room);
    return;
  }

  // Tableau hebdo — accessible même sans salle (écran d'accueil)
  if (m.t === 'get_board') {
    const b = BOARD.currentBoard();
    sendTo(cid, { t: 'board', weekId: b.weekId,
      season: { weekId: b.weekId, label: seasonLabel(b.weekId) },
      top: BOARD.boardTop(10) });
    return;
  }

  // Transfert de cocottes entre comptes — accessible sans salle (accueil).
  // Le solde de référence est stats.coins du compte (persistant).
  if (m.t === 'transfer') {
    const fail = (msg) => sendTo(cid, { t: 'transfer_result', ok: false, msg });
    const fromTag = sessions.get(String(m.token || ''));
    if (!fromTag || !accounts[fromTag]) { fail('Connecte-toi pour envoyer des cocottes.'); return; }
    const wanted = cleanTag(m.to).toLowerCase();
    if (!wanted) { fail('Destinataire inconnu.'); return; }
    const toTag = Object.keys(accounts).find(t => t.toLowerCase() === wanted);
    if (!toTag) { fail('Destinataire inconnu.'); return; }
    if (toTag === fromTag) { fail('Tu ne peux pas t’envoyer des cocottes à toi-même.'); return; }
    const amount = Math.floor(Number(m.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000) { fail('Montant invalide (1 à 1000).'); return; }
    const from = accounts[fromTag], to = accounts[toTag];
    if (!from.stats) from.stats = { games: 0, wins: 0, bestStreak: 0, coins: 0 };
    if (!to.stats) to.stats = { games: 0, wins: 0, bestStreak: 0, coins: 0 };
    if ((from.stats.coins || 0) < amount) { fail('Solde insuffisant.'); return; }
    from.stats.coins -= amount;
    to.stats.coins = (to.stats.coins || 0) + amount;
    accountsDirty = true;
    sendTo(cid, { t: 'transfer_result', ok: true,
      msg: amount + ' cocottes envoyées à ' + toTag + '!', balance: from.stats.coins });
    return;
  }

  const { room, player } = ctx;
  if (!room || !player) { sendTo(cid, { t: 'error', msg: 'Rejoins d’abord une salle.' }); return; }
  const isHost = room.hostId === player.id;

  if (m.t === 'set_team') {
    if (room.phase !== 'lobby' || !room.settings.teams) return;
    const i = parseInt(m.team, 10);
    if (i >= 0 && i < room.teams.length) { player.team = i; sendState(room); }
    return;
  }
  if (m.t === 'add_team') {
    if (!isHost || room.phase !== 'lobby' || !room.settings.teams || room.teams.length >= 6) return;
    const name = cleanName(m.name, 14);
    room.teams.push({ name, color: TEAM_COLORS[(room.teams.length - 2) % TEAM_COLORS.length], emoji: '🌿' });
    sendState(room);
    return;
  }
  if (m.t === 'shuffle_teams') {
    if (!isHost || room.phase !== 'lobby' || !room.settings.teams) return;
    const ids = shuffled([...room.players.keys()]);
    ids.forEach((id, k) => { room.players.get(id).team = k % room.teams.length; });
    sendState(room);
    return;
  }
  if (m.t === 'start') {
    if (!isHost || room.phase !== 'lobby') return;
    if (room.players.size < 1) { sendTo(cid, { t: 'error', msg: 'Il faut au moins un joueur.' }); return; }
    for (const p of room.players.values()) { p.coins = 0; p.correct = 0; p.progress = 0; p.finished = false; }
    room.jokerKinds = {};
    room.phase = 'play';
    room.turnIdx = 0; room.lastTurn = null;
    fillBots(room); // les bots occupent les places restantes
    if (room.settings.mode === 'duel') {
      const active = [...room.players.values()].filter(p => p.connected);
      if (active.length !== 2) { room.phase = 'lobby'; sendTo(cid, { t: 'error', msg: 'Le duel enflammé se joue à 2 joueurs.' }); return; }
      const bank = bankFor(room);
      if (!bank || !bank.length) { room.phase = 'lobby'; sendTo(cid, { t: 'error', msg: 'Banque de questions du duel introuvable.' }); return; }
      room.duel = {
        qi: 0,
        questions: shuffled(bank.slice()).slice(0, DATA.duelCount || 20),
        answers: {}, timer: null, wrongs: {}, streaks: {}
      };
      room.rematch = false;
      room.lastWinner = null;
      broadcast(room, { t: 'start', mode: 'duel', shiftName: DATA.shiftName, duelMs: DATA.duelMs, total: room.duel.questions.length });
      room.duel.timer = setTimeout(() => dealDuel(room), 1800);
      sendState(room);
      return;
    }
    // Simultané et tour par tour : deck de questions tirées de la banque du
    // duel (même banque que le mode duel, selon la langue de la salle).
    const bankDeck = () => shuffled(bankFor(room).slice()).slice(0, DATA.deckOrder.length)
      .map(q => ({ kind: 'bank', q: q.q, options: q.options, answer: q.answer, cat: q.cat, difficulty: q.difficulty || 1 }));
    if (room.settings.mode === 'simu') {
      room.deck = bankDeck();
      broadcast(room, { t: 'start', mode: 'simu', deck: room.deck, shiftName: DATA.shiftName });
      launchSimuBots(room);
    } else {
      room.deck = bankDeck();
      room.turnOrder = shuffled([...room.players.keys()]);
      broadcast(room, { t: 'start', mode: 'tours', shiftName: DATA.shiftName, turnMs: DATA.turnMs });
      room.turnTimer = setTimeout(() => dealTurn(room), 1800);
    }
    sendState(room);
    return;
  }
  if (m.t === 'rematch') {
    // Le perdant défie le gagnant. La revanche démarre quand le gagnant accepte.
    if (room.settings.mode !== 'duel' || room.phase !== 'over') return;
    if (room.rematchOffer) return; // un défi est déjà en cours
    if (room.lastWinner && player.name === room.lastWinner) return; // le gagnant accepte, il ne défie pas
    const active = [...room.players.values()].filter(p => p.connected);
    if (active.length !== 2) { sendTo(cid, { t: 'error', msg: 'La revanche se joue à 2 joueurs connectés.' }); return; }
    // Cooldown : après une revanche, attendre avant de redéfier la même personne
    const cdKey = pairKey(active[0].name, active[1].name);
    const cdUntil = rematchCooldowns.get(cdKey) || 0;
    if (cdUntil > Date.now()) {
      const adv = active.find(p => p.name !== player.name);
      const mins = Math.ceil((cdUntil - Date.now()) / 60000);
      sendTo(cid, { t: 'error', msg: 'Prochaine revanche contre ' + (adv ? adv.name : 'ton adversaire') + ' dans ~' + mins + ' min ! ⏳' });
      return;
    }
    rematchCooldowns.delete(cdKey);
    room.rematchOffer = { from: player.name, timer: setTimeout(() => {
      room.rematchOffer = null;
      broadcast(room, { t: 'rematch_expired' });
    }, 60000) };
    broadcast(room, { t: 'rematch_offer', from: player.name });
    return;
  }
  if (m.t === 'rematch_accept') {
    if (room.settings.mode !== 'duel' || room.phase !== 'over' || !room.rematchOffer) return;
    if (player.name === room.rematchOffer.from) return; // on n'accepte pas son propre défi
    const active = [...room.players.values()].filter(p => p.connected);
    if (active.length !== 2) { sendTo(cid, { t: 'error', msg: 'La revanche se joue à 2 joueurs connectés.' }); return; }
    clearTimeout(room.rematchOffer.timer); room.rematchOffer = null;
    beginRematch(room);
    return;
  }
  if (m.t === 'rematch_decline') {
    if (room.settings.mode !== 'duel' || room.phase !== 'over' || !room.rematchOffer) return;
    clearTimeout(room.rematchOffer.timer); room.rematchOffer = null;
    broadcast(room, { t: 'rematch_declined', by: player.name });
    return;
  }
  if (m.t === 'score') {
    if (room.phase !== 'play' || room.settings.mode !== 'simu') return;
    player.coins = Math.max(0, parseInt(m.coins, 10) || 0);
    player.correct = Math.max(0, parseInt(m.correct, 10) || 0);
    player.progress = Math.max(0, Math.min(room.deck.length, parseInt(m.progress, 10) || 0));
    if (m.finished) player.finished = true;
    const snap = snapshot(room);
    broadcast(room, { t: 'leaderboard', players: snap.players, teams: snap.teams });
    if ([...room.players.values()].every(p => p.finished)) endGame(room);
    return;
  }
  if (m.t === 'answer') {
    if (room.settings.mode === 'duel') {
      if (room.phase !== 'play' || !room.duel) return;
      const d = room.duel;
      if (d.answers[player.name]) return;
      const choice = parseInt(m.choice, 10);
      if (isNaN(choice) || choice < 0 || choice > 3) return;
      d.answers[player.name] = { choice, at: Date.now() };
      broadcast(room, { t: 'duel_answered', qi: d.qi + 1, name: player.name });
      const active = [...room.players.values()].filter(p => p.connected);
      if (active.length && active.every(p => d.answers[p.name])) {
        clearTimeout(d.timer);
        resolveDuel(room);
      }
      return;
    }
    if (room.phase !== 'play' || room.settings.mode !== 'tours') return;
    if (activePlayer(room) !== player || room.turnLock) return;
    const choice = parseInt(m.choice, 10);
    if (isNaN(choice) || choice < 0 || choice > 4) return;
    resolveTurn(room, choice, false);
    return;
  }
  if (m.t === 'joker') {
    // Jokers du conseiller : le pont connaît la bonne réponse, il répond en
    // privé. Chaque joker : une fois par partie et par joueur. Le coût en
    // cocottes est débité côté client seulement si ok:true.
    const kind = m.kind;
    if (kind !== 'fifty' && kind !== 'hint' && kind !== 'pass') return;
    const jfail = (msg) => sendTo(cid, { t: 'joker_result', kind, ok: false, msg });
    const firstLetter = (txt) => (String(txt || '').match(/[A-Za-zÀ-ÖØ-öø-ÿ]/) || ['?'])[0].toUpperCase();
    if (room.settings.mode === 'duel') {
      if (room.phase !== 'play' || !room.duel) { jfail('Aucune question en cours.'); return; }
      const d = room.duel;
      if (d.answers[player.name]) { jfail('Tu as déjà répondu à cette question.'); return; }
      const q = d.questions[d.qi];
      if (!q) { jfail('Aucune question en cours.'); return; }
      d.jokerKinds = d.jokerKinds || {};
      const used = d.jokerKinds[player.name] || (d.jokerKinds[player.name] = {});
      if (used[kind]) { jfail('Joker déjà utilisé dans ce duel.'); return; }
      used[kind] = true;
      if (kind === 'pass') {
        d.answers[player.name] = { choice: -1, skipped: true, at: Date.now() };
        broadcast(room, { t: 'duel_answered', qi: d.qi + 1, name: player.name });
        sendTo(cid, { t: 'joker_result', kind, ok: true });
        const active = [...room.players.values()].filter(p => p.connected);
        if (active.length && active.every(p => d.answers[p.name])) { clearTimeout(d.timer); resolveDuel(room); }
        return;
      }
      if (kind === 'fifty') {
        const wrong = q.options.map((_, i) => i).filter(i => i !== q.answer);
        sendTo(cid, { t: 'joker_result', kind, ok: true, hide: shuffled(wrong).slice(0, 2) });
        return;
      }
      sendTo(cid, { t: 'joker_result', kind, ok: true, letter: firstLetter(q.options[q.answer]) });
      return;
    }
    if (room.settings.mode === 'tours') {
      if (room.phase !== 'play' || room.turnLock) { jfail('Ce n’est pas le moment.'); return; }
      if (activePlayer(room) !== player) { jfail('Ce n’est pas ton tour.'); return; }
      room.jokerKinds = room.jokerKinds || {};
      const used = room.jokerKinds[player.name] || (room.jokerKinds[player.name] = {});
      if (used[kind]) { jfail('Joker déjà utilisé dans cette partie.'); return; }
      const q = turnQuestion(room.deck[room.turnIdx]);
      used[kind] = true;
      if (kind === 'pass') {
        sendTo(cid, { t: 'joker_result', kind, ok: true });
        resolveTurn(room, -1, false, true);
        return;
      }
      if (kind === 'fifty') {
        const wrong = q.options.map((_, i) => i).filter(i => i !== q.answer);
        const nHide = Math.max(0, Math.min(2, q.options.length - 2));
        sendTo(cid, { t: 'joker_result', kind, ok: true, hide: shuffled(wrong).slice(0, nHide) });
        return;
      }
      sendTo(cid, { t: 'joker_result', kind, ok: true, letter: firstLetter(q.options[q.answer]) });
      return;
    }
    jfail('Joker indisponible dans ce mode.');
    return;
  }
  if (m.t === 'applaud') {
    if (room.phase !== 'play') return;
    broadcast(room, { t: 'applaud', from: player.name });
    return;
  }
  if (m.t === 'end') {
    if (!isHost || room.phase !== 'play') return;
    endGame(room);
    return;
  }
  if (m.t === 'to_lobby') {
    if (!isHost) return;
    resetForLobby(room);
    sendState(room);
    return;
  }
  if (m.t === 'leave') {
    handleBye(cid);
    return;
  }
}

/* ---------- Routage MQTT ---------- */
mq.on('message', (topic, payload) => {
  let m;
  try { m = JSON.parse(payload.toString().slice(0, 8192)); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;

  // statut / testament d'un client
  if (topic.endsWith('/status')) {
    const parts = topic.split('/');
    const cid = parts[parts.length - 2];
    if (m.t === 'bye') handleBye(cid);
    return;
  }

  const cid = m.cid;
  if (!cid || typeof cid !== 'string' || cid.length > 64) return;
  let ctx = clients.get(cid);
  if (!ctx) { ctx = { cid, room: null, player: null }; clients.set(cid, ctx); }

  if (topic === LOBBY) {
    if (m.t !== 'create' && m.t !== 'join' && m.t !== 'get_board' && m.t !== 'watch' && m.t !== 'register' && m.t !== 'login' && m.t !== 'me' && m.t !== 'google-login' && m.t !== 'transfer') return;
  } else {
    // message de salle : vérifier la cohérence minimale (le code vient du topic)
    const code = topic.split('/')[3];
    if (ctx.room && ctx.room.code !== code) return;
  }
  try { handleMessage(ctx, m); }
  catch (e) { console.error('handleMessage:', e.message); sendTo(cid, { t: 'error', msg: 'Oups, petit hoquet du serveur.' }); }
});

console.log('🌉 Pont « L’arène des budtender » — démarrage, connexion au relais…');
