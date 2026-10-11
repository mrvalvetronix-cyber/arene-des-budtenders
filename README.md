# 🌿 L’arène des budtender · Budtender Arena

Jeu questionnaire multijoueur en temps réel — rooms par code à 4 lettres, directement dans le navigateur. Bilingue FR/EN.

**Jouer en ligne :** https://mrvalvetronix-cyber.github.io/arene-des-budtenders/

## La fusion (octobre 2026)

Le meilleur des deux arènes : le multijoueur de « L’arène des budtender » avec l’identité visuelle et les mécaniques de « L’arène du conseiller ».

- **Visuel « arène du conseiller »** : fond nocturne animé (braises flottantes), questions servies sur des cartes, boutons pilule.
- **972 questions** avec narration à voix haute (synthèse vocale), 6 thèmes, 3 niveaux de difficulté.
- **Jokers** : Passer (2), 50/50 (3), Indice (4) — payés en cocottes.
- **Cocottes 🪙** : la monnaie du jeu (des fleurs de cannabis) — gains en partie, mini-jeu **Attrape-cocotte**, et **transferts entre joueurs** (avec QR « portefeuille » à scanner).
- **Comptes persistants** : gamertag + mot de passe, ou connexion Google. Stats conservées.
- **Tableau de la semaine** : classement renouvelé chaque dimanche à 00h01 (heure de Toronto), en même temps que les questions.
- **Sondage d’amélioration** intégré à l’accueil.

## Architecture

- `docs/index.html` — accueil avec sélecteur de langue FR/EN.
- `docs/multi-mqtt.html` — client FR « L’arène des budtender » : 100 % navigateur, multijoueur via relais MQTT public (`wss://broker.emqx.io:8084/mqtt`). Version servie par GitHub Pages.
- `docs/en/multi-mqtt.html` — client EN « Budtender Arena », même architecture.
- `docs/multi.html` — client WebSocket pour partie en réseau local.
- `server.js` — serveur Node.js (WebSocket + fichiers statiques) pour le jeu local, port 8137.
- `mqtt-bridge.js` — pont MQTT (logique de jeu côté relais public, comptes, jokers, transferts). Sert `duel-bank.json` (FR) ou `duel-bank-en.json` (EN) selon `room.settings.lang`.
- `weekly-board.js` — tableau hebdomadaire (remise à zéro le dimanche 00h01, heure de Toronto).
- `game-data.js`, `duel-bank.json`, `duel-bank-en.json` — banques de questions.

## Lancer en local

```bash
npm install
node server.js   # http://localhost:8137
```

## Feuille de route multijoueur

- [x] Version anglaise « Budtender Arena » + sélecteur de langue
- [x] Comptes persistants + classement hebdomadaire
- [x] Jokers, cocottes transférables, QR portefeuille
- [ ] Modes d'arène (tournoi, élimination)
- [ ] Spectateurs
