#!/usr/bin/env python3
"""AMP disk guard - by the TeamKit community (https://www.teamkit.fr), 2026. MIT License: free to use and adapt,
provided as is, WITHOUT ANY WARRANTY; you use it under your own responsibility.

Reads disk-limits.json and does two things, every time it runs (cron or systemd timer, every 5 minutes):

1. Publishes the limits for the stats script: WebRoot/Scripts/TeamKitDisk.json of the ADS instance
   (display mode, thresholds, limits per instance and per game, default). The public file holds fingerprints only:
   no instance ID, name or game name, and never the AMP account, the password or the webhook. Written only when
   something changed.
2. Optionally (enforce: true) stops the GAME of every instance above its limit. It calls Core/Stop on the
   instance: the AMP instance itself keeps running, so its File Manager and SFTP stay open to clean up.
   An instance restarted while still above the limit is stopped again on the next run.

Without enforce, it only publishes (no AMP account needed unless you name instances in the config).
Python 3.7+, standard library only. Run as root (or the amp user) so it can write into WebRoot.

  python3 disk-guard.py                         # /etc/amp-addons-teamkit/disk-limits.json
  python3 disk-guard.py --config my.json --dry-run --verbose
"""
import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

DEFAULT_CONFIG = '/etc/amp-addons-teamkit/disk-limits.json'
DISPLAY_MODES = ('instance-limit', 'instance-datastore', 'all-datastore')
STATE_DEFAULT = '/var/lib/amp-addons-teamkit/disk-guard-state.json'
APP_RUNNING = 20          # AMP AppState: the game is running
NOTIFY_EVERY = 3600       # at most one webhook message per instance and per hour (stop)
WARN_EVERY = 86400        # and one warning per day

VERBOSE = False


def log(msg):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), msg, flush=True)


def debug(msg):
    if VERBOSE:
        log(msg)


def key(s):
    return str(s or '').strip().lower()


def fnv(s):
    """FNV-1a 32 bits over the UTF-16 code units, exactly like the browser side (TeamKitStats.js): the public file
    lists fingerprints, never instance IDs, names or game names. Not a security hash, just no readable data."""
    h = 0x811c9dc5
    b = key(s).encode('utf-16-le')
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 0x01000193) & 0xffffffff
    return '%08x' % h


def gb_to_mb(v):
    try:
        return int(round(float(v) * 1024))
    except (TypeError, ValueError):
        return 0


def read_secret(path):
    if not path:
        return ''
    with open(path, encoding='utf-8') as f:
        return f.read().strip()


def http(url, body=None, headers=None, timeout=30, verify=True):
    data = None if body is None else json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='GET' if body is None else 'POST')
    req.add_header('Accept', 'application/json')
    if body is not None:
        req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    ctx = None
    if url.startswith('https://') and not verify:
        ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        raw = r.read().decode('utf-8') or 'null'
    return json.loads(raw)


def unwrap(v):
    """Some AMP versions wrap lists in {"result": [...]}."""
    if isinstance(v, dict) and 'result' in v and not isinstance(v.get('success'), bool):
        return v['result']
    return v


class Amp:
    """Minimal ADS client: the session goes in Authorization: Bearer (the body SESSIONID is deprecated)."""

    def __init__(self, url, user, password, verify=True):
        self.url = url.rstrip('/')
        self.user, self.password, self.verify = user, password, verify
        self.session = None
        self.instance_sessions = {}

    def _login(self, path):
        r = http(self.url + path, {'username': self.user, 'password': self.password, 'token': '', 'rememberMe': False},
                 self._auth(), verify=self.verify)
        if not (isinstance(r, dict) and r.get('success') and r.get('sessionID')):
            raise RuntimeError('AMP login refused for ' + self.user)
        return r['sessionID']

    def _auth(self, session=None):
        s = session or self.session
        return {'Authorization': 'Bearer ' + s} if s else {}

    def login(self):
        self.session = self._login('/API/Core/Login')

    def call(self, path, body=None):
        if not self.session:
            self.login()
        # AMP rejects an empty JSON array: always send an object
        return unwrap(http(self.url + '/API/' + path, body or {}, self._auth(), verify=self.verify))

    def instances(self):
        out = []
        for target in self.call('ADSModule/GetInstances') or []:
            for i in (target or {}).get('AvailableInstances') or []:
                if i.get('Module') != 'ADS':
                    out.append(i)
        return out

    def stop_game(self, instance_id):
        """Core/Stop on the instance = stop the application. The instance (panel, File Manager, SFTP) stays up."""
        if instance_id not in self.instance_sessions:
            try:
                self.instance_sessions[instance_id] = self._login('/API/ADSModule/Servers/%s/API/Core/Login' % instance_id)
            except Exception:
                self.instance_sessions[instance_id] = self.session
        http(self.url + '/API/ADSModule/Servers/%s/API/Core/Stop' % instance_id, {},
             self._auth(self.instance_sessions[instance_id]), verify=self.verify)


