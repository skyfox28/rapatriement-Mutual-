# Rapatriement Mutual

Créé par Galaad Poivey

Application web pour faire le lien entre le scan d'un **SSCC Mutual** (code-barre sur la palette reçue) et **votre UM** à coller physiquement dessus.

## Utilisation

1. Double-cliquez sur `index.html` pour l'ouvrir dans votre navigateur (Chrome, Edge ou Firefox). Aucune installation, aucun serveur, aucune connexion internet requise — tout fonctionne en local dans le navigateur.
2. **Chargez le fichier Excel** du rapatriement de la semaine (le fichier avec les onglets par jour et par DT, colonnes *A LIVRER LE, Article, Désignation article, Unité stk, Code palette, Qté, Pal, Poids Kg*) via la zone de chargement.
3. Branchez votre douchette USB à l'ordinateur (elle se comporte comme un clavier). Cliquez dans la **zone de scan**, puis scannez le SSCC collé sur la palette Mutual (colonne *Code palette*).
4. L'application affiche en grand l'**UM** (colonne *Unité stk*) correspondant à coller sur la palette, avec l'article, la désignation, le n° DT, la quantité et le poids pour vérification.
5. **Le premier scan démarre le rapatriement** : l'application annonce le jour et le n° DT concernés (bandeau + notification), et compte désormais les palettes **de ce DT uniquement** (scannées / restantes) — pas le total de tout le fichier. Cliquez sur "Terminer" dans ce bandeau une fois le DT fini, avant de commencer le suivant.
6. Chaque scan est ajouté à l'**historique** de la session en cours, exportable en CSV via le bouton "Exporter CSV".

## Fonctionnalités

- Fonctionne 100% hors-ligne, aucune donnée n'est envoyée sur internet.
- **Alertes** (notification + carte rouge/violette + son) si le SSCC scanné est introuvable dans le fichier, ou s'il appartient à un autre DT que celui du rapatriement en cours.
- Détecte les SSCC déjà scannés (doublon).
- Barre de progression scopée au rapatriement en cours : nombre de palettes scannées / restantes de ce DT.
- Recherche manuelle (par article, désignation, SSCC ou UM) si un code-barre est illisible.
- Thème sombre par défaut (bascule claire disponible), son au scan, activables via les boutons en haut à droite.

## Notes techniques

- Fichier unique `index.html` (HTML + CSS + JS, bibliothèque [SheetJS](https://sheetjs.com) embarquée) — peut être copié tel quel sur n'importe quel PC.
- **Application à usage unique par session** : rien n'est sauvegardé. Un rechargement de la page efface le fichier chargé, l'historique et le rapatriement en cours — il faut recharger l'Excel et rescanner. Seules les préférences d'affichage (thème, son) sont conservées.
