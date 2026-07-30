# Rapatriement Mutual

Application web pour faire le lien entre le scan d'un **SSCC Mutual** (code-barre sur la palette reçue) et **votre UM** à coller physiquement dessus.

## Utilisation

1. Double-cliquez sur `index.html` pour l'ouvrir dans votre navigateur (Chrome, Edge ou Firefox). Aucune installation, aucun serveur, aucune connexion internet requise — tout fonctionne en local dans le navigateur.
2. **Chargez le fichier Excel** du rapatriement de la semaine (le fichier avec les onglets par jour et par DT, colonnes *A LIVRER LE, Article, Désignation article, Unité stk, Code palette, Qté, Pal, Poids Kg*) via la zone de chargement.
3. Branchez votre douchette USB à l'ordinateur (elle se comporte comme un clavier). Cliquez dans la **zone de scan**, puis scannez le SSCC collé sur la palette Mutual (colonne *Code palette*).
4. L'application affiche en grand l'**UM** (colonne *Unité stk*) correspondant à coller sur la palette, avec l'article, la désignation, le n° DT, la quantité et le poids pour vérification.
5. **Le premier scan démarre le rapatriement** : l'application annonce le jour et le n° DT concernés (bandeau + notification), et les affiche en continu pendant que vous scannez. Cliquez sur "Terminer" dans ce bandeau une fois le DT fini, avant de commencer le suivant.
6. Chaque scan est ajouté à l'**historique** (conservé même après fermeture du navigateur), exportable en CSV via le bouton "Exporter CSV".

## Fonctionnalités

- Fonctionne 100% hors-ligne, aucune donnée n'est envoyée sur internet.
- **Alertes** (notification + carte rouge/violette + son) si le SSCC scanné est introuvable dans le fichier, ou s'il appartient à un autre DT que celui du rapatriement en cours.
- Détecte les SSCC déjà scannés (doublon).
- Barre de progression : nombre de palettes scannées / restantes.
- Recherche manuelle (par article, désignation, SSCC ou UM) si un code-barre est illisible.
- Thème sombre par défaut (bascule claire disponible), son au scan, activables via les boutons en haut à droite.

## Notes techniques

- Fichier unique `index.html` (HTML + CSS + JS, bibliothèque [SheetJS](https://sheetjs.com) embarquée) — peut être copié tel quel sur n'importe quel PC.
- Les données du fichier chargé et l'historique des scans sont stockés dans le `localStorage` du navigateur (propre à chaque PC/navigateur).
- Chargez un nouveau fichier Excel chaque semaine pour mettre à jour les palettes à scanner ; l'historique des scans est conservé indépendamment.
