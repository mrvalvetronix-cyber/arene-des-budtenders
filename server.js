'use strict';
/* Serveur multijoueur « L’arène des budtender » — WebSocket temps réel + fichiers statiques. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const DATA = require('./game-data.js');

const PORT = process.env.PORT || 8137;
const PUBLIC = path.join(__dirname, 'public');
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TEAM_COLORS = ['#c65b8f', '#4d9db5', '#8a6fd6', '#d0693c', '#5da85f', '#c9a13b'];

/* ---------- HTTP statique ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/multi.html';
  let file;
  if (urlPath === '/game-data.js') file = path.join(__dirname, 'game-data.js');
  else file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();
let nextId = 1;

/* ---------- Utilitaires ---------- */
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
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, exceptId) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.id !== exceptId && p.ws && p.ws.readyState === 1) { try { p.ws.send(s); } catch (e) {} }
  }
}

/* ---------- État des salles ---------- */
function newRoom(hostPlayer, settings) {
  const code = makeCode();
  const room = {
    code, phase: 'lobby',
    settings: {
      mode: settings.mode === 'tours' ? 'tours' : 'simu',
      teams: !!settings.teams,
      maxPlayers: Math.min(12, Math.max(2, parseInt(settings.maxPlayers, 10) || 8))
    },
    players: new Map(), order: [],
    teams: [Object.assign({}, DATA.teamPresets[0]), Object.assign({}, DATA.teamPresets[1])],
    hostId: hostPlayer.id,
    deck: [], turnIdx: 0, turnOrder: [], turnTimer: null, turnLock: false,
    currentAnswer: -1, lastTurn: null, createdAt: Date.now()
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
}
function resolveTurn(room, choice, timedOut) {
  if (room.phase !== 'play' || room.turnLock) return;
  room.turnLock = true;
  clearTimeout(room.turnTimer);
  const item = room.deck[room.turnIdx];
  const q = turnQuestion(item);
  const player = activePlayer(room);
  const correct = !timedOut && choice === q.answer;
  const coins = correct ? q.reward : 0;
  if (player) { player.coins += coins; if (correct) player.correct++; player.progress = room.turnIdx + 1; }
  const snap = snapshot(room);
  broadcast(room, {
    t: 'turn_result', player: player ? player.name : '?', correct, coins, timedOut: !!timedOut,
    text: timedOut ? 'Temps écoulé!' : (correct ? q.success : q.fail),
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
  broadcast(room, { t: 'over', players: snap.players, teams: snap.teams, mode: room.settings.mode, teamsEnabled: room.settings.teams });
}
function resetForLobby(room) {
  room.phase = 'lobby';
  room.deck = []; room.turnIdx = 0; room.turnOrder = []; room.lastTurn = null;
  clearTimeout(room.turnTimer);
  for (const p of room.players.values()) { p.coins = 0; p.correct = 0; p.progress = 0; p.finished = false; }
}

/* ---------- Messages ---------- */
wss.on('connection', (ws) => {
  const ctx = { id: nextId++, room: null, player: null };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString().slice(0, 4096)); } catch (e) { return; }
    try { handleMessage(ctx, ws, m || {}); } catch (e) { send(ws, { t: 'error', msg: 'Oups, petit hoquet du serveur.' }); }
  });

  ws.on('close', () => {
    const { room, player } = ctx;
    if (!room || !player) return;
    player.connected = false; player.ws = null;
    if (room.phase === 'lobby') {
      room.players.delete(player.id);
      room.order = room.order.filter(id => id !== player.id);
      if (room.hostId === player.id && room.order.length) room.hostId = room.order[0];
      if (room.players.size === 0) { clearTimeout(room.turnTimer); rooms.delete(room.code); return; }
      sendState(room);
    } else {
      const wasActive = room.settings.mode === 'tours' && room.phase === 'play' && activePlayer(room) === player;
      sendState(room);
      if (wasActive) { clearTimeout(room.turnTimer); room.turnTimer = setTimeout(() => resolveTurn(room, null, true), 2500); }
      if ([...room.players.values()].every(p => !p.connected)) {
        setTimeout(() => { if ([...room.players.values()].every(p => !p.connected)) { clearTimeout(room.turnTimer); rooms.delete(room.code); } }, 120000);
      }
    }
  });
});

