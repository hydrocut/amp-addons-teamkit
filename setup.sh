#!/bin/sh
# MIT License: provided as is, WITHOUT ANY WARRANTY (see LICENSE); you use it under your own responsibility.
# AMP add-ons by TeamKit — interactive installer / updater / uninstaller (Linux).
#
#   curl -fsSL https://raw.githubusercontent.com/hydrocut/amp-addons-teamkit/main/setup.sh -o /tmp/amp-addons-setup.sh && sudo sh /tmp/amp-addons-setup.sh
#
# Asks the language (English / Français), finds the ADS instance, shows what is already installed, then lets you
# install, update, add the new features or uninstall. Nothing is restarted. Run it again at any time.
# Files live in /opt/amp-addons-teamkit (git clone, or a downloaded archive when git is missing),
# settings in /etc/amp-addons-teamkit. AMP_ADDONS_OFFLINE=1 uses the files already in /opt/amp-addons-teamkit.
#
# Everything is inside functions and main is called on the last line: the shell reads the whole script before running
# it, so updating /opt/amp-addons-teamkit (which contains this very file) during the run is safe.

REPO="https://github.com/hydrocut/amp-addons-teamkit"
TARBALL="$REPO/archive/refs/heads/main.tar.gz"
DIR="${AMP_ADDONS_DIR:-/opt/amp-addons-teamkit}"
CONF="${AMP_ADDONS_CONF:-/etc/amp-addons-teamkit}"
AMPDATA="${AMPDATA:-/home/amp/.ampdata/instances}"
CRON_DIR="${AMP_ADDONS_CRON_DIR:-/etc/cron.d}"
L=en

# ── small helpers ────────────────────────────────────────────────────────────
t() { if [ "$L" = fr ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }
say() { printf '%s\n' "$(t "$1" "$2")"; }
title() { printf '\n\033[1;36m== %s ==\033[0m\n' "$(t "$1" "$2")"; }
ok() { printf '  \033[32m✔\033[0m %s\n' "$(t "$1" "$2")"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$(t "$1" "$2")"; }
die() { printf '\033[31m%s\033[0m\n' "$(t "$1" "$2")"; exit 1; }

# answers come from the terminal even when the script itself is piped (curl ... | sh)
IN=/dev/tty
[ -r /dev/tty ] || IN=/dev/stdin
[ -n "$AMP_ADDONS_ANSWERS" ] && IN=/dev/stdin      # tests: answers on stdin
read_answer() { REPLY=""; read -r REPLY < "$IN" || REPLY=""; }

# ask "question fr" "question en" default(y/n) -> returns 0 for yes
ask_yn() {
  if [ "$3" = y ]; then hint="[O/n]"; [ "$L" = fr ] || hint="[Y/n]"; else hint="[o/N]"; [ "$L" = fr ] || hint="[y/N]"; fi
  printf '  %s %s ' "$(t "$1" "$2")" "$hint"
  read_answer
  case "$REPLY" in
    [oOyY]*) return 0 ;;
    [nN]*) return 1 ;;
    *) [ "$3" = y ] ;;
  esac
}
# ask_value "question fr" "question en" default -> $REPLY
ask_value() {
  printf '  %s [%s] ' "$(t "$1" "$2")" "$3"
  read_answer
  [ -n "$REPLY" ] || REPLY="$3"
}
ask_secret() {
  printf '  %s ' "$(t "$1" "$2")"
  if [ "$IN" = /dev/tty ]; then stty -echo < /dev/tty 2>/dev/null; read_answer; stty echo < /dev/tty 2>/dev/null; echo; else read_answer; fi
}

# ── steps ────────────────────────────────────────────────────────────────────
choose_language() {
  case "${LANG:-}${LC_ALL:-}" in fr*|*fr_*) d=1 ;; *) d=2 ;; esac
  printf '\n  1) Français\n  2) English\n  Langue / Language [%s] ' "$d"
  read_answer
  [ -n "$REPLY" ] || REPLY=$d
  if [ "$REPLY" = 1 ]; then L=fr; else L=en; fi
}

checks() {
  [ "$(id -u)" = 0 ] || die "Lance-le avec sudo : sudo sh $0" "Run it with sudo: sudo sh $0"
  [ -d "$AMPDATA" ] || die "Dossier des instances AMP introuvable : $AMPDATA (variable AMPDATA pour le changer)" \
                           "AMP instances folder not found: $AMPDATA (set AMPDATA to change it)"
  command -v sed >/dev/null && command -v cmp >/dev/null && command -v install >/dev/null || \
    die "Il manque sed, cmp ou install." "sed, cmp or install is missing."
}

