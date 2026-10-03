#!/bin/sh
# MIT License: provided as is, WITHOUT ANY WARRANTY (see LICENSE); you use it under your own responsibility.
# Install (or repair after an AMP update) the TeamKit add-ons into an AMP ADS instance (Linux).
#   sudo sh install-stats.sh [ADS instance name] [folder of the add-on files]
# Defaults: ADS01, the folder of this script.
# Installs whatever is present in that folder:
#   TeamKit.css, TeamKit-HUD.css  the themes (WebRoot/Themes/), to pick in ADS > Configuration
#   TeamKitStats.js  stats bar, disk badges and Disk gauge
#   TeamKitLang.js   French for AMP (needs fr.json)
#   fr.json          the dictionary, copied to WebRoot/Locale/fr.json
#   TeamKitSupport.js  AMP's support buttons sent to YOUR support (needs /etc/amp-addons-teamkit/support.json)
# Easiest: run setup.sh instead (questions, language, update, uninstall). This script is what setup.sh and cron call.
# Safe to run again and again (by hand or from cron): it only writes when something is missing or changed.
#   - file missing or different -> copied; for a script, its ?v= is bumped (browser cache)
#   - <script> line missing     -> added before </body>, after a backup (AMP.html.before-stats-<date>)
#   - everything in place       -> nothing is touched, prints "Already installed."
# An AMP update rewrites AMP.html: run it again afterwards, or let cron do it (see README).
set -e
ADS="${1:-ADS01}"
SRC="${2:-$(dirname "$0")}"
[ -f "$SRC" ] && SRC="$(dirname "$SRC")"     # older usage: path to TeamKitStats.js
AMPDATA="${AMPDATA:-/home/amp/.ampdata/instances}"
W="$AMPDATA/$ADS/WebRoot"
[ -f "$W/AMP.html" ] || { echo "Not found: $W/AMP.html (set AMPDATA or pass the ADS instance name)"; exit 1; }
OWNER="$(stat -c %U:%G "$W/AMP.html")"
U="${OWNER%%:*}"; G="${OWNER##*:}"
V="$(date +%s)"
CHANGED=0
BACKUP_DONE=0

script() {   # $1 = file name in Scripts/
  F="$1"
  [ -f "$SRC/$F" ] || return 0
  NEW=0
  if ! cmp -s "$SRC/$F" "$W/Scripts/$F"; then
    install -o "$U" -g "$G" -m 644 "$SRC/$F" "$W/Scripts/$F"
    NEW=1; CHANGED=1
    echo "Copied $F"
  fi
  if grep -q "/Scripts/$F" "$W/AMP.html"; then
    if [ "$NEW" = 1 ]; then
      sed -i "s#/Scripts/$F?v=[0-9]*#/Scripts/$F?v=$V#" "$W/AMP.html"
      echo "Cache version bumped for $F"
    fi
  else
    if [ "$BACKUP_DONE" = 0 ]; then
      cp -p "$W/AMP.html" "$W/AMP.html.before-stats-$(date +%Y%m%d-%H%M%S)"
      BACKUP_DONE=1
    fi
    sed -i "s#</body>#    <script type=\"text/javascript\" src=\"/Scripts/$F?v=$V\"></script>\n</body>#" "$W/AMP.html"
    CHANGED=1
    echo "Script line added for $F (backup of AMP.html kept next to it)"
  fi
}

# Components chosen with setup.sh (one per line: themes, stats, lang). No file = install everything present.
COMPONENTS="${AMP_ADDONS_COMPONENTS:-/etc/amp-addons-teamkit/components}"
want() { [ -f "$COMPONENTS" ] || return 0; grep -qx "$1" "$COMPONENTS"; }

if want stats; then script TeamKitStats.js; fi
if want lang; then script TeamKitLang.js; fi
# Your own support (setup.sh writes the settings): the script + its settings, both put back after an AMP update
CONF_DIR="${AMP_ADDONS_CONF:-/etc/amp-addons-teamkit}"
if want support && [ -f "$CONF_DIR/support.json" ]; then
  script TeamKitSupport.js
  if ! cmp -s "$CONF_DIR/support.json" "$W/Scripts/TeamKitSupport.json"; then
    install -o "$U" -g "$G" -m 644 "$CONF_DIR/support.json" "$W/Scripts/TeamKitSupport.json"
    CHANGED=1
    echo "Copied the support settings (Scripts/TeamKitSupport.json)"
  fi
fi

want themes && for T in TeamKit.css TeamKit-HUD.css; do   # themes: then pick one in ADS > Configuration
  N="${T%.css}"
  # Installed from the AMP theme store (Themes/AMPThemes/<Name>/)? Then leave it to the store: a local file with the
  # same name would win over it (checked on AMP 2.8.0.8) and could hide a newer store version.
  if [ -f "$W/Themes/AMPThemes/$N/$T" ]; then
    if [ -f "$W/Themes/$T" ] && [ -f "$W/Themes/.$N.by-teamkit-installer" ]; then
      rm -f "$W/Themes/$T" "$W/Themes/.$N.by-teamkit-installer"; CHANGED=1
      echo "Theme $N now comes from the AMP theme store: local copy removed"
    fi
    continue
  fi
  if [ -f "$SRC/$T" ] && ! cmp -s "$SRC/$T" "$W/Themes/$T"; then
    install -d -o "$U" -g "$G" -m 755 "$W/Themes"
    install -o "$U" -g "$G" -m 644 "$SRC/$T" "$W/Themes/$T"
    install -o "$U" -g "$G" -m 644 /dev/null "$W/Themes/.$N.by-teamkit-installer"
    CHANGED=1
    echo "Copied theme $T"
  fi
done

if want lang && [ -f "$SRC/fr.json" ] && ! cmp -s "$SRC/fr.json" "$W/Locale/fr.json"; then
  install -d -o "$U" -g "$G" -m 755 "$W/Locale"
  install -o "$U" -g "$G" -m 644 "$SRC/fr.json" "$W/Locale/fr.json"
  CHANGED=1
  echo "Copied fr.json to Locale/"
fi

if [ "$CHANGED" = 1 ]; then
  echo "Installed. Reload the ADS page (Ctrl+F5)."
else
  echo "Already installed."
fi
# Uninstall: restore AMP.html from the newest AMP.html.before-stats-* backup, or delete the <script> lines,
# then remove WebRoot/Scripts/TeamKitStats.js, TeamKitLang.js, TeamKitSupport.js(on), TeamKitDisk.json, WebRoot/Locale/fr.json
# and WebRoot/Themes/TeamKit*.css (pick another theme in ADS first).
# Remove the cron lines too if you added them.