def load_config(path):
    with open(path, encoding='utf-8') as f:
        cfg = json.load(f)
    if cfg.get('display', 'instance-limit') not in DISPLAY_MODES:
        raise ValueError('display must be one of: ' + ', '.join(DISPLAY_MODES))
    return cfg


def fetch_import(imp):
    """Optional external source of limits: {"instances_mb": {InstanceID: MB}, "warn_pct": n, "stop_pct": n}."""
    if not imp or not imp.get('url'):
        return {}
    headers = {}
    if imp.get('header') and imp.get('secret_file'):
        headers[imp['header']] = read_secret(imp['secret_file'])
    r = http(imp['url'], None, headers, timeout=int(imp.get('timeout', 20)))
    if not isinstance(r, dict) or r.get('success') is False:
        raise RuntimeError('import: unexpected answer')
    return r


def build_public(cfg, imported, instances):
    """What the browser sees. Instance names from the config are turned into IDs when the instance list is known."""
    by_name = {}
    for i in instances or []:
        for n in (i.get('InstanceName'), i.get('FriendlyName')):
            if n:
                by_name[key(n)] = key(i.get('InstanceID'))
    limits = {}
    for iid, mb in (imported.get('instances_mb') or {}).items():
        if int(mb or 0) > 0:
            limits[key(iid)] = int(mb)
    for name, gb in (cfg.get('instances') or {}).items():
        mb = gb_to_mb(gb)
        if mb <= 0:
            continue
        k = key(name)
        limits[by_name.get(k, k)] = mb   # unknown name kept as is (no AMP account configured)
    templates = {key(n): gb_to_mb(gb) for n, gb in (cfg.get('templates') or {}).items() if gb_to_mb(gb) > 0}
    warn = cfg.get('warn_pct', imported.get('warn_pct', 90))
    stop = cfg.get('stop_pct', imported.get('stop_pct', 100))
    return {
        'v': 2,
        'hash': 'fnv1a32',
        'display': cfg.get('display', 'instance-limit'),
        'warn_pct': int(warn),
        'stop_pct': int(stop),
        'default_mb': gb_to_mb(cfg.get('default_limit_gb', 0)),
        'templates_mb': templates,
        'instances_mb': limits,
    }


def limit_of(inst, public):
    lim = public['instances_mb']
    tpl = public['templates_mb']
    for k in (inst.get('InstanceID'), inst.get('InstanceName'), inst.get('FriendlyName')):
        if lim.get(key(k)):
            return lim[key(k)]
    for k in (inst.get('ModuleDisplayName'), inst.get('Module')):
        if tpl.get(key(k)):
            return tpl[key(k)]
    return public['default_mb']


def hashed(public):
    out = dict(public)
    out['instances_mb'] = {fnv(k): v for k, v in public['instances_mb'].items()}
    out['instances_mb'].update(out.pop('_keep_mb', None) or {})
    out['templates_mb'] = {fnv(k): v for k, v in public['templates_mb'].items()}
    return out


def write_public(path, public, dry):
    public = hashed(public)
    old = None
    try:
        with open(path, encoding='utf-8') as f:
            old = json.load(f)
            old.pop('updated', None)
    except Exception:
        pass
    if old == public:
        debug('public file unchanged: ' + path)
        return False
    if dry:
        log('[dry-run] would write ' + path)
        return True
    data = dict(public, updated=int(time.time()))
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'), sort_keys=True)
    # same owner as AMP.html, readable by the web server
    try:
        st = os.stat(os.path.join(os.path.dirname(os.path.dirname(path)), 'AMP.html'))
        os.chown(tmp, st.st_uid, st.st_gid)
    except (OSError, AttributeError):
        pass
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)
    log('published limits: %d instance(s), %d game(s) -> %s' % (len(public['instances_mb']), len(public['templates_mb']), path))
    return True


