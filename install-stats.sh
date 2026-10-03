#!/bin/sh
# Install the TeamKit stats bar into an AMP ADS instance (Linux).
#   sudo sh install-stats.sh [ADS instance name] [path to TeamKitStats.js]
# Defaults: ADS01, ./TeamKitStats.js.
# Safe to run again and again (by hand or from cron): it only writes when something is missing or changed.
#   - script missing or different  -> copied, and the ?v= of the <script> line is bumped (browser cache)
#   - <script> line missing         -> added before </body>, after a backup (AMP.html.before-stats-<date>)
#   - everything already in place   -> nothing is touched, prints "Already installed."
# An AMP update rewrites AMP.html: run it again afterwards, or let cron do it (see README).
set -e
ADS="${1:-ADS01}"
SRC="${2:-./TeamKitStats.js}"
AMPDATA="${AMPDATA:-/home/amp/.ampdata/instances}"
W="$AMPDATA/$ADS/WebRoot"
DST="$W/Scripts/TeamKitStats.js"
[ -f "$W/AMP.html" ] || { echo "Not found: $W/AMP.html (set AMPDATA or pass the ADS instance name)"; exit 1; }
[ -f "$SRC" ] || { echo "Not found: $SRC"; exit 1; }
OWNER="$(stat -c %U:%G "$W/AMP.html")"
V="$(date +%s)"
CHANGED=0

if ! cmp -s "$SRC" "$DST"; then
  install -o "${OWNER%%:*}" -g "${OWNER##*:}" -m 644 "$SRC" "$DST"
  CHANGED=1
  echo "Script copied to $DST"
fi

if grep -q 'TeamKitStats.js' "$W/AMP.html"; then
  if [ "$CHANGED" = 1 ]; then
    sed -i "s#TeamKitStats.js?v=[0-9]*#TeamKitStats.js?v=$V#" "$W/AMP.html"   # new version: bust the browser cache
    echo "Cache version bumped in AMP.html"
  fi
else
  cp -p "$W/AMP.html" "$W/AMP.html.before-stats-$(date +%Y%m%d-%H%M%S)"
  sed -i "s#</body>#    <script type=\"text/javascript\" src=\"/Scripts/TeamKitStats.js?v=$V\"></script>\n</body>#" "$W/AMP.html"
  CHANGED=1
  echo "Script line added to AMP.html (backup kept next to it)"
fi

if [ "$CHANGED" = 1 ]; then
  echo "Installed. Reload the ADS page (Ctrl+F5)."
else
  echo "Already installed."
fi
# Uninstall: restore AMP.html from the newest AMP.html.before-stats-* backup, or delete the <script> line,
# then remove $W/Scripts/TeamKitStats.js. Remove the cron line too if you added one.
