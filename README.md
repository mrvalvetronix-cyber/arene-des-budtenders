# 🌿 L’arène des budtender · Budtender Arena

Jeu questionnaire multijoueur en temps réel — rooms par code à 4 lettres, directement dans le navigateur. Bilingue FR/EN.

**Jouer en ligne :** https://mrvalvetronix-cyber.github.io/arene-des-budtenders/

## Architecture

- `docs/index.html` — accueil avec sélecteur de langue FR/EN.
- `docs/multi-mqtt.html` — client FR « L’arène des budtender » : 100 % navigateur, multijoueur via relais MQTT public (`wss://broker.emqx.io:8084/mqtt`). Version servie par GitHub Pages.
- `docs/en/multi-mqtt.html` — client EN « Budtender Arena », même architecture.
- `docs/multi.html` — client WebSocket pour partie en réseau local.
- `server.js` — serveur Node.js (WebSocket + fichiers statiques) pour le jeu local, port 8137.
- `mqtt-bridge.js` — pont MQTT (logique de jeu côté relais public). Sert `duel-bank.json` (FR) ou `duel-bank-en.json` (EN) selon `room.settings.lang`.
- `game-data.js`, `duel-bank.json`, `duel-bank-en.json` — banques de questions.

## Lancer en local

```bash
npm install
node server.js   # http://localhost:8137
```

## Feuille de route multijoueur

- [x] Version anglaise « Budtender Arena » + sélecteur de langue
- [ ] Modes d'arène (tournoi, élimination)
- [ ] Spectateurs
- [ ] Classements persistants