find_ads() {
  ADS=""; n=0; list=""
  for d in "$AMPDATA"/*/; do
    d="${d%/}"
    if [ -f "$d/ADSModule.kvp" ] && [ -f "$d/WebRoot/AMP.html" ]; then n=$((n + 1)); list="$list ${d##*/}"; fi
  done
  if [ "$n" = 0 ]; then
    ask_value "Aucune instance ADS trouvée. Son nom (dossier dans $AMPDATA) ?" "No ADS instance found. Its name (folder in $AMPDATA)?" "ADS01"
    ADS="$REPLY"
  elif [ "$n" = 1 ]; then
    ADS="${list# }"
  else
    say "Plusieurs instances ADS :$list" "Several ADS instances:$list"
    ask_value "Laquelle ?" "Which one?" "${list# }"; ADS="${REPLY%% *}"
  fi
  W="$AMPDATA/$ADS/WebRoot"
  [ -f "$W/AMP.html" ] || die "Introuvable : $W/AMP.html" "Not found: $W/AMP.html"
  ok "ADS : $ADS" "ADS: $ADS"
}

fetch_files() {
  title "Fichiers" "Files"
  if [ -n "$AMP_ADDONS_OFFLINE" ] && [ -f "$DIR/install-stats.sh" ]; then
    ok "Hors ligne : fichiers déjà présents dans $DIR" "Offline: using the files already in $DIR"
  elif [ -d "$DIR/.git" ] && command -v git >/dev/null; then
    git -C "$DIR" pull --ff-only -q && ok "Mis à jour depuis GitHub ($DIR)" "Updated from GitHub ($DIR)" \
      || warn "Mise à jour impossible, on garde la version présente" "Could not update, keeping the current version"
  elif command -v git >/dev/null && [ ! -e "$DIR" ]; then
    git clone -q "$REPO.git" "$DIR" && ok "Téléchargé depuis GitHub ($DIR)" "Downloaded from GitHub ($DIR)" \
      || die "Téléchargement impossible." "Download failed."
  elif command -v curl >/dev/null && command -v tar >/dev/null; then
    mkdir -p "$DIR" && curl -fsSL "$TARBALL" | tar -xz -C "$DIR" --strip-components=1 \
      && ok "Téléchargé depuis GitHub ($DIR)" "Downloaded from GitHub ($DIR)" || die "Téléchargement impossible." "Download failed."
  elif [ -f "$DIR/install-stats.sh" ]; then
    warn "Ni git ni curl : on utilise les fichiers déjà présents" "No git nor curl: using the files already there"
  else
    die "Il faut git ou curl : sudo apt-get install -y git" "git or curl is needed: sudo apt-get install -y git"
  fi
  [ -f "$DIR/install-stats.sh" ] || die "Fichiers incomplets dans $DIR" "Incomplete files in $DIR"
}

# what is installed now
state() {
  S_THEMES=n; S_STATS=n; S_LANG=n; S_REPAIR=n; S_GUARD=n
  { [ -f "$W/Themes/TeamKit.css" ] || [ -f "$W/Themes/TeamKit-HUD.css" ] || [ -d "$W/Themes/AMPThemes/TeamKit" ]; } && S_THEMES=y
  grep -q "/Scripts/TeamKitStats.js" "$W/AMP.html" && S_STATS=y
  grep -q "/Scripts/TeamKitLang.js" "$W/AMP.html" && S_LANG=y
  [ -f "$CRON_DIR/amp-addons-teamkit" ] && S_REPAIR=y
  [ -f "$CONF/disk-limits.json" ] && S_GUARD=y
  return 0
}
show_state() {
  title "Ce qui est installé" "What is installed"
  line() { if [ "$1" = y ]; then printf '  \033[32m●\033[0m %s\n' "$(t "$2" "$3")"; else printf '  \033[90m○ %s\033[0m\n' "$(t "$2" "$3")"; fi; }
  line "$S_THEMES" "Thèmes TeamKit et TeamKit-HUD" "TeamKit and TeamKit-HUD themes"
  line "$S_STATS"  "Barre de stats, pastilles et jauge Disque" "Stats bar, badges and Disk gauge"
  line "$S_LANG"   "AMP en français (bouton FR | EN)" "AMP in French (FR | EN switch)"
  line "$S_REPAIR" "Remise en place après les mises à jour d'AMP (cron)" "Repair after AMP updates (cron)"
  line "$S_GUARD"  "Limites disque et gardien" "Disk limits and guard"
}

