#!/usr/bin/env bash
#
# Assemble les pages autonomes de Rapatriement Mutual à partir de src/ et vendor/.
#
#   ./build.sh
#
# Produit deux fichiers HTML autoportants (CSS, JS et bibliothèques inclus) :
#   index.html   poste PC avec douchette USB — utilisable en double-clic
#   mobile.html  iPhone/Android avec l'appareil photo — à servir en HTTPS
#
# Les bibliothèques sont figées dans vendor/, le build ne nécessite donc ni
# npm ni accès réseau.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/src"
VENDOR="$ROOT/vendor"

for f in "$VENDOR/xlsx.core.min.js" "$VENDOR/zxing.min.js" "$SRC/core.js"; do
  [ -f "$f" ] || { echo "Fichier manquant : $f" >&2; exit 1; }
done

# build_page <sortie> <head> <css> <body> <js-interface> <lib...>
build_page() {
  local out="$1" head="$2" css="$3" body="$4" ui="$5"
  shift 5

  {
    echo '<!DOCTYPE html>'
    echo '<html lang="fr">'
    echo '<head>'
    cat "$head"
    echo '<style>'
    cat "$css"
    echo '</style>'
    echo '</head>'
    echo '<body>'
    cat "$body"
    for lib in "$@"; do
      echo '<script>'
      cat "$lib"
      echo '</script>'
    done
    echo '<script>'
    cat "$SRC/core.js"
    echo '</script>'
    echo '<script>'
    cat "$ui"
    echo '</script>'
    echo '</body>'
    echo '</html>'
  } > "$out"

  echo "  $(basename "$out")  ($(du -h "$out" | cut -f1))"
}

echo "Construction des pages :"

build_page "$ROOT/index.html" \
  "$SRC/head-desktop.html" "$SRC/desktop.css" "$SRC/desktop-body.html" "$SRC/desktop.js" \
  "$VENDOR/xlsx.core.min.js"

build_page "$ROOT/mobile.html" \
  "$SRC/head-mobile.html" "$SRC/mobile.css" "$SRC/mobile-body.html" "$SRC/mobile.js" \
  "$VENDOR/xlsx.core.min.js" "$VENDOR/zxing.min.js"

echo "Terminé."
