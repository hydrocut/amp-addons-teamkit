# AMP add-ons by TeamKit

Small, unofficial customisations for [AMP by CubeCoders](https://cubecoders.com/AMP), made and used daily on the
[TeamKit](https://www.teamkit.fr) game servers (French gaming community, free hosted servers).
*Version française : [LISEZMOI.md](LISEZMOI.md).*

| Add-on | What it does | How it is installed |
|---|---|---|
| **TeamKit theme** | dark night-blue theme with soft cyan and violet accents, tuned for long sessions | a CSS theme, the official way |
| **TeamKit-HUD theme** | the same theme, plus a game-HUD Status page: three large glowing gauges and big round buttons | a CSS theme, the official way |
| **Stats bar** | tiles above the instance list: machine, servers running, players online, RAM, CPU, datastore usage and limit; a `💾 X GB` badge on each instance card | one JavaScript file + one line in `AMP.html` |

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
- Texts follow the browser language: French or English.

### Install (Linux)

```sh
sudo sh install-stats.sh            # ADS01 and ./TeamKitStats.js by default
sudo sh install-stats.sh MyADS /path/TeamKitStats.js
```

The script copies `TeamKitStats.js` into `WebRoot/Scripts/`, adds a single `<script>` line before `</body>` of
`WebRoot/AMP.html`, and keeps a backup (`AMP.html.before-stats-<date>`). Reload the Instances page with Ctrl+F5.

### Things to know

- **An AMP update rewrites `AMP.html`**: the bar disappears (nothing breaks). Run `install-stats.sh` again.
- RAM and CPU are the **sum of the instances**, not a measure of the whole machine (the OS and Docker are not counted).
- ADS does not report the free space of the disk, only the datastore usage and its soft limit.
- The instance Status page is served by each instance's own copy of `AMP.html`, so the script does not run there.
- Before contacting CubeCoders support about the web interface, uninstall it or mention it.

### Uninstall

Restore the newest `AMP.html.before-stats-*` (or delete the `TeamKitStats.js` line), then delete `WebRoot/Scripts/TeamKitStats.js`.

### Customise

- Hide it in one browser only: run `localStorage.tkStatsOff = '1'` in the console (`localStorage.removeItem('tkStatsOff')` to bring it back).
- Who sees the bar: change the permission in `estAdmin()`.
- Refresh rate: `15000` (ms) in `rafraichir()`.
- Placement: the bar is inserted before the first visible `div.ServerGroupContainer`; badges go under the `h3` of each `div.ServerEntry`.
- Colours come from the theme variables (`--tk-carte`, `--tk-bord`, `--tk-texte`…) with dark fallbacks, so it also fits other themes.

## Licence

Free to use, copy and adapt. A mention of TeamKit is appreciated, not required. Not affiliated with CubeCoders.