function handleMessage(ctx, ws, m) {
  /* --- créer / rejoindre (pas encore en salle) --- */
  if (m.t === 'create') {
    if (ctx.room) return;
    const player = { id: ctx.id, ws, name: cleanName(m.name) };
    const room = newRoom(player, m);
    ctx.room = room; ctx.player = player;
    send(ws, snapshot(room));
    send(ws, { t: 'hello', you: player.name });
    return;
  }
  if (m.t === 'join') {
    if (ctx.room) return;
    const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const room = rooms.get(code);
    if (!room) { send(ws, { t: 'error', msg: 'Code introuvable. Vérifie les 4 lettres.' }); return; }
    const wanted = cleanName(m.name).toLowerCase();
    const existing = [...room.players.values()].find(p => p.name.toLowerCase() === wanted);
    if (existing && !existing.connected) {
      existing.ws = ws; existing.connected = true;
      ctx.room = room; ctx.player = existing;
      send(ws, snapshot(room));
      send(ws, { t: 'hello', you: existing.name });
      if (room.phase === 'play') {
        if (room.settings.mode === 'simu') send(ws, { t: 'start', mode: 'simu', deck: room.deck, shiftName: DATA.shiftName });
        else if (room.lastTurn) send(ws, room.lastTurn);
      }
      sendState(room);
      return;
    }
    if (room.phase !== 'lobby') { send(ws, { t: 'error', msg: 'La partie est déjà commencée.' }); return; }
    if (room.players.size >= room.settings.maxPlayers) { send(ws, { t: 'error', msg: 'La salle est pleine.' }); return; }
    const player = { id: ctx.id, ws, name: cleanName(m.name) };
    addPlayer(room, player);
    ctx.room = room; ctx.player = player;
    send(ws, snapshot(room));
    send(ws, { t: 'hello', you: player.name });
    sendState(room);
    return;
  }

  const { room, player } = ctx;
  if (!room || !player) { send(ws, { t: 'error', msg: 'Rejoins d’abord une salle.' }); return; }
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
    if (room.players.size < 1) { send(ws, { t: 'error', msg: 'Il faut au moins un joueur.' }); return; }
    for (const p of room.players.values()) { p.coins = 0; p.correct = 0; p.progress = 0; p.finished = false; }
    room.phase = 'play';
    room.turnIdx = 0; room.lastTurn = null;
    if (room.settings.mode === 'simu') {
      room.deck = shuffled(DATA.deckOrder);
      broadcast(room, { t: 'start', mode: 'simu', deck: room.deck, shiftName: DATA.shiftName });
    } else {
      room.deck = DATA.deckOrder.slice();
      room.turnOrder = shuffled([...room.players.keys()]);
      broadcast(room, { t: 'start', mode: 'tours', shiftName: DATA.shiftName, turnMs: DATA.turnMs });
      room.turnTimer = setTimeout(() => dealTurn(room), 1800);
    }
    sendState(room);
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
    if (room.phase !== 'play' || room.settings.mode !== 'tours') return;
    if (activePlayer(room) !== player || room.turnLock) return;
    const choice = parseInt(m.choice, 10);
    if (isNaN(choice) || choice < 0 || choice > 4) return;
    resolveTurn(room, choice, false);
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
    try { ws.close(); } catch (e) {}
    return;
  }
}

/* ---------- Keep-alive ---------- */
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { try { ws.terminate(); } catch (e) {} return; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 30000);

server.listen(PORT, () => console.log('🎮 Multijoueur sur http://localhost:' + PORT));
