/* MIT License: provided as is, WITHOUT ANY WARRANTY (see LICENSE); you use it under your own responsibility.
   AMP add-ons by TeamKit — send AMP's support buttons to YOUR support (optional).

   Out of the box, AMP's « Open a support ticket » posts a PUBLIC topic on the CubeCoders forum (with the server's
   technical details), « Join Discord Server » opens the CubeCoders Discord and « Visit support board » their
   support site. If you host servers for other people, you may want those to reach you instead.

   Settings: WebRoot/Scripts/TeamKitSupport.json (written by setup.sh; readable by anyone who opens AMP, so put
   only public addresses in it, never a password or a webhook):
     {
       "tickets": "https://example.com/support/new?subject={summary}&message={details}",   "" = keep AMP's default
       "discord": "https://discord.gg/yourinvite",                                         "" = keep AMP's default
       "docs":    "https://example.com/help",                                              "" = keep AMP's default
       "hint":    "Write in your own language: this ticket goes to our support team."     "" = automatic text
     }
   Placeholders in "tickets", each URL-encoded: {summary} {details} {category} {server} {instance} {version}.
   A "mailto:" address works too: mailto:support@example.com?subject={summary}&body={details}

   Both ways of opening a ticket are covered: the button (createTicket / showNewTicket) opens your address straight
   away, and the full form of the Support tab, when sent, opens your address with what was typed in it.
   Runs in the ADS page and in each server page (same-origin frame). Nothing is sent anywhere by this script. */
(function () {
  'use strict';
  if (window.__tkSupport) return;
  window.__tkSupport = true;
  var CFG = null;
  var read = function (f) { try { return typeof f === 'function' ? String(f() || '') : (f == null ? '' : String(f)); } catch (e) { return ''; } };
  var CATS = { 'Startup Issue': 'Startup issue', 'Update Failure': 'Update failure', 'Connectivity Problem': 'Connectivity problem',
    'Configuration': 'Configuration', 'Customization': 'Customization', 'Other': 'Other' };
  var FR = { 'Startup Issue': 'Problème de démarrage', 'Update Failure': 'Échec de mise à jour', 'Connectivity Problem': 'Problème de connexion',
    'Configuration': 'Configuration', 'Customization': 'Personnalisation', 'Other': 'Autre' };
  var fr = function () { return (document.documentElement.lang || navigator.language || '').toLowerCase().indexOf('fr') === 0; };

  function serverName(w) {
    var n = '';
    try { n = (w.document.title || '').replace(/\s*[-–|·]\s*AMP.*$/i, '').trim(); } catch (e) {}
    return /^AMP\b/i.test(n) ? '' : n;
  }
  function openTicket(w, vm, filled) {
    var v = {
      summary: (filled && filled.summary) || '', details: (filled && filled.details) || '', category: (filled && filled.category) || '',
      server: serverName(w), instance: read(vm && vm.instanceId), version: read(vm && vm.installedVersion),
    };
    var url = CFG.tickets.replace(/\{(summary|details|category|server|instance|version)\}/g, function (_, k) {
      return encodeURIComponent(String(v[k]).slice(0, k === 'details' ? 1500 : 150));
    });
    window.open(url, '_blank', 'noopener');
  }

  function formFrom(nt) {
    var c = null; try { c = nt.selectedCategory && nt.selectedCategory(); } catch (e) {}
    var cat = c ? String(c.title || '') : '';
    cat = (fr() ? FR : CATS)[cat] || cat;
    var steps = []; try { steps = (nt.steps && nt.steps()) || []; } catch (e) {}
    steps = steps.map(function (s) { return read(s); }).filter(Boolean);
    var parts = [];
    if (cat) parts.push((fr() ? 'Type : ' : 'Type: ') + cat);
    if (read(nt.tryingToDo)) parts.push((fr() ? 'Je voulais : ' : 'I was trying to: ') + read(nt.tryingToDo));
    if (steps.length) parts.push((fr() ? 'Étapes :\n' : 'Steps:\n') + steps.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'));
    if (read(nt.longProblemDescription)) parts.push(read(nt.longProblemDescription));
    return { summary: read(nt.shortDescription), details: parts.join('\n\n'), category: cat };
  }

  function hook(w) {
    var vms;
    try { vms = w.viewModels; } catch (e) { return; }
    if (!vms || typeof vms !== 'object') return;
    Object.keys(vms).forEach(function (k) {
      var vm = vms[k];
      if (!vm || typeof vm !== 'object') return;
      if (CFG.tickets) {
        if (!vm.__tkSupportT) {
          var done = false;
          if (typeof vm.showNewTicket === 'function') { vm.showNewTicket = function () { openTicket(w, vm); }; done = true; }
          if (typeof vm.createTicket === 'function') { vm.createTicket = function () { openTicket(w, vm); }; done = true; }
          if (done) vm.__tkSupportT = true;
        }
        var nt = vm.newTicket;   // the full form of the Support tab, sent by its last button
        if (nt && typeof nt === 'object' && !nt.__tkSupportT && typeof nt.createTicket === 'function') {
          nt.createTicket = function () { openTicket(w, vm, formFrom(nt)); try { w.UI && w.UI.HideWizard && w.UI.HideWizard(); } catch (e) {} };
          nt.__tkSupportT = true;
        }
      }
      if (CFG.discord && typeof vm.showDiscord === 'function' && !vm.__tkSupportD) { vm.showDiscord = function () { window.open(CFG.discord, '_blank', 'noopener'); }; vm.__tkSupportD = true; }
      if (CFG.docs && typeof vm.showSupportBoard === 'function' && !vm.__tkSupportB) { vm.showSupportBoard = function () { window.open(CFG.docs, '_blank', 'noopener'); }; vm.__tkSupportB = true; }
    });
  }

  // « All responses must be in English. » is true for CubeCoders, not for your support: replace that line.
  var HINTS = ['All responses must be in English.', 'Toutes les réponses doivent être en anglais.'];
  function hint(doc) {
    if (!CFG.tickets) return;
    var t = CFG.hint || (fr() ? 'Écris dans ta langue : ce ticket arrive à notre équipe de support.' : 'Write in your own language: this ticket goes to our support team.');
    var els; try { els = doc.querySelectorAll('#tab_diagnostics_newTicket p, #tab_diagnostics_newTicket span, #tab_diagnostics_newTicket div'); } catch (e) { return; }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.children.length === 0 && HINTS.indexOf(el.textContent.trim()) >= 0) el.textContent = t;
    }
  }

  function round() {
    hook(window); hint(document);
    var fs = document.querySelectorAll('iframe');
    for (var i = 0; i < fs.length; i++) { try { hook(fs[i].contentWindow); hint(fs[i].contentDocument); } catch (e) { /* other origin */ } }
  }

  fetch('/Scripts/TeamKitSupport.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) {
      if (!c || typeof c !== 'object') return;
      var ok = function (u) { return typeof u === 'string' && /^(https:\/\/|http:\/\/|mailto:)/i.test(u.trim()) ? u.trim() : ''; };
      CFG = { tickets: ok(c.tickets), discord: ok(c.discord), docs: ok(c.docs), hint: typeof c.hint === 'string' ? c.hint.slice(0, 200) : '' };
      if (!CFG.tickets && !CFG.discord && !CFG.docs) return;
      round();
      setInterval(round, 2000);   // AMP builds its view models late, and server pages open later
    })
    .catch(function () { /* no settings file: AMP keeps its own support buttons */ });
})();