choose_components() {
  title "Que veux-tu installer ?" "What do you want to install?"
  dl=n; [ "$L" = fr ] && dl=y; [ "$S_LANG" = y ] && dl=y
  if ask_yn "Thèmes TeamKit et TeamKit-HUD ?" "TeamKit and TeamKit-HUD themes?" y; then C_THEMES=y; else C_THEMES=n; fi
  if ask_yn "Barre de stats, pastilles 💾 et jauge Disque ?" "Stats bar, 💾 badges and Disk gauge?" y; then C_STATS=y; else C_STATS=n; fi
  if ask_yn "AMP en français, avec un bouton FR | EN ?" "AMP in French, with an FR | EN switch?" "$dl"; then C_LANG=y; else C_LANG=n; fi
  if ask_yn "Les remettre tout seul après chaque mise à jour d'AMP (conseillé) ?" "Put them back by itself after every AMP update (recommended)?" y; then C_REPAIR=y; else C_REPAIR=n; fi
  dg=n; [ "$S_GUARD" = y ] && dg=y
  if ask_yn "Limites disque par serveur (et gardien) ?" "Disk limits per server (and guard)?" "$dg"; then C_GUARD=y; else C_GUARD=n; fi
}

apply_components() {
  title "Installation" "Installing"
  install -d -m 755 "$CONF"
  : > "$CONF/components"
  [ "$C_THEMES" = y ] && echo themes >> "$CONF/components"
  [ "$C_STATS" = y ] && echo stats >> "$CONF/components"
  [ "$C_LANG" = y ] && echo lang >> "$CONF/components"
  AMPDATA="$AMPDATA" AMP_ADDONS_COMPONENTS="$CONF/components" sh "$DIR/install-stats.sh" "$ADS" "$DIR" | sed 's/^/  /'
  # what was installed and is no longer wanted
  [ "$S_STATS" = y ] && [ "$C_STATS" = n ] && remove_script TeamKitStats.js && rm -f "$W/Scripts/TeamKitDisk.json"
  [ "$S_LANG" = y ] && [ "$C_LANG" = n ] && remove_script TeamKitLang.js && rm -f "$W/Locale/fr.json"
  [ "$S_THEMES" = y ] && [ "$C_THEMES" = n ] && remove_themes
  if [ "$C_REPAIR" = y ]; then
    printf '%s\n' "# AMP add-ons by TeamKit: put them back after AMP updates (setup.sh)" \
      "*/30 * * * * root AMPDATA=$AMPDATA AMP_ADDONS_COMPONENTS=$CONF/components sh $DIR/install-stats.sh $ADS $DIR >/dev/null 2>&1" > "$CRON_DIR/amp-addons-teamkit"
    ok "Remise en place automatique : toutes les 30 minutes" "Automatic repair: every 30 minutes"
  elif [ -f "$CRON_DIR/amp-addons-teamkit" ]; then
    rm -f "$CRON_DIR/amp-addons-teamkit"; ok "Remise en place automatique retirée" "Automatic repair removed"
  fi
  if [ "$C_GUARD" = y ]; then guard_setup; elif [ "$S_GUARD" = y ]; then guard_remove; fi
  return 0
}

remove_script() {   # $1 = TeamKitStats.js | TeamKitLang.js
  cp -p "$W/AMP.html" "$W/AMP.html.before-uninstall-$(date +%Y%m%d-%H%M%S)"
  sed -i "\#/Scripts/$1#d" "$W/AMP.html"
  rm -f "$W/Scripts/$1"
  ok "Retiré : $1" "Removed: $1"
}
remove_themes() {
  for T in TeamKit TeamKit-HUD; do
    if [ -f "$W/Themes/.$T.by-teamkit-installer" ]; then rm -f "$W/Themes/$T.css" "$W/Themes/.$T.by-teamkit-installer"; ok "Thème retiré : $T" "Theme removed: $T"; fi
  done
  if grep -qs '^AMP.Theme=TeamKit' "$AMPDATA/$ADS/AMPConfig.conf"; then
    warn "ADS utilise encore un thème TeamKit : choisis-en un autre dans ADS → Configuration" "ADS still uses a TeamKit theme: pick another one in ADS → Configuration"
  fi
}

