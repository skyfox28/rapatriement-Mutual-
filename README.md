# Rapatriement Mutual

Créé par Galaad Poivey

Application web pour faire le lien entre le scan d'un **SSCC Mutual** (code-barre sur la palette reçue) et **votre UM** à coller physiquement dessus.

Deux versions, même logique de scan :

| | `index.html` — Poste PC | `mobile.html` — iPhone / Android |
|---|---|---|
| Lecture du code | Douchette USB (clavier) | Appareil photo |
| Utilisation | Double-clic, 100% hors-ligne | Nécessite une page en **HTTPS** (voir plus bas) |

## Version PC (`index.html`)

1. Double-cliquez sur `index.html` pour l'ouvrir dans votre navigateur. Aucune installation, aucun serveur, aucune connexion internet requise.
2. **Chargez le fichier Excel** du rapatriement de la semaine (colonnes *A LIVRER LE, Article, Désignation article, Unité stk, Code palette, Qté, Pal, Poids Kg*).
3. Branchez votre douchette USB (elle se comporte comme un clavier). Cliquez dans la **zone de scan**, puis scannez le SSCC de la palette Mutual (colonne *Code palette*).
4. L'application affiche en grand l'**UM** (colonne *Unité stk*) à coller sur la palette, avec l'article, la désignation, le n° DT, la quantité et le poids.
5. **Le premier scan démarre le rapatriement** : l'app annonce le jour et le n° DT concernés, et compte les palettes **de ce DT uniquement** (scannées / restantes). Cliquez sur "Terminer" une fois le DT fini, avant de commencer le suivant.
6. Chaque scan est ajouté à l'historique de la session, exportable en CSV.

## Version mobile (`mobile.html`)

Même principe, avec l'appareil photo du téléphone à la place de la douchette : on charge le fichier, on vise le code-barre, l'UM s'affiche en grand.

### Pourquoi il faut l'héberger (HTTPS)

Les navigateurs (Safari sur iPhone en particulier) **interdisent l'accès à l'appareil photo sur une page ouverte en local** (`fichier.html` double-cliqué). Il faut que `mobile.html` soit servi depuis une adresse `https://`. La façon la plus simple, gratuite, est **GitHub Pages** :

1. Sur GitHub, dans le dépôt : **Settings ▸ Pages**.
2. Source : **Deploy from a branch**, branche `claude/repatriation-mutual-sscc-scan-7p4rnc` (ou `main` si vous l'y fusionnez), dossier `/ (root)`.
3. Enregistrez. GitHub donne une adresse du type `https://<votre-compte>.github.io/rapatriement-Mutual-/`.
4. Sur l'iPhone, ouvrez `https://<votre-compte>.github.io/rapatriement-Mutual-/mobile.html` dans **Safari**.

### Ajouter l'app à l'écran d'accueil (recommandé)

Dans Safari sur `mobile.html` : bouton **Partager** (le carré avec la flèche) ▸ **Sur l'écran d'accueil**. L'icône Rapatriement Mutual apparaît alors comme une vraie app, en plein écran, sans barre d'adresse.

### Utilisation

1. **Chargez le fichier Excel** (bouton "Choisir le fichier .xlsx" — depuis Fichiers, iCloud ou une pièce jointe Mail).
2. Appuyez sur **Démarrer la caméra**, autorisez l'accès à l'appareil photo, puis alignez le code-barre du SSCC dans le cadre.
3. Dès qu'un code est reconnu, l'**UM** s'affiche en grand tout en haut, avec un son de confirmation. La caméra reste active pour enchaîner les scans (le même code n'est pas re-détecté avant quelques secondes).
4. Si un code-barre est illisible, saisissez le SSCC à la main en bas de l'écran.
5. Mêmes règles que sur PC : premier scan = début du rapatriement (bandeau + compteurs du DT en cours), alerte si le SSCC appartient à un autre DT ou est introuvable.

## Fonctionnalités communes

- **Alertes** (notification + carte colorée + son) si le SSCC scanné est introuvable dans le fichier, ou s'il appartient à un autre DT que celui du rapatriement en cours.
- Détecte les SSCC déjà scannés (doublon).
- Compteurs scopés au rapatriement en cours : palettes scannées / restantes de ce DT.
- Historique exportable en CSV.
- Le code GS1 (préfixe `00` envoyé par une douchette ou lu par la caméra sur une étiquette) est reconnu automatiquement.
- **Usage unique par session** : rien n'est sauvegardé. Un rechargement de page efface le fichier chargé, l'historique et le rapatriement en cours — seules les préférences d'affichage (thème, son) sont conservées.

## Notes techniques

- `index.html` et `mobile.html` sont deux pages HTML autonomes (CSS + JS + bibliothèques embarqués : [SheetJS](https://sheetjs.com) pour Excel, [ZXing](https://github.com/zxing-js/library) pour la lecture de code-barre côté mobile) — copiables telles quelles, aucune dépendance externe au chargement.
- La logique métier (lecture du fichier, correspondance SSCC → UM, compteurs, historique) est centralisée dans `src/core.js` et partagée par les deux interfaces (`src/desktop.js` et `src/mobile.js`), pour qu'elles se comportent toujours de façon identique.
- `./build.sh` régénère `index.html` et `mobile.html` à partir de `src/` et `vendor/` (bibliothèques figées, aucun accès réseau ni `npm` nécessaire) — à relancer après toute modification dans `src/`.
