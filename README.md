# ♠ Bélote Gasy

La **belote malgache** telle qu'on la joue à Madagascar, en ligne ou contre l'IA —
un jeu de cartes pour le navigateur (PWA), avec 2 ou 3 amis par code de table,
des bots qui remplissent les sièges vides, et un module intégré de
**documentation, d'apprentissage (quiz) et de conseils**.

Pas de build, pas de framework : JavaScript simple, animations CSS3 et une
couche de particules canvas, le tout servi par un serveur Node d'environ
200 lignes.

```bash
npm install
npm start          # http://localhost:3000
npm test           # moteur · client · multijoueur · déploiement
npm run build      # dist/ — bundle PWA / mobile installable
```

**Le jeu solo ne nécessite aucun serveur.** Le moteur de règles et les bots
sont livrés dans la page : « Jouer vs IA » fonctionne hors ligne, s'installe
comme PWA et se package en application mobile. Le serveur Node n'est là que
pour les tables en ligne. Voir [DEPLOY.md](DEPLOY.md).

## Règles (Bélote Gasy)

- **4 joueurs, 2 équipes de 2** (partenaires face à face), **32 cartes**
  (du 7 à l'As), **8 cartes chacun dès le début** — pas de carte de tourne.
- **Enchères « maka »** : on annonce un contrat — Pique / Cœur / Carreau
  (**16 dz**), Trèfle *tsy miharitra* (**64 dz**), Tout-Atout *atao daholo*
  (**26 dz**), Sans-Atout *tsy misy atao* (**52 dz**). Une enchère égale vole
  le contrat, 3 passes consécutifs le clôturent, 4 passes → redonne.
- **Contre / Surcontre** : la défense peut contrer (×2), le partenaire du
  preneur surcontrer (×4, sauf Trèfle et Sans-Atout).
- **Valeurs** : en atout J 20 · 9 14 · A 11 · 10 10 · R 4 · D 3 · 8/7 0 ;
  hors atout A 11 · 10 10 · R 4 · D 3 · V 2 · 9/8/7 0. Manche = 152 points
  de cartes + 10 (dix de der) = 162.
- **« Tout ou rien »** : le preneur qui réussit (plus de points que la
  défense) emporte toute la valeur du contrat ; s'il chute (**maty**), la
  défense l'emporte. **Tout-Atout** est le seul jeu où les 26 dizaines sont
  partagées entre les deux équipes (points arrondis en dizaines, l'équipe du
  dix de der étant comptée en premier).
- **Comptage** : unités de 1 à 5 arrondies en dessous, de 6 à 9 au-dessus
  (86 points → 9 dizaines). **Première équipe à 150 dizaines.**
- **Plis (« miboty »)** : fournir la couleur demandée ; couper à l'atout si
  l'adversaire est maître (pisser libre si le partenaire est maître) ; monter
  obligatoirement quand de l'atout est joué. Tout-Atout : pas de coupe mais
  montée obligatoire. Sans-Atout : fournir simplement.

## Apprentissage

L'écran **« Règles & Apprendre »** (touche `4`) regroupe :

- **📖 Règles** — la règle complète en 8 sections (distribution, maka,
  valeurs des cartes, dizaines, tout ou rien, miboty…) avec le vocabulaire
  malgache (maka, maty, miboty, pisser, tsy miharitra…).
- **🎯 Quiz d'apprentissage** — 13 questions à choix multiples avec
  explication immédiate, score final et recommencement.
- **💡 Conseils** — stratégies pratiques (gestion des atouts, enchères,
  contre, dix de der, défense…).

## Fonctionnalités

**Jeu**
- Règles complètes de la Bélote Gasy : maka, contrats (16/26/52/64 dz),
  contre/surcontre, comptage en dizaines vers 150, tout ou rien, répartition
  du Tout-Atout, miboty / monter, dix de der.
- Tables en ligne pour **2, 3 ou 4 humains**, code à 4 lettres partagé,
  match rapide, sièges vides joués par l'IA (reprise de votre siège en
  cas de reconnexion).