guard_setup() {
  title "Limites disque" "Disk limits"
  command -v python3 >/dev/null || { warn "python3 manquant : sudo apt-get install -y python3. Gardien non installé." "python3 is missing: sudo apt-get install -y python3. Guard not installed."; return 0; }
  if [ -f "$CONF/disk-limits.json" ] && ! ask_yn "Une config existe déjà. La refaire ?" "A config already exists. Redo it?" n; then
    ok "Config gardée : $CONF/disk-limits.json" "Config kept: $CONF/disk-limits.json"
  else
    say "Ce que la jauge Disque compare :" "What the Disk gauge compares:"
    say "  1) ce serveur / sa propre limite (conseillé)" "  1) this server / its own limit (recommended)"
    say "  2) ce serveur / la limite du stockage" "  2) this server / the datastore limit"
    say "  3) tous les serveurs / la limite du stockage" "  3) all servers / the datastore limit"
    ask_value "Choix" "Choice" 1
    case "$REPLY" in 2) G_DISPLAY=instance-datastore ;; 3) G_DISPLAY=all-datastore ;; *) G_DISPLAY=instance-limit ;; esac
    ask_value "Limite par défaut de chaque serveur, en Go (0 = aucune)" "Default limit for every server, in GB (0 = none)" 0; G_DEFAULT="$REPLY"
    ask_value "Alerte à combien de % de la limite ?" "Warning at what % of the limit?" 90; G_WARN="$REPLY"
    ask_value "Coupure du jeu à combien de % ?" "Stop the game at what %?" 100; G_STOP="$REPLY"
    say "Les limites par jeu ou par serveur se mettent ensuite dans $CONF/disk-limits.json (\"templates\", \"instances\")." \
        "Limits per game or per server go in $CONF/disk-limits.json afterwards (\"templates\", \"instances\")."
    G_ENFORCE=false; G_USER=""; G_URL="http://127.0.0.1:8080"; G_HOOK=""
    if ask_yn "Couper vraiment le jeu quand le disque est plein ? (sinon : affichage seul)" "Really stop the game when the disk is full? (otherwise: display only)" n; then
      G_ENFORCE=true
      say "Il faut un compte AMP qui voit et peut arrêter les instances (crée-en un dédié dans ADS)." "An AMP account that can see and stop the instances is needed (create a dedicated one in ADS)."
      ask_value "Adresse d'AMP" "AMP address" "$G_URL"; G_URL="$REPLY"
      ask_value "Nom du compte AMP" "AMP account name" "diskguard"; G_USER="$REPLY"
      ask_secret "Mot de passe (rien ne s'affiche en tapant) :" "Password (nothing shows while typing):"
      install -d -m 700 "$CONF"
      umask 077; printf '%s' "$REPLY" > "$CONF/amp-password"; chmod 600 "$CONF/amp-password"; umask 022
      ask_value "Webhook Discord pour être prévenu (vide = aucun)" "Discord webhook to be notified (empty = none)" ""; G_HOOK="$REPLY"
    fi
    install -d -m 700 "$CONF"
    G_DISPLAY="$G_DISPLAY" G_DEFAULT="$G_DEFAULT" G_WARN="$G_WARN" G_STOP="$G_STOP" G_ENFORCE="$G_ENFORCE" G_URL="$G_URL" \
    G_USER="$G_USER" G_HOOK="$G_HOOK" G_ADS="$ADS" G_AMPDATA="$AMPDATA" G_PASS="$CONF/amp-password" G_OUT="$CONF/disk-limits.json" \
    python3 - <<'PY'
import json, os
e = os.environ
def num(v, d):
    try: return float(v.replace(',', '.'))
    except Exception: return d
cfg = {
    "display": e["G_DISPLAY"], "default_limit_gb": num(e["G_DEFAULT"], 0), "templates": {}, "instances": {},
    "warn_pct": int(num(e["G_WARN"], 90)), "stop_pct": int(num(e["G_STOP"], 100)), "enforce": e["G_ENFORCE"] == "true",
    "webhook": e["G_HOOK"], "ads_instance": e["G_ADS"], "ampdata": e["G_AMPDATA"],
    "amp": {"url": e["G_URL"], "user": e["G_USER"], "password_file": e["G_PASS"] if e["G_USER"] else "", "verify_tls": True},
    "import": {"url": "", "header": "", "secret_file": ""},
}
fd = os.open(e["G_OUT"], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, (json.dumps(cfg, indent=2, ensure_ascii=False) + "\n").encode()); os.close(fd)
PY
    ok "Config écrite : $CONF/disk-limits.json" "Config written: $CONF/disk-limits.json"
  fi
  say "Essai à blanc :" "Dry run:"
  python3 "$DIR/disk-guard.py" --config "$CONF/disk-limits.json" --dry-run 2>&1 | sed 's/^/    /'
  python3 "$DIR/disk-guard.py" --config "$CONF/disk-limits.json" 2>&1 | sed 's/^/    /'
  printf '%s\n' "# AMP add-ons by TeamKit: disk guard every 5 minutes (setup.sh)" \
    "*/5 * * * * root /usr/bin/python3 $DIR/disk-guard.py --config $CONF/disk-limits.json >> /var/log/amp-disk-guard.log 2>&1" > "$CRON_DIR/amp-disk-guard"
  ok "Gardien : toutes les 5 minutes (journal /var/log/amp-disk-guard.log)" "Guard: every 5 minutes (log /var/log/amp-disk-guard.log)"
}
guard_remove() {
  rm -f "$CRON_DIR/amp-disk-guard" "$W/Scripts/TeamKitDisk.json"
  ok "Gardien disque arrêté" "Disk guard stopped"
  if ask_yn "Supprimer aussi sa config ($CONF/disk-limits.json) ?" "Also delete its config ($CONF/disk-limits.json)?" n; then
    rm -f "$CONF/disk-limits.json" "$CONF/amp-password"; ok "Config supprimée" "Config deleted"
  fi
}

