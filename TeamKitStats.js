/* AMP Instances stats bar — by the TeamKit community (https://www.teamkit.fr), 2026. MIT License: free to use and adapt,
   provided as is, WITHOUT ANY WARRANTY; you use it under your own responsibility.

   Adds a row of tiles above the instance groups on the ADS Instances page: machine, servers running,
   players online, total RAM, total CPU and datastore usage (with its soft limit), plus a small
   "💾 X GB" disk badge on every instance card. Texts follow the FR | EN switch of TeamKitLang.js, else the browser language.

   Unofficial add-on: it only reads what ADS already sends to the page (API.ADSModule.GetInstancesAsync
   and GetDatastoresAsync), changes nothing, and fails silently. The bar is shown to users who have
   Core.UserManagement.ViewActiveSessions (admins); disk badges are shown to everyone for their own instances.
   Disk limits (optional): disk-guard.py publishes /Scripts/TeamKitDisk.json from disk-limits.json; the gauge and
   the badges then show "used / limit" and turn orange then red near the limit. Without that file: disk / datastore.
   An AMP update rewrites AMP.html: re-run install-stats.sh afterwards. See README.md. */
(function () {
  'use strict';
  // Dans le cadre d'une page de serveur (même origine), ADS charge aussi ce script : on laisse la page principale tout
  // piloter (elle traduit et suit déjà le cadre), sinon deux copies se contredisent.
  try { if (window.self !== window.top && window.parent.document) return; } catch (e) { /* cadre d'une autre origine : on tourne */ }
  var ID = 'tk-stats-ads', minuterie = null, derniere = 0;

  function estAdmin() {
    try { return typeof userHasPermission === 'function' && !!userHasPermission('Core.UserManagement.ViewActiveSessions'); } catch (e) { return false; }
  }
  // même langue que le bouton FR | EN de TeamKitLang.js (localStorage.tkLang), sinon celle du navigateur ; le bouton
  // change la langue sur place et prévient par l'événement « tk-lang » : la barre se redessine aussitôt
  var FR, LOC, T;
  function majLangue() {
    var v = null; try { v = localStorage.getItem('tkLang'); } catch (e) {}
    FR = v ? v === 'fr' : /^fr/i.test(navigator.language || '');
    LOC = FR ? 'fr-FR' : 'en-US';   // « 3,5 » en français, « 3.5 » en anglais, quelle que soit la langue du navigateur
    T = FR ? TFR : TEN;
  }
  var TFR = {
    go: ' Go', machine: 'Machine', serveur: 'Serveur', threads: ' threads · ', deRam: ' de RAM', serveurs: 'Serveurs', enJeu: ' en jeu',
    demarres: ' démarrés sur ', joueurs: 'Joueurs connectés', sur: 'sur ', places: ' places ouvertes', ram: 'RAM des serveurs', des: ' % des ',
    cpu: 'CPU des serveurs', somme: 'somme des serveurs démarrés', threadsSur: ' threads sur ', threadsFin: ' de la machine', disque: 'Disque des serveurs', limite: ' % de la limite de ', restants: ' restants',
    instances: ' instances', maj: 'mis à jour à ', pastille: 'Disque occupé par cette instance (relevé par ADS)', tuileDisque: 'Disque',
    tuileTous: 'Disque (tous)', deSaLimite: ' % de la limite de ce serveur', tous: 'Tous les serveurs de la machine', auDela: ' au-delà de leur limite'
  };
  var TEN = {
    go: ' GB', machine: 'Machine', serveur: 'Server', threads: ' threads · ', deRam: ' RAM', serveurs: 'Servers', enJeu: ' running',
    demarres: ' started out of ', joueurs: 'Players online', sur: 'of ', places: ' open slots', ram: 'Server RAM', des: ' % of ',
    cpu: 'Server CPU', somme: 'sum of started servers', threadsSur: ' of ', threadsFin: ' threads of the machine', disque: 'Server disk', limite: ' % of the ', restants: ' left',
    instances: ' instances', maj: 'updated at ', pastille: 'Disk used by this instance (reported by ADS)', tuileDisque: 'Disk',
    tuileTous: 'Disk (all)', deSaLimite: ' % of this server limit', tous: 'All servers of the machine', auDela: ' over their limit'
  };
  majLangue();
  function go(mb) { return (mb / 1024).toLocaleString(LOC, { maximumFractionDigits: mb >= 102400 ? 0 : 1 }) + T.go; }
  function metrique(i, nom) { var m = i && i.Metrics && i.Metrics[nom]; return m ? Number(m.RawValue) || 0 : 0; }
  /** Limites publiées par disk-guard.py (facultatif) : relues au plus une fois par minute, null si le fichier n'existe pas. */
  var CFG = { data: null, quand: 0 };
  async function limites() {
    if (Date.now() - CFG.quand < 60000) return CFG.data;
    CFG.quand = Date.now();
    try {
      var rep = await fetch('/Scripts/TeamKitDisk.json?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store', credentials: 'same-origin' });
      CFG.data = rep.ok ? await rep.json() : null;
    } catch (e) { CFG.data = null; }
    return CFG.data;
  }
  function cle(x) { return String(x || '').trim().toLowerCase(); }
  /** Limite d'une instance en Mo : par instance (ID, nom), sinon par jeu (ModuleDisplayName, Module), sinon par défaut. */
  /** Empreinte FNV-1a 32 bits, la même que disk-guard.py : le fichier public (v2) ne liste que des empreintes,
   *  jamais d'identifiant, de nom de serveur ni de nom de jeu. Marche aussi en http (pas besoin de crypto.subtle). */
  function empreinte(x) {
    var s = cle(x), h = 0x811c9dc5;
    for (var k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function limiteDe(i, cfg) {
    if (!cfg || !i) return 0;
    var a = cfg.instances_mb || {}, t = cfg.templates_mb || {};
    var c = cfg.hash === 'fnv1a32' ? empreinte : cle;   // v1 : clés en clair (ancienne version du gardien)
    return Number(a[c(i.InstanceID)] || a[c(i.InstanceName)] || a[c(i.FriendlyName)] ||
      t[c(i.ModuleDisplayName)] || t[c(i.Module)] || cfg.default_mb) || 0;
  }
  /** Couleur selon le remplissage : rien sous l'alerte, orange au-delà, rouge à 100 % ou au seuil de coupure. */
  function teinte(pct, cfg) {
    var alerte = Number(cfg && cfg.warn_pct) || 90, coupe = Number(cfg && cfg.stop_pct) || 100;
    return pct >= Math.min(100, coupe) ? 'plein' : pct >= alerte ? 'chaud' : '';
  }
  var TEINTES = { '': '#f0b35a', chaud: '#f97316', plein: '#ef4444' };
  function maxi(i, nom) { var m = i && i.Metrics && i.Metrics[nom]; return m ? Number(m.MaxValue) || 0 : 0; }

  /** Le conteneur des groupes d'instances (div.ServerGroupContainer, relevé sur la page réelle le 3 oct. 2026) :
   *  la barre se pose juste avant. Les boutons « Tout démarrer » ne sont pas des <button>, on ne s'y fie plus. */
  function ancre() {
    var c = document.querySelectorAll('.ServerGroupContainer');
    for (var k = 0; k < c.length; k++) if (c[k].offsetParent) return c[k];
    return null;
  }

  function fixe() { try { return localStorage.getItem('tkStatsFixe') !== '0'; } catch (e) { return true; } }
  function style() {
    if (document.getElementById(ID + '-css')) return;
    var s = document.createElement('style'); s.id = ID + '-css';
    s.textContent =
      '#' + ID + '{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 16px;font-family:Inter,system-ui,sans-serif}' +
      // Barre « collante » : elle reste en haut quand on fait défiler la liste des instances.
      // top:-24px comme les en-têtes d'AMP : la page défile dans .bodyTab, qui a 24 px de marge intérieure.
      // localStorage.tkStatsFixe = '0' la décroche, dans ce navigateur seulement.
      (fixe() ? '#' + ID + '{position:sticky;top:-24px;z-index:30;padding:14px 0 10px;margin-top:-14px;background:var(--tk-fond,rgba(11,14,20,.92));-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 8px 18px -12px rgba(0,0,0,.7)}' : '') +
      '#' + ID + ' .tks{background:var(--tk-carte,#161a24);border:1px solid var(--tk-bord,#262b38);border-radius:14px;padding:12px 14px;min-width:0}' +
      '#' + ID + ' .tks-l{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--tk-texte-3,#8b92a5);display:flex;gap:6px;align-items:center}' +
      '#' + ID + ' .tks-l .mat-icon{font-size:16px}' +
      '#' + ID + ' .tks-v{font-size:22px;font-weight:700;color:var(--tk-texte,#e3e6ee);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}' +
      '#' + ID + ' .tks-s{font-size:12px;color:var(--tk-texte-3,#8b92a5);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#' + ID + ' .tks-b{height:5px;border-radius:5px;background:rgba(255,255,255,.08);margin-top:8px;overflow:hidden}' +
      '#' + ID + ' .tks-b i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#00f0ff,#7b2cbf)}' +
      '#' + ID + ' .tks-b i.chaud{background:linear-gradient(90deg,#ffb020,#ff4d6d)}' +
      '.DisplayMetric[data-metric="TkDiskUsage"]{--m:#f0b35a;--m-icone:\'hard_drive\'}' +
      '.DisplayMetric[data-metric="TkDiskUsage"] .DisplayMetricHeader::before{content:\'hard_drive\'}' +
      '#AMP_Core_MetricsDisplay:has(> #tk-disque-instance){grid-template-columns:none!important;grid-auto-flow:column!important;grid-auto-columns:minmax(0,1fr)!important}' +
      '.tk-disque{display:inline-block;margin-top:2px;font-size:11px;line-height:1.4;padding:1px 7px;border-radius:999px;background:rgba(0,240,255,.10);color:var(--tk-texte-2,#c4c9d6);font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.tk-disque.chaud{background:rgba(249,115,22,.18);color:#fdba74}.tk-disque.plein{background:rgba(239,68,68,.22);color:#fca5a5;font-weight:600}';
    document.head.appendChild(s);
  }
  function tuile(icone, lib, val, sous, pct) {
    var barre = pct == null ? '' : '<div class="tks-b"><i class="' + (pct >= 85 ? 'chaud' : '') + '" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
    return '<div class="tks"><div class="tks-l"><span class="mat-icon">' + icone + '</span>' + lib + '</div>' +
      '<div class="tks-v">' + val + '</div>' + (sous ? '<div class="tks-s">' + sous + '</div>' : '') + barre + '</div>';
  }

  /** Page État d'un serveur : une jauge « Disque » à côté de CPU / Mémoire / Joueurs.
   *  Cette page est un iframe de même origine (src = /instance/<InstanceID>) : on écrit dans son document. */
  var TUILE = 'tk-disque-instance', disqueInstance = { id: null, mb: null, inst: null, limite: 0, occupe: 0, quand: 0 };
  function cadreServeur() {
    var fs = document.querySelectorAll('iframe');
    for (var k = 0; k < fs.length; k++) {
      var f = fs[k], m = /\/instance\/([0-9a-f-]{8,})/i.exec(f.getAttribute('src') || '');
      if (!m || !f.offsetParent) continue;
      try { var d = f.contentDocument; if (d && d.getElementById('AMP_Core_MetricsDisplay')) return { id: m[1].toLowerCase(), doc: d }; } catch (e) {}
    }
    return null;
  }
  function styleCadre(doc) {
    if (doc.getElementById(TUILE + '-css')) return;
    var s = doc.createElement('style'); s.id = TUILE + '-css';
    s.textContent = '.DisplayMetric[data-metric="TkDiskUsage"]{--m:#f0b35a;--m-icone:\'hard_drive\'}' +
      '.DisplayMetric[data-metric="TkDiskUsage"] .DisplayMetricHeader::before{content:\'hard_drive\'}' +
      '#AMP_Core_MetricsDisplay:has(> #' + TUILE + '){grid-template-columns:none!important;grid-auto-flow:column!important;grid-auto-columns:minmax(0,1fr)!important}';
    (doc.head || doc.documentElement).appendChild(s);
  }
  async function tuileInstance() {
    var c = cadreServeur();
    if (!c) return;
    var doc = c.doc, bloc = doc.getElementById('AMP_Core_MetricsDisplay'), t = doc.getElementById(TUILE);
    if (!bloc.offsetParent) { if (t) t.remove(); return; }
    if (disqueInstance.id !== c.id || Date.now() - disqueInstance.quand > 15000) {
      disqueInstance.quand = Date.now(); disqueInstance.id = c.id;
      var r = await API.ADSModule.GetInstancesAsync();
      var trouve = null;
      ((r && r.result) || r || []).forEach(function (x) { (x.AvailableInstances || []).forEach(function (i) { if (String(i.InstanceID || '').toLowerCase() === c.id) trouve = i; }); });
      disqueInstance.mb = trouve ? Number(trouve.DiskUsageMB) || 0 : null;
      disqueInstance.inst = trouve;
      // stockage (limite et occupé) : peut être refusé à un compte non admin, le rond reste alors vide
      try {
        var lim = 0, occ = 0, rs = API.ADSModule.GetDatastoresAsync ? await API.ADSModule.GetDatastoresAsync() : null;
        ((rs && rs.result) || rs || []).forEach(function (d) { lim += Number(d.SoftLimitMB) || 0; occ += Number(d.CurrentUsageMB) || 0; });
        disqueInstance.limite = lim; disqueInstance.occupe = occ;
      } catch (e) { disqueInstance.limite = 0; disqueInstance.occupe = 0; }
    }
    if (disqueInstance.mb == null) { if (t) t.remove(); return; }
    styleCadre(doc);
    if (!t || !t.isConnected) {
      var modele = bloc.querySelector('.DisplayMetric[data-metric="CPUUsage"]') || bloc.querySelector('.DisplayMetric');
      if (!modele) return;
      t = modele.cloneNode(true);
      t.id = TUILE; t.setAttribute('data-metric', 'TkDiskUsage'); t.removeAttribute('data-bind'); t.removeAttribute('style');
      t.querySelectorAll('[data-bind]').forEach(function (x) { x.removeAttribute('data-bind'); });
      var g = t.querySelector('.DisplayMetricGraph'); if (g) g.remove();
      var ref = bloc.querySelector('.DisplayMetric[data-metric="ActiveUsers"]');
      bloc.insertBefore(t, ref ? ref.nextSibling : null);
    }
    var h = t.querySelector('.DisplayMetricHeader');
    var txt = h ? [].filter.call(h.children, function (x) { return x.tagName === 'DIV' && !x.classList.contains('circleChart'); }) : [];
    // ce qu'on compare à quoi, selon le mode choisi dans disk-limits.json (sans fichier : serveur / stockage)
    var cfg = await limites(), mode = (cfg && cfg.display) || 'instance-datastore';
    var num = disqueInstance.mb, den = disqueInstance.limite, lib = T.tuileDisque, titre = T.pastille, seuils = null;
    var propre = limiteDe(disqueInstance.inst, cfg);
    if (mode === 'instance-limit' && propre) { den = propre; seuils = cfg; titre += ' · ' + '%P' + T.deSaLimite + ' (' + go(propre) + ')'; }
    else if (mode === 'all-datastore' && disqueInstance.occupe) { num = disqueInstance.occupe; lib = T.tuileTous; titre = T.tous; }
    if (den && titre.indexOf('%P') < 0) titre += ' · %P' + T.limite + go(den);
    var pct = den ? num / den * 100 : 0, part = Math.max(0, Math.min(1, pct / 100));
    if (txt[0]) txt[0].textContent = lib;
    if (txt[1]) txt[1].textContent = den ? go(num).replace(T.go, '') + ' / ' + go(den) : go(num);
    var tn = den ? teinte(pct, seuils) : '';
    t.style.setProperty('--m', TEINTES[tn]);
    var v = t.querySelector('circle.value');
    if (v) {
      var longueur = parseFloat(doc.defaultView.getComputedStyle(v).strokeDasharray) || 402;
      // AMP : trait de 402 pour un tour de 2πr = 201 (r = 32), plein quand le décalage vaut 402 − 201
      var tour = (v.getTotalLength && v.getTotalLength()) || 2 * Math.PI * (parseFloat(v.getAttribute('r')) || 32);
      v.style.strokeDashoffset = (longueur - part * tour).toFixed(1) + 'px';
      v.style.stroke = tn ? TEINTES[tn] : '';
    }
    t.title = titre.replace('%P', Math.round(pct));
  }

  async function rafraichir() {
    try {
      // API est un « const » d'API.js : il existe dans la page mais PAS sur window (window.API = undefined)
      // pastilles 💾 : pour TOUS (chacun voit le disque de ses serveurs) ; barre globale : admins seulement
      // interrupteur par navigateur : localStorage.tkStatsOff = '1' masque la barre et les pastilles (captures, préférence)
      var off = false; try { off = localStorage.getItem('tkStatsOff') === '1'; } catch (e) {}
      if (off) { var b0 = document.getElementById(ID); if (b0) b0.remove(); document.querySelectorAll('.tk-disque').forEach(function (x) { x.remove(); }); var c0 = cadreServeur(); var t0 = c0 && c0.doc.getElementById(TUILE); if (t0) t0.remove(); return; }
      if (typeof API === 'undefined' || !API.ADSModule || !API.ADSModule.GetInstancesAsync) return;
      var admin = estAdmin();
      try { await tuileInstance(); } catch (e) {}
      var a = ancre();
      var barre = document.getElementById(ID);
      if (!a) { if (barre) barre.remove(); return; }
      if (!admin && barre) barre.remove();
      var pastillesOk = document.querySelectorAll('.ServerEntry').length === document.querySelectorAll('.ServerEntry .tk-disque').length;
      if (Date.now() - derniere < 15000 && pastillesOk && (!admin || (barre && barre.isConnected))) return;
      derniere = Date.now();
      var r = await API.ADSModule.GetInstancesAsync();
      var cibles = (r && r.result) || r || [];
      var ramMachine = 0, threads = 0, modele = '', total = 0, demarrees = 0, enJeu = 0, joueurs = 0, ram = 0, cpu = 0, disque = 0, places = 0;
      cibles.forEach(function (c) {
        var p = c.Platform || {};
        ramMachine += Number(p.InstalledRAMMB) || 0;
        var tc = Number(p.CPUInfo && p.CPUInfo.TotalThreads) || 0;
        threads += tc;
        if (!modele && p.CPUInfo) modele = String(p.CPUInfo.ModelName || '').replace(/ \d+-Core Processor/, '');
        (c.AvailableInstances || []).forEach(function (i) {
          if (i.Module === 'ADS' || i.InstanceName === 'ADS01') return;
          total++;
          disque += Number(i.DiskUsageMB) || 0;
          if (!i.Running) return;
          demarrees++;
          if (Number(i.AppState) === 20) enJeu++;
          joueurs += metrique(i, 'Active Users'); places += maxi(i, 'Active Users');
          ram += metrique(i, 'Memory Usage');
          // AMP donne le CPU d'une instance en % de ce qui lui est alloué (ContainerCPUs cœurs), ou de toute la machine si
          // elle n'a pas de limite : additionner ces % n'a pas de sens. On compte des threads occupés (vérifié le 3 oct. 2026
          // face à docker stats : 3,5 threads selon AMP contre 3,1 cœurs mesurés).
          cpu += metrique(i, 'CPU Usage') / 100 * ((Number(i.ContainerCPUs) || 0) || tc);
        });
      });
      var ds = { usage: 0, libre: null, limite: 0 };
      try {
        // GetDatastoresAsync (vérifié le 3 oct. 2026) : SoftLimitMB = limite du stockage, CurrentUsageMB = occupé ; pas d'espace libre
        if (admin && API.ADSModule.GetDatastoresAsync) {
          var rs = await API.ADSModule.GetDatastoresAsync();
          ((rs && rs.result) || rs || []).forEach(function (d) {
            ds.usage += Number(d.CurrentUsageMB) || 0;
            if (d.FreeDiskMB != null) ds.libre = (ds.libre || 0) + (Number(d.FreeDiskMB) || 0);
            ds.limite += Number(d.SoftLimitMB) || 0;
          });
        }
      } catch (e) { /* champs absents : on garde la somme des instances */ }
      var cfg = await limites(), pleins = 0;
      cibles.forEach(function (c) { (c.AvailableInstances || []).forEach(function (i) {
        var l = limiteDe(i, cfg); if (l && (Number(i.DiskUsageMB) || 0) >= l) pleins++;
      }); });
      var occupe = ds.usage || disque;
      var pctDisque = ds.limite ? Math.round(occupe / ds.limite * 100) : (ds.libre != null ? Math.round(occupe / (occupe + ds.libre) * 100) : null);
      var sousDisque = ds.limite ? (pctDisque + T.limite + go(ds.limite) + (FR ? '' : ' limit') + ' · ' + go(Math.max(0, ds.limite - occupe)) + T.restants) : total + T.instances;
      if (pleins) sousDisque = '⚠️ ' + pleins + T.auDela + ' · ' + sousDisque;
      var pctRam = ramMachine ? Math.round(ram / ramMachine * 100) : null;
      var html =
        tuile('dns', T.machine, modele || T.serveur, threads ? threads + T.threads + go(ramMachine) + T.deRam : '', null) +
        tuile('play_circle', T.serveurs, enJeu + T.enJeu, demarrees + T.demarres + total, total ? Math.round(enJeu / total * 100) : null) +
        tuile('group', T.joueurs, String(joueurs), places ? T.sur + places + T.places : '', places ? Math.round(joueurs / places * 100) : null) +
        tuile('memory_alt', T.ram, go(ram), ramMachine ? pctRam + T.des + go(ramMachine) : '', pctRam) +
        tuile('memory', T.cpu, (threads ? Math.round(cpu / threads * 100) : 0) + ' %',
          threads ? '≈ ' + cpu.toLocaleString(LOC, { maximumFractionDigits: 1 }) + T.threadsSur + threads + T.threadsFin : T.somme,
          threads ? Math.round(cpu / threads * 100) : null) +
        tuile('hard_drive', T.disque, go(occupe), sousDisque, pctDisque);
      style();
      if (admin) {
        if (!barre) { barre = document.createElement('div'); barre.id = ID; }
        barre.innerHTML = html;
        barre.title = 'TeamKit · ' + T.maj + new Date().toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (barre.nextElementSibling !== a) a.parentElement.insertBefore(barre, a);
      }
      var parNom = {};
      cibles.forEach(function (c) { (c.AvailableInstances || []).forEach(function (i) { parNom[String(i.FriendlyName || '').trim()] = i; }); });
      document.querySelectorAll('.ServerEntry').forEach(function (carte) {
        var h = carte.querySelector('.ServerEntryHeader h3, h3'); if (!h) return;
        var i = parNom[(h.textContent || '').trim()]; if (!i) return;
        var mb = Number(i.DiskUsageMB) || 0;
        var p = carte.querySelector('.tk-disque');
        if (!p) { p = document.createElement('span'); p.className = 'tk-disque'; h.parentElement.appendChild(p); }
        var l = limiteDe(i, cfg), pc = l ? mb / l * 100 : 0;
        p.textContent = '💾 ' + (l ? go(mb).replace(T.go, '') + ' / ' + go(l) : go(mb));
        p.className = 'tk-disque' + (l && teinte(pc, cfg) ? ' ' + teinte(pc, cfg) : '');
        p.title = T.pastille + (l ? ' · ' + Math.round(pc) + T.deSaLimite : '');
      });
    } catch (e) { /* jamais d'erreur visible dans ADS */ }
  }

  window.addEventListener('tk-lang', function () {
    majLangue(); derniere = 0; disqueInstance.quand = 0;
    var t0 = cadreServeur(), t = t0 && t0.doc.getElementById(TUILE); if (t) t.remove();   // la jauge se refait dans la langue choisie
    rafraichir();
  });
  function demarrer() { if (minuterie) return; minuterie = setInterval(rafraichir, 3000); rafraichir(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