- Trois niveaux d'IA (facile / normale / difficile), solo 100 % hors ligne.

**App / offline**
- PWA installable : plein écran, icône dédiée, shell précaché par le service
  worker, bouton « Installer l'app » (iOS : Partager ▸ Sur l'écran d'accueil).
- Les parties solo utilisent exactement le même moteur que le serveur :
  mêmes règles, zéro latence, aucun réseau requis.
- APK/AAB Android via Capacitor, et déploiement Docker / Fly / Render /
  Railway pour le jeu en ligne.

**Ressenti**
- Secousses d'écran, particules, traînées scintillantes, confettis en fin de
  partie, SFX WebAudio synthétisés (aucun asset audio à télécharger).
- Tableau des scores animé, résumés de manche, hall of fame local.

**Contrôles**

| | |
|---|---|
| `←` `→` | choisir une carte |
| `↵` / `Espace` / `↑` | jouer la carte |
| `1`–`8` | jouer une carte directement |
| `S` `H` `D` `C` | enchérir Pique / Cœur / Carreau / Trèfle |
| `T` `A` | enchérir Tout-Atout / Sans-Atout |
| `N` | passer (enchères / contre) |
| `Y` | contrer / surcontrer |
| `P` / `Échap` | pause · menu |
| `R` | rejouer depuis l'écran de fin |
| `M` | couper le son |
| tactile | taper pour soulever une carte, retaper ou glisser vers le haut |

## Architecture

```
server/index.js   fichiers statiques + protocole WebSocket (seul code serveur)
public/
  index.html      tous les écrans, sans template
  sw.js           pré-cache hors ligne
  manifest.webmanifest
  js/engine.js    ← partagé : règles pures + IA  (UMD : require Node / script navigateur)
  js/rooms.js     ← partagé : tables, sièges, pilote IA, vues par joueur
  js/local.js     transport hors ligne — exécute rooms.js dans la page (solo)
  js/net.js       choisit WebSocket ou le moteur local
  js/learn.js     documentation + quiz + conseils (écran « Règles & Apprendre »)
  js/game.js      état → rendu DOM, entrées, effets
  js/{fx,cards,store,config}.js
tools/
  build-static.js bundle dist/ pour Pages / Capacitor
  icons.js        encodage/décodage PNG sans dépendance pour chaque taille d'icône
test/
  engine.test.js       règles + 1000 manches IA simulées
  client.test.js       la vraie UI en jsdom, réseau coupé (solo hors ligne)
  multiplayer.test.js  2 humains + 2 bots sur WebSocket, une manche complète
  deploy.test.js       manifeste, icônes, SW, build navigateur du moteur, dist/
```

`engine.js` et `rooms.js` sont des modules UMD avec une source de vérité
unique : `require()` par le serveur Node, `<script>` par le navigateur. Le
jeu en ligne est **autoritaire côté serveur** : les clients ne voient jamais
la main des autres (la suite de tests l'affirme), ne calculent jamais la
légalité, et chaque animation est déclenchée par le flux d'événements `fx`
attaché à chaque diffusion d'état. Le solo emprunte exactement le même chemin
— une table privée avec trois bots — donc il n'existe qu'une seule
implémentation des règles.

## Déploiement

| Cible | Commande / fichier |
|---|---|
| Web (PWA, gratuit) | Settings ▸ Pages ▸ branche `main`, dossier `/docs` (déjà construit) |
| Serveur en ligne | `fly.toml`, `render.yaml`, `railway.json`, `Procfile`, `Dockerfile` |
| APK/AAB Android | Actions ▸ *Build Android app*, ou `npm run mobile:apk` |
| Installer les workflows | `cp deploy/github-workflows/*.yml .github/workflows/` |
| iOS | `npx cap add ios && npx cap open ios` (macOS) |

Instructions complètes, y compris proxy TLS/WebSocket et soumission aux
stores, dans [DEPLOY.md](DEPLOY.md).