def load_state(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f)
    os.replace(tmp, path)


def notify(cfg, text, dry):
    url = cfg.get('webhook') or ''
    if not url:
        return
    if dry:
        log('[dry-run] webhook: ' + text)
        return
    try:
        http(url, {'content': text[:1900]}, timeout=15)
    except Exception as e:
        log('webhook failed: %s' % e)


def gb(mb):
    return '%.1f GB' % (mb / 1024.0)


def main():
    global VERBOSE
    ap = argparse.ArgumentParser(description='AMP disk guard (TeamKit add-ons)')
    ap.add_argument('--config', default=DEFAULT_CONFIG)
    ap.add_argument('--dry-run', action='store_true', help='show what would happen, change nothing')
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args()
    VERBOSE = a.verbose
    cfg = load_config(a.config)
    dry = a.dry_run

    ampdata = cfg.get('ampdata', '/home/amp/.ampdata/instances')
    public_path = os.path.join(ampdata, cfg.get('ads_instance', 'ADS01'), 'WebRoot', 'Scripts', 'TeamKitDisk.json')

    imported = {}
    try:
        imported = fetch_import(cfg.get('import'))
    except Exception as e:
        log('import failed, keeping the local limits only: %s' % e)

    amp, instances = None, []
    a_cfg = cfg.get('amp') or {}
    if a_cfg.get('user') and a_cfg.get('password_file'):
        amp = Amp(a_cfg.get('url', 'http://127.0.0.1:8080'), a_cfg['user'], read_secret(a_cfg['password_file']),
                  verify=a_cfg.get('verify_tls', True))
        try:
            instances = amp.instances()
        except Exception as e:
            log('AMP unreachable: %s' % e)
            amp = None
    elif cfg.get('enforce'):
        log('enforce is on but no AMP account (amp.user, amp.password_file): nothing will be stopped')

    public = build_public(cfg, imported, instances)
    if imported.get('instances_mb') is None and (cfg.get('import') or {}).get('url'):
        # import failed: keep the limits already published rather than wiping them
        try:
            with open(public_path, encoding='utf-8') as f:
                prev = json.load(f)
            if prev.get('hash') == 'fnv1a32':
                keep = prev.get('instances_mb') or {}
                mine = {fnv(k) for k in public['instances_mb']}
                public['_keep_mb'] = {k: v for k, v in keep.items() if k not in mine}
        except Exception:
            pass
    write_public(public_path, public, dry)

    if not (cfg.get('enforce') and amp):
        return 0

    state_path = cfg.get('state_file', STATE_DEFAULT)
    state = load_state(state_path)
    now = time.time()
    warn, stop = public['warn_pct'], public['stop_pct']
    for inst in instances:
        lim = limit_of(inst, public)
        if lim <= 0:
            continue
        used = float(inst.get('DiskUsageMB') or 0)
        pct = used * 100.0 / lim
        name = inst.get('FriendlyName') or inst.get('InstanceName') or inst.get('InstanceID')
        iid = key(inst.get('InstanceID'))
        st = state.setdefault(iid, {})
        running = int(inst.get('AppState') or 0) == APP_RUNNING
        debug('%s: %s / %s (%.0f %%)%s' % (name, gb(used), gb(lim), pct, ' running' if running else ''))
        if pct >= stop and running:
            if dry:
                log('[dry-run] would stop the game of %s (%.0f %% of %s)' % (name, pct, gb(lim)))
            else:
                try:
                    amp.stop_game(inst['InstanceID'])
                    log('stopped the game of %s: %s / %s (%.0f %%)' % (name, gb(used), gb(lim), pct))
                except Exception as e:
                    log('could not stop %s: %s' % (name, e))
                    continue
            if now - st.get('stop', 0) > NOTIFY_EVERY:
                notify(cfg, '⛔ %s: disk %s / %s (%.0f %%), game stopped. File Manager and SFTP stay open to clean up.'
                       % (name, gb(used), gb(lim), pct), dry)
                st['stop'] = now
        elif pct >= warn and now - st.get('warn', 0) > WARN_EVERY:
            notify(cfg, '💽 %s: disk %s / %s (%.0f %%). The game stops at %d %%.' % (name, gb(used), gb(lim), pct, stop), dry)
            st['warn'] = now
    if not dry:
        save_state(state_path, state)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        log('error: %s' % e)
        sys.exit(1)
