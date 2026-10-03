# AMP add-ons by TeamKit

Small, unofficial customisations for [AMP by CubeCoders](https://cubecoders.com/AMP), made and used daily on the
[TeamKit](https://www.teamkit.fr) game servers (French gaming community, free hosted servers).
*Version française : [LISEZMOI.md](LISEZMOI.md).*

| Add-on | What it does | How it is installed |
|---|---|---|
| **TeamKit theme** | dark night-blue theme with soft cyan and violet accents, tuned for long sessions | a CSS theme, the official way |
| **TeamKit-HUD theme** | the same theme, plus a game-HUD Status page: three large glowing gauges and big round buttons | a CSS theme, the official way |
| **Stats bar** | tiles above the instance list: machine, servers running, players online, RAM, CPU, datastore usage and limit; a `💾 X GB` badge on each instance card; a fourth **Disk** gauge on the Status page of every instance | one JavaScript file + one line in `AMP.html` |
| **Disk limits and guard** | a limit per game or per instance in one config file: gauges and badges show `used / limit`, and (optionally) the game is stopped when the disk is full, File Manager and SFTP staying open | `disk-guard.py`, every 5 minutes (optional) |

## Screenshots

The stats bar works in **all four layouts** of the Instances page (the four buttons at the top right: cards or list, by group or by machine). Each instance also gets a `💾` disk badge.

| Cards, by group | List, by group |
|---|---|
| ![Cards by group, with the stats bar](screenshots/instances-with-stats.png) | ![List by group, with the stats bar](screenshots/instances-list-groups.png) |
| **Cards, by machine** | **List, by machine** |
| ![Cards by machine, with the stats bar](screenshots/instances-cards-machine.png) | ![List by machine, with the stats bar](screenshots/instances-list-machine.png) |

**The same page without the add-on** (theme only):

![Instances page, theme only](screenshots/instances-without-stats.png)

**TeamKit-HUD: the instance Status page** with its large gauges and round buttons. The fourth gauge, **Disk** (instance disk / datastore limit), is added by the stats script:

![Status page with the TeamKit-HUD theme](screenshots/status-hud.png)

*Screenshots taken on the TeamKit panel; server addresses are hidden.*

## 1. Themes (official, safe)

AMP loads any CSS file placed in `ADS01/WebRoot/Themes/`.

1. Copy `TeamKit.css` (or `TeamKit-HUD.css`) to `/home/amp/.ampdata/instances/ADS01/WebRoot/Themes/`.
2. In ADS, open **Configuration**, pick the theme, save. The ADS theme also applies to every instance page opened from ADS.
3. Preview without switching: `https://<your-amp>/ThemePreview.html?theme=TeamKit`.

Both themes are also proposed to the official theme store ([CubeCoders/AMPThemes](https://github.com/CubeCoders/AMPThemes)).

## 2. Stats bar (unofficial, read-only)

A theme cannot add data, so this one is a script. It only **reads** what ADS already sends to the page:

- `API.ADSModule.GetInstancesAsync()`: machine (`Platform.CPUInfo`, `InstalledRAMMB`) and, per instance, `Running`,
  `AppState` (20 = running), `DiskUsageMB` and `Metrics["CPU Usage" | "Memory Usage" | "Active Users"]`;
- `API.ADSModule.GetDatastoresAsync()`: `CurrentUsageMB` and `SoftLimitMB` of each datastore.

It changes nothing, refreshes every 15 s, and fails silently (no error can break ADS).

- The **bar** is shown to users who have `Core.UserManagement.ViewActiveSessions` (admins).
- The **disk badges** are shown to everyone, each user seeing only their own instances.
- The **Disk gauge** on an instance Status page is shown to everyone who can open that instance. Its ring is the
  instance disk divided by the datastore soft limit (the only limit ADS knows); without access to the datastores the ring stays empty.
- Texts follow the browser language: French or English.

### Requirements

- AMP with an ADS controller on Linux. Tested on **AMP 2.8.0.8** (Proteus), instances in Docker containers.
- A recent browser (the 4-gauge layout uses CSS `:has()`). Tested with Chrome.
- Root (or the `amp` user) on the machine, to copy one file and edit `AMP.html`.

### Install (Linux)

```sh
sudo sh install-stats.sh            # ADS01 and ./TeamKitStats.js by default
sudo sh install-stats.sh MyADS /path/TeamKitStats.js
```

The script copies `TeamKitStats.js` into `WebRoot/Scripts/`, adds a single `<script>` line before `</body>` of
`WebRoot/AMP.html`, and keeps a backup (`AMP.html.before-stats-<date>`). Reload the Instances page with Ctrl+F5.

It can be run as often as you like: when everything is already in place it touches nothing and prints
`Already installed.` The `?v=` cache number only changes when the script itself changed.

### Every instance, including the ones created later

Nothing is installed per instance. When you open an instance from ADS, its page is loaded in a frame of the ADS page
(same address, `/instance/<InstanceID>`). The script running in ADS finds that frame, reads the instance disk usage
from `GetInstancesAsync()` (`DiskUsageMB`) and adds the **Disk** gauge next to CPU, Memory and Users, by copying AMP's
own CPU gauge, so it follows the theme. An instance created tomorrow, by hand or by an automation, gets it straight away.

Only exception: someone who logs in **directly** on an instance's own web port (not through ADS) does not load the
ADS page, so no gauge there.

### Keep it after AMP updates (optional cron)

An AMP update rewrites `AMP.html` and drops the `<script>` line. Since the installer only writes when something is
missing, a cron job can put it back by itself:

```sh
# /etc/cron.d/teamkit-stats : every 30 minutes, silent when there is nothing to do
*/30 * * * * root sh /opt/amp-addons-teamkit/install-stats.sh ADS01 /opt/amp-addons-teamkit/TeamKitStats.js >/dev/null
```

Use absolute paths (cron does not start in the repository folder). Custom themes in `WebRoot/Themes/` can also be
removed by an update: keep a copy and put them back if the theme switches to the default.

### Things to know

- **An AMP update rewrites `AMP.html`**: the bar disappears (nothing breaks). Run `install-stats.sh` again, or use the cron line above.
- RAM and CPU are the **sum of the instances**, not a measure of the whole machine (the OS and Docker are not counted).
- ADS does not report the free space of the disk, only the datastore usage and its soft limit.
- Disk figures come from ADS (`DiskUsageMB`), which measures them now and then: a few minutes of delay is normal.
- Before contacting CubeCoders support about the web interface, uninstall it or mention it.

### Troubleshooting

| What you see | What to check |
|---|---|
| Nothing changed | Reload with **Ctrl+F5**. In the browser console, `document.querySelector('script[src*=TeamKitStats]')` must not be `null`; if it is, `AMP.html` was rewritten: run the installer again. |
| Badges and gauge, but no bar | The bar is for admins only (`Core.UserManagement.ViewActiveSessions`). |
| No bar for an admin | `typeof API` in the console must be `"object"`; `localStorage.tkStatsOff` must not be `"1"`. |
| No Disk gauge on a Status page | Open the instance from ADS, not from its own port. Wait 15 s (one refresh). |
| The theme went back to default | An AMP update removed `WebRoot/Themes/TeamKit*.css`: copy them again. |

### Uninstall

Restore the newest `AMP.html.before-stats-*` (or delete the `TeamKitStats.js` line), then delete `WebRoot/Scripts/TeamKitStats.js`
and the cron line if you added one.

### Customise

- Hide it in one browser only: run `localStorage.tkStatsOff = '1'` in the console (`localStorage.removeItem('tkStatsOff')` to bring it back).
- Who sees the bar: change the permission in `estAdmin()`.
- Refresh rate: `15000` (ms) in `rafraichir()`.
- Placement: the bar is inserted before the first visible `div.ServerGroupContainer`; badges go under the `h3` of each `div.ServerEntry`.
- Disk gauge colour: `#f0b35a` in `styleCadre()`; the gauge is placed after the Users gauge (`ActiveUsers`).
- Colours come from the theme variables (`--tk-carte`, `--tk-bord`, `--tk-texte`…) with dark fallbacks, so it also fits other themes.

## 3. Disk limits and disk guard (optional)

AMP does not limit the disk of an instance. `disk-guard.py` adds that, with one config file:

- **Display**: the Disk gauge and the `💾` badges show `used / limit` and turn **orange** at the warning threshold,
  **red** at 100 %. The admin bar counts the instances over their limit.
- **Guard** (off by default): above the stop threshold it stops the **game** of the instance (`Core/Stop`).
  The AMP instance itself keeps running, so its **File Manager and SFTP stay open** to delete files. An instance
  restarted while still full is stopped again on the next run. Optional Discord webhook (warning once a day, stop once an hour).

Python 3.7+, standard library only, runs every 5 minutes from cron or a systemd timer.

### The config file

Copy `disk-limits.example.json` to `/etc/amp-addons-teamkit/disk-limits.json` (`chmod 600`: it may hold a webhook).

| Key | Meaning |
|---|---|
| `display` | what the Disk gauge compares: `instance-limit` (this instance / its own limit, falls back to the datastore when it has none), `instance-datastore` (this instance / datastore limit), `all-datastore` (all instances / datastore limit) |
| `default_limit_gb` | limit for every instance without a more precise one (`0` = none) |
| `templates` | limit per game, in GB, by the name AMP shows (`ModuleDisplayName`, e.g. `"Empyrion Galactic Survival"`, or `Module`, e.g. `"Minecraft"`) |
| `instances` | limit per instance, in GB, by `InstanceName`, `FriendlyName` or `InstanceID` — wins over `templates` |
| `warn_pct`, `stop_pct` | warning and stop thresholds, in % of the limit (default 90 and 100) |
| `enforce` | `false` = display only (default). `true` = stop the game above `stop_pct` |
| `webhook` | optional Discord webhook URL for warnings and stops |
| `amp` | `url`, `user`, `password_file`: an AMP account allowed to see and stop the instances. Needed for `enforce`, and to turn instance names into IDs |
| `ads_instance`, `ampdata` | where ADS lives (`ADS01`, `/home/amp/.ampdata/instances`) |
| `import` | optional: `url` of a JSON `{"instances_mb": {"<InstanceID>": MB}, "warn_pct": n, "stop_pct": n}` (plus `header` and `secret_file` if it needs a key), to take the limits from your own panel or database |

Precedence for one instance: `instances` > `import` > `templates` > `default_limit_gb`.

### Install

```sh
sudo install -d -m 755 /opt/amp-addons-teamkit && sudo install -d -m 700 /etc/amp-addons-teamkit
sudo install -m 755 disk-guard.py /opt/amp-addons-teamkit/
sudo install -m 600 disk-limits.example.json /etc/amp-addons-teamkit/disk-limits.json   # then edit it
sudo python3 /opt/amp-addons-teamkit/disk-guard.py --dry-run --verbose                  # shows what it would do
```

Then every 5 minutes, for example in `/etc/cron.d/amp-disk-guard`:

```sh
*/5 * * * * root /usr/bin/python3 /opt/amp-addons-teamkit/disk-guard.py >> /var/log/amp-disk-guard.log 2>&1
```

It writes `WebRoot/Scripts/TeamKitDisk.json` in the ADS instance (only when something changed): display mode,
thresholds and limits by instance ID or game name. **This file is readable without logging in**: it never holds the
account, the password or the webhook. Configure `amp` so that instance names are published as IDs.

For the AMP account, create a dedicated user in ADS with access to the instances (and only that); put its password
alone in the `password_file` (`chmod 600`).

### Good to know

- Disk figures come from ADS (`DiskUsageMB`), measured now and then: after a clean-up, the gauge can take a few
  minutes to follow, and a game restarted too early may be stopped once more.
- Stopping the game is not a hard quota: files written while the game is stopped (uploads by SFTP) are not blocked.
- Test with `"enforce": false` and `--dry-run` first.

## Licence

Free to use, copy and adapt. A mention of TeamKit is appreciated, not required. Not affiliated with CubeCoders.
