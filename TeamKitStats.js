/* AMP Instances stats bar — by the TeamKit community (https://www.teamkit.fr), 2026. Free to use and adapt.

   Adds a row of tiles above the instance groups on the ADS Instances page: machine, servers running,
   players online, total RAM, total CPU and datastore usage (with its soft limit), plus a small
   "💾 X GB" disk badge on every instance card. Texts follow the browser language (French or English).

   Unofficial add-on: it only reads what ADS already sends to the page (API.ADSModule.GetInstancesAsync
   and GetDatastoresAsync), changes nothing, and fails silently. The bar is shown to users who have
   Core.UserManagement.ViewActiveSessions (admins); disk badges are shown to everyone for their own instances.
   An AMP update rewrites AMP.html: re-run install-stats.sh afterwards. See README.md. */
(function () {
  'use strict';
  var ID = 'tk-stats-ads', minuterie = null, derniere = 0;

  function estAdmin() {
    try { return typeof userHasPermission === 'function' && !!userHasPermission('Core.UserManagement.ViewActiveSessions'); } catch (e) { return false; }
  }
  var FR = /^fr/i.test(navigator.language || '');
  var LOC = FR ? 'fr-FR' : undefined;
  // les textes affichés, en français ou en anglais selon la langue du navigateur
  var T = FR ? {
    go: ' Go', machine: 'Machine', serveur: 'Serveur', threads: ' threads · ', deRam: ' de RAM', serveurs: 'Serveurs', enJeu: ' en jeu',
    demarres: ' démarrés sur ', joueurs: 'Joueurs connectés', sur: 'sur ', places: ' places ouvertes', ram: 'RAM des serveurs', des: ' % des ',
    cpu: 'CPU cumulé', somme: 'somme des serveurs démarrés', disque: 'Disque des serveurs', limite: ' % de la limite de ', restants: ' restants',
    instances: ' instances', maj: 'mis à jour à ', pastille: 'Disque occupé par cette instance (relevé par ADS)', tuileDisque: 'Disque'
  } : {
    go: ' GB', machine: 'Machine', serveur: 'Server', threads: ' threads · ', deRam: ' RAM', serveurs: 'Servers', enJeu: ' running',
    demarres: ' started out of ', joueurs: 'Players online', sur: 'of ', places: ' open slots', ram: 'Server RAM', des: ' % of ',
    cpu: 'Total CPU', somme: 'sum of started servers', disque: 'Server disk', limite: ' % of the ', restants: ' left',
    instances: ' instances', maj: 'updated at ', pastille: 'Disk used by this instance (reported by ADS)', tuileDisque: 'Disk'
  };
  function go(mb) { return (mb / 1024).toLocaleString(LOC, { maximumFractionDigits: mb >= 102400 ? 0 : 1 }) + T.go; }
  function metrique(i, nom) { var m = i && i.Metrics && i.Metrics[nom]; return m ? Number(m.RawValue) || 0 : 0; }
  function maxi(i, nom) { var m = i && i.Metrics && i.Metrics[nom]; return m ? Number(m.MaxValue) || 0 : 0; }

  /** Le conteneur des groupes d'instances (div.ServerGroupContainer, relevé sur la page réelle le 3 oct. 2026) :
   *  la barre se pose juste avant. Les boutons « Tout démarrer » ne sont pas des <button>, on ne s'y fie plus. */
  function ancre() {
    var c = document.querySelectorAll('.ServerGroupContainer');
    for (var k = 0; k < c.length; k++) if (c[k].offsetParent) return c[k];
    return null;
  }

  function style() {
    if (document.getElementById(ID + '-css')) return;
    var s = document.createElement('style'); s.id = ID + '-css';
    s.textContent =
      '#' + ID + '{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 16px;font-family:Inter,system-ui,sans-serif}' +
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
      '.tk-disque{display:inline-block;margin-top:2px;font-size:11px;line-height:1.4;padding:1px 7px;border-radius:999px;background:rgba(0,240,255,.10);color:var(--tk-texte-2,#c4c9d6);font-variant-numeric:tabular-nums;white-space:nowrap}';
    document.head.appendChild(s);
  }
  function tuile(icone, lib, val, sous, pct) {
    var barre = pct == null ? '' : '<div class="tks-b"><i class="' + (pct >= 85 ? 'chaud' : '') + '" style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
    return '<div class="tks"><div class="tks-l"><span class="mat-icon">' + icone + '</span>' + lib + '</div>' +
      '<div class="tks-v">' + val + '</div>' + (sous ? '<div class="tks-s">' + sous + '</div>' : '') + barre + '</div>';
  }

  /** Page État d'un serveur : une jauge « Disque » à côté de CPU / Mémoire / Joueurs.
   *  Cette page est un iframe de même origine (src = /instance/<InstanceID>) : on écrit dans son document. */
  var TUILE = 'tk-disque-instance', disqueInstance = { id: null, mb: null, limite: 0, quand: 0 };
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
      // limite du stockage : peut être refusée à un compte non admin, le rond reste alors vide
      try {
        var lim = 0, rs = API.ADSModule.GetDatastoresAsync ? await API.ADSModule.GetDatastoresAsync() : null;
        ((rs && rs.result) || rs || []).forEach(function (d) { lim += Number(d.SoftLimitMB) || 0; });
        disqueInstance.limite = lim;
      } catch (e) { disqueInstance.limite = 0; }
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
    if (txt[0]) txt[0].textContent = T.tuileDisque;
    var lim = disqueInstance.limite, part = lim ? Math.max(0, Math.min(1, disqueInstance.mb / lim)) : 0;
    if (txt[1]) txt[1].textContent = lim ? go(disqueInstance.mb).replace(T.go, '') + ' / ' + go(lim) : go(disqueInstance.mb);
    var v = t.querySelector('circle.value');
    if (v) {
      var longueur = parseFloat(doc.defaultView.getComputedStyle(v).strokeDasharray) || 402;
      v.style.strokeDashoffset = (longueur * (1 - part)).toFixed(1) + 'px';
    }
    t.title = T.pastille + (lim ? ' · ' + Math.round(part * 100) + T.limite + go(lim) : '');
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
        threads += Number(p.CPUInfo && p.CPUInfo.TotalThreads) || 0;
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
          cpu += metrique(i, 'CPU Usage');
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
      var occupe = ds.usage || disque;
      var pctDisque = ds.limite ? Math.round(occupe / ds.limite * 100) : (ds.libre != null ? Math.round(occupe / (occupe + ds.libre) * 100) : null);
      var sousDisque = ds.limite ? (pctDisque + T.limite + go(ds.limite) + (FR ? '' : ' limit') + ' · ' + go(Math.max(0, ds.limite - occupe)) + T.restants) : total + T.instances;
      var pctRam = ramMachine ? Math.round(ram / ramMachine * 100) : null;
      var html =
        tuile('dns', T.machine, modele || T.serveur, threads ? threads + T.threads + go(ramMachine) + T.deRam : '', null) +
        tuile('play_circle', T.serveurs, enJeu + T.enJeu, demarrees + T.demarres + total, total ? Math.round(enJeu / total * 100) : null) +
        tuile('group', T.joueurs, String(joueurs), places ? T.sur + places + T.places : '', places ? Math.round(joueurs / places * 100) : null) +
        tuile('memory_alt', T.ram, go(ram), ramMachine ? pctRam + T.des + go(ramMachine) : '', pctRam) +
        tuile('memory', T.cpu, Math.round(cpu) + ' %', T.somme, Math.round(cpu)) +
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
        p.textContent = '💾 ' + go(mb);
        p.title = T.pastille;
      });
    } catch (e) { /* jamais d'erreur visible dans ADS */ }
  }

  function demarrer() { if (minuterie) return; minuterie = setInterval(rafraichir, 3000); rafraichir(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