uninstall_all() {
  title "Désinstallation" "Uninstall"
  ask_yn "Tout retirer (thèmes posés par l'installeur, scripts, traduction, cron, gardien) ?" "Remove everything (themes placed by the installer, scripts, translation, cron, guard)?" n || return 0
  [ "$S_STATS" = y ] && remove_script TeamKitStats.js
  [ "$S_LANG" = y ] && remove_script TeamKitLang.js
  rm -f "$W/Scripts/TeamKitDisk.json" "$W/Locale/fr.json" "$CRON_DIR/amp-addons-teamkit"
  remove_themes
  [ "$S_GUARD" = y ] && guard_remove
  rm -f "$CONF/components"
  ok "C'est fait. Recharge la page d'AMP (Ctrl+F5). Les fichiers restent dans $DIR." "Done. Reload the AMP page (Ctrl+F5). Files stay in $DIR."
}

disclaimer() {
  title "Avertissement" "Disclaimer"
  say "Ces ajouts sont fournis tels quels, gratuitement, SANS AUCUNE GARANTIE (licence MIT)." \
      "These add-ons are provided as is, for free, WITHOUT ANY WARRANTY (MIT License)."
  say "Ils marchent sur la configuration de l'auteur, pas forcément sur la tienne. Fais une sauvegarde avant." \
      "They work on the author's setup, not necessarily on yours. Make a backup first."
  say "Tu les installes sous ta seule responsabilité : l'auteur n'est responsable d'aucune casse ni perte." \
      "You install them under your own responsibility: the author is not liable for any damage or loss."
  say "Sans lien avec CubeCoders." "Not affiliated with CubeCoders."
  ask_yn "J'ai compris et j'accepte. Continuer ?" "I understand and accept. Continue?" n || { say "Rien n'a été modifié." "Nothing was changed."; exit 0; }
}

main() {
  printf '\n\033[1mAMP add-ons by TeamKit\033[0m — %s\n' "$REPO"
  choose_language
  disclaimer
  checks
  find_ads
  state
  show_state
  title "Que faire ?" "What now?"
  say "  1) Installer ou mettre à jour, et choisir les fonctions" "  1) Install or update, and choose the features"
  say "  2) Mettre à jour seulement ce qui est installé" "  2) Only update what is installed"
  say "  3) Tout désinstaller" "  3) Uninstall everything"
  say "  4) Quitter" "  4) Quit"
  ask_value "Choix" "Choice" 1
  case "$REPLY" in
    2) fetch_files
       C_THEMES=$S_THEMES; C_STATS=$S_STATS; C_LANG=$S_LANG; C_REPAIR=$S_REPAIR; C_GUARD=n
       if [ "$S_GUARD" = y ]; then
         python3 "$DIR/disk-guard.py" --config "$CONF/disk-limits.json" >/dev/null 2>&1; ok "Gardien relancé avec la nouvelle version" "Guard re-run with the new version"
       fi
       S_GUARD=n; apply_components ;;
    3) uninstall_all ;;
    4) exit 0 ;;
    *) fetch_files; choose_components; apply_components ;;
  esac
  state
  show_state
  say "" ""
  say "Recharge la page d'AMP avec Ctrl+F5. Pour revenir ici plus tard : sudo sh $DIR/setup.sh" \
      "Reload the AMP page with Ctrl+F5. To come back here later: sudo sh $DIR/setup.sh"
  if [ "$C_THEMES" = y ]; then say "Thème : ADS → Configuration → TeamKit ou TeamKit-HUD." "Theme: ADS → Configuration → TeamKit or TeamKit-HUD."; fi
}

main "$@"
