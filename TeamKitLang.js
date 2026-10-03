/* AMP in French — by the TeamKit community (https://www.teamkit.fr), 2026. Free to use and adapt.

   AMP 2.8 ships a translation engine (Scripts/Locale.js reading /Locale/<iso>.json) but nothing in the interface
   turns it on. This add-on does: when /Locale/fr.json exists, the panel is shown in French for browsers set to
   French, and a small "FR | EN" switch (top bar, next to the search box) lets anyone change it; the choice is kept in the browser.

   - Same dictionary format as AMP ("Strings": exact English text -> translation), so the same fr.json works with
     AMP's own engine if CubeCoders adds a language picker one day.
   - Translates text, placeholders and tooltips as they appear (MutationObserver), including the instance pages,
     which ADS shows in a same-origin frame.
   - Never touches what users typed or what the game prints: console, file names, editor, player names, inputs.
   - Switching back to English reloads the page, so nothing translated stays behind.
   localStorage.tkLang = 'fr' | 'en' (unset = browser language). See README.md. */
(function () {
  'use strict';
  var CLE = 'tkLang', DICO_URL = '/Locale/fr.json';
  // zones jamais traduites : sorties du jeu, fichiers, saisies, noms choisis par les gens
  var ZONES = '#consoleArea,#consoleUsers,#fileManagerList,#editorFilename,.fmPathSegment,#backupsList tbody,.ServerEntry h3,.tk-lang,' +
    '.scheduleTriggerVariable'; // variables d'un déclencheur (Time, UserID…) : des noms à recopier, jamais à traduire
  var SAUTER = 'script,style,pre,code,textarea,input,[contenteditable="true"],' + ZONES;
  var dico = null, vus = typeof WeakSet === 'function' ? new WeakSet() : null;

  function langue() {
    var v = null; try { v = localStorage.getItem(CLE); } catch (e) {}
    if (v === 'fr' || v === 'en') return v;
    var l = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^fr/i.test(l) ? 'fr' : 'en';
  }

  function saute(el) {
    try { return !!(el && el.closest && el.closest(SAUTER)); } catch (e) { return false; }
  }
  // même découpe que Locale.js d'AMP : espaces autour gardés, le texte doit commencer par une lettre
  function traduit(txt) {
    if (!txt || !/[a-zA-Z]\w/.test(txt)) return null;
    var m = /^(\s*)([a-zA-Z ].*?)(\s*)$/.exec(txt);
    if (!m) return null;
    // AMP écrit certains libellés avec des espaces insécables (« Java and Memory ») : on essaie aussi avec des espaces simples
    var t = dico[m[2]] || (m[2].indexOf('\u00a0') >= 0 ? dico[m[2].replace(/\u00a0/g, ' ')] : null);
    return t ? m[1] + t + m[3] : null;
  }
  function noeudTexte(n) {
    if (saute(n.parentElement)) return;
    var t = traduit(n.nodeValue);
    if (t != null && t !== n.nodeValue) n.nodeValue = t;
  }
  // le texte d'exemple d'un champ (placeholder) se traduit, son contenu jamais : on ne saute ici que les zones
  function attributs(el) {
    try { if (el.closest && el.closest(ZONES)) return; } catch (e) { return; }
    ['placeholder', 'title', 'aria-label'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a);
      if (v) { var t = traduit(v); if (t != null && t !== v) el.setAttribute(a, t); }
    });
  }
  function parcourir(racine) {
    if (!racine) return;
    if (racine.nodeType === 3) { noeudTexte(racine); return; }
    if (racine.nodeType !== 1 && racine.nodeType !== 9 && racine.nodeType !== 11) return;
    if (racine.nodeType === 1) { if (saute(racine)) return; attributs(racine); }
    var doc = racine.ownerDocument || racine;
    var w = doc.createTreeWalker(racine, 5 /* éléments + textes */, null), n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) noeudTexte(n);
      else if (n.hasAttribute && (n.hasAttribute('placeholder') || n.hasAttribute('title') || n.hasAttribute('aria-label'))) attributs(n);
    }
  }

  /** Un observateur par document (ADS + chaque page de serveur ouverte dans un cadre). */
  function suivre(doc) {
    if (!doc || !doc.body || (vus && vus.has(doc)) || doc.__tkLang) return;
    if (vus) vus.add(doc); else doc.__tkLang = true;
    parcourir(doc.body);
    var file = [], prevu = false;
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'characterData') file.push(m.target);
        else if (m.type === 'attributes') file.push(m.target);
        else m.addedNodes.forEach(function (x) { file.push(x); });
      });
      if (prevu) return;
      prevu = true;
      // une minuterie et pas requestAnimationFrame : Chrome met ce dernier en pause dans un onglet en arrière-plan
      setTimeout(function () {
        prevu = false;
        var lot = file; file = [];
        lot.forEach(function (x) { if (x.nodeType === 1 && !x.isConnected) return; parcourir(x); });
      }, 60);
    }).observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  }
  function cadres() {
    var fs = document.querySelectorAll('iframe');
    for (var k = 0; k < fs.length; k++) {
      try { var d = fs[k].contentDocument; if (d && d.body && d.readyState !== 'loading') suivre(d); } catch (e) { /* autre origine : rien à faire */ }
    }
  }

  function bouton(actuelle) {
    if (document.getElementById('tk-lang')) return;
    var s = document.createElement('style');
    s.textContent = '#tk-lang{position:fixed;right:12px;bottom:12px;z-index:99999;display:flex;gap:2px;padding:3px;border-radius:999px;' +
      'background:var(--tk-carte,rgba(22,26,36,.92));border:1px solid var(--tk-bord,#262b38);font:600 11px/1 Inter,system-ui,sans-serif;opacity:.75}' +
      '#tk-lang:hover,#tk-lang:focus-within{opacity:1}' +
      '#tk-lang button{all:unset;cursor:pointer;padding:5px 9px;border-radius:999px;color:var(--tk-texte-3,#8b92a5);letter-spacing:.06em}' +
      '#tk-lang button[aria-pressed="true"]{background:rgba(0,240,255,.16);color:var(--tk-texte,#e3e6ee)}' +
      '#tk-lang button:focus-visible{outline:2px solid #00f0ff;outline-offset:1px}' +
      // dans la barre du haut d'AMP, juste avant la recherche : bien visible, ne cache rien
      '#tk-lang.tk-lang-barre{position:static;align-self:center;margin:0 0 0 16px;opacity:1;flex:none}';
    document.head.appendChild(s);
    var b = document.createElement('div');
    b.id = 'tk-lang'; b.className = 'tk-lang'; b.setAttribute('role', 'group');
    b.setAttribute('aria-label', actuelle === 'fr' ? 'Langue du panel' : 'Panel language');
    ['fr', 'en'].forEach(function (l) {
      var x = document.createElement('button');
      x.type = 'button'; x.textContent = l.toUpperCase();
      x.title = l === 'fr' ? 'Afficher le panel en français' : 'Show the panel in English';
      x.setAttribute('aria-pressed', String(l === actuelle));
      x.addEventListener('click', function () {
        if (l === actuelle) return;
        try { localStorage.setItem(CLE, l); } catch (e) {}
        location.reload();
      });
      b.appendChild(x);
    });
    document.body.appendChild(b);
    placer();
    setInterval(placer, 1500); // la barre du haut n'apparaît qu'une fois connecté
  }
  /** Dans la barre du haut d'AMP (avant la recherche) quand elle est affichée, sinon en bas à droite (page de connexion). */
  function placer() {
    var b = document.getElementById('tk-lang'); if (!b) return;
    var barre = document.getElementById('topSearchBox');
    var visible = !!(barre && barre.parentElement && barre.offsetParent);
    if (visible && b.nextElementSibling !== barre) { b.classList.add('tk-lang-barre'); barre.parentElement.insertBefore(b, barre); }
    else if (!visible && b.parentElement !== document.body) { b.classList.remove('tk-lang-barre'); document.body.appendChild(b); }
  }

  async function demarrer() {
    var l = langue();
    var data = null;
    try {
      var rep = await fetch(DICO_URL, { cache: 'no-cache', credentials: 'same-origin' });
      if (rep.ok) data = await rep.json();
    } catch (e) { data = null; }
    if (!data || !data.Strings) return; // pas de dictionnaire installé : on ne montre même pas le bouton
    bouton(l);
    if (l !== 'fr') return;
    dico = data.Strings;
    document.documentElement.lang = 'fr';
    suivre(document);
    setInterval(cadres, 1500);
    cadres();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
