#!/bin/sh
# Install the TeamKit stats bar into an AMP ADS instance (Linux).
#   sudo sh install-stats.sh [ADS instance name] [path to TeamKitStats.js]
# Defaults: ADS01, ./TeamKitStats.js. Idempotent: the <script> line is added only once.
# A backup of AMP.html is kept next to it (AMP.html.before-stats-<date>).
# Re-run after every AMP update (the update rewrites AMP.html).
set -e
ADS="${1:-ADS01}"
SRC="${2:-./TeamKitStats.js}"
AMPDATA="${AMPDATA:-/home/amp/.ampdata/instances}"
W="$AMPDATA/$ADS/WebRoot"
[ -f "$W/AMP.html" ] || { echo "Not found: $W/AMP.html (set AMPDATA or pass the ADS instance name)"; exit 1; }
[ -f "$SRC" ] || { echo "Not found: $SRC"; exit 1; }
OWNER="$(stat -c %U:%G "$W/AMP.html")"
install -o "${OWNER%%:*}" -g "${OWNER##*:}" -m 644 "$SRC" "$W/Scripts/TeamKitStats.js"
V="$(date +%s)"
if grep -q 'TeamKitStats.js' "$W/AMP.html"; then
  sed -i "s#TeamKitStats.js?v=[0-9]*#TeamKitStats.js?v=$V#" "$W/AMP.html"   # new version: bust the browser cache
else
  cp -p "$W/AMP.html" "$W/AMP.html.before-stats-$(date +%Y%m%d-%H%M%S)"
  sed -i "s#</body>#    <script type=\"text/javascript\" src=\"/Scripts/TeamKitStats.js?v=$V\"></script>\n</body>#" "$W/AMP.html"
fi
echo "Installed. Reload the ADS Instances page (Ctrl+F5)."
# Uninstall: restore AMP.html from the newest AMP.html.before-stats-* backup, or delete the <script> line,
# then remove $W/Scripts/TeamKitStats.js.
