(function () {
  'use strict';

  /* Google Analytics 4. Nothing loads until a measurement ID (G-XXXXXXXXXX) is set:
     - static site: <meta name="tars-ga" content="G-XXXXXXXXXX"> in index.html
     - WordPress theme: Apariencia → Personalizar → TARS → Contacto y datos → Código de Google Analytics
     Visitors who send "Do Not Track" are left out. Besides the automatic page views, it reports the
     contact actions that matter for a studio: WhatsApp, Instagram, the mail composer, the call to
     action on the Diseño Web card, and which sections get read. */
  var meta = document.querySelector('meta[name="tars-ga"]');
  var id = String(window.TARS_GA_ID || (meta && meta.getAttribute('content')) || '').trim();
  if (!/^G-[A-Z0-9]{6,}$/i.test(id)) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  /* Consent: nothing is measured until the visitor accepts the notice. The answer is kept in this
     browser (localStorage "tars-consent"), so the notice shows once. */
  var KEY = 'tars-consent';
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function remember(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function banner() {
    /* the static site keeps its policy at privacidad/; WordPress sets window.TARS_PRIVACY_URL
       (an empty string means "no policy page yet": the notice then has no link) */
    var url = typeof window.TARS_PRIVACY_URL === 'string' ? window.TARS_PRIVACY_URL : 'privacidad/';
    var box = document.createElement('div');
    box.className = 'consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Aviso de cookies');
    /* built with the DOM API (no innerHTML), and only http(s) or relative links are accepted */
    var text = document.createElement('p');
    text.className = 'consent__text';
    text.appendChild(document.createTextNode('Usamos Google Analytics para saber cuántas personas visitan el sitio y qué secciones leen. Solo se activa si aceptás. Al aceptar, Google procesa esos datos y puede hacerlo fuera de la Argentina, por ejemplo en Estados Unidos.'));
    if (url && !/^\s*(javascript|data|vbscript):/i.test(url)) {
      var link = document.createElement('a');
      link.setAttribute('href', url);
      link.textContent = 'Política de privacidad';
      text.appendChild(document.createTextNode(' '));
      text.appendChild(link);
    }
    var btns = document.createElement('div');
    btns.className = 'consent__btns';
    [['denied', 'Rechazar', ''], ['granted', 'Aceptar', ' consent__btn--yes']].forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'consent__btn' + b[2];
      btn.setAttribute('data-consent', b[0]);
      btn.textContent = b[1];
      btns.appendChild(btn);
    });
    box.appendChild(text);
    box.appendChild(btns);
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-consent]');
      if (!b) return;
      var v = b.getAttribute('data-consent');
      var before = stored();
      remember(v);
      box.remove();
      if (v === 'granted') start();
      else if (before === 'granted') stop();
    });
    document.body.appendChild(box);
  }
  var started = false;
  /* withdrawing consent: remove Google's cookies and reload the page without the script */
  function stop() {
    var host = location.hostname.split('.');
    var domains = ['', location.hostname, '.' + location.hostname];
    if (host.length > 2) domains.push('.' + host.slice(-2).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
    location.reload();
  }
  /* "Configurar cookies" in the footer: lets the visitor change the answer at any time */
  function settingsLink() {
    var bottom = document.querySelector('.footer__bottom');
    if (!bottom || bottom.querySelector('[data-cookie-settings]')) return;
    var span = document.createElement('span');
    var btn = document.createElement('a');
    btn.href = '#cookies';
    btn.setAttribute('data-cookie-settings', '');
    btn.textContent = 'Configurar cookies';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!document.querySelector('.consent')) banner();
    });
    span.appendChild(btn);
    bottom.appendChild(span);
  }
  var answer = stored();
  if (answer === 'granted') start();
  else if (answer !== 'denied') banner();
  settingsLink();

  function start() {
  if (started) return;
  started = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('js', new Date());
  gtag('config', id, { anonymize_ip: true });

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);

  function send(name, params) { gtag('event', name, params || {}); }
  function sectionOf(el) {
    var sec = el.closest && el.closest('section[id], header, footer, .menu');
    if (!sec) return 'pagina';
    if (sec.classList.contains('menu')) return 'menu';
    return sec.id || sec.tagName.toLowerCase();
  }

  // clicks on the contact channels (one delegated listener)
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a, button');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    var where = sectionOf(el);
    if (href.indexOf('wa.me') !== -1) {
      send('whatsapp_click', { seccion: where });
      send('generate_lead', { metodo: 'whatsapp' });
    } else if (href.indexOf('instagram.com') !== -1) {
      send('instagram_click', { seccion: where });
    } else if (el.hasAttribute('data-mail-toggle') || href === '#mail' || /#mail$/.test(href)) {
      send('mail_abrir', { seccion: where });
    } else if (el.closest('.stack__cta')) {
      send('cta_servicio_click', { servicio: (el.closest('.stack__item') && (el.closest('.stack__item').querySelector('h3') || {}).textContent || '').trim() });
    } else if (el.classList.contains('btn--nav')) {
      send('hablemos_click');
    }
  });

  // the mail composer (js/mail.js announces what happened)
  document.addEventListener('tars:mail', function (e) {
    var d = e.detail || {};
    if (d.estado === 'enviado') {
      send('mail_enviado', { servicios: d.servicios || '' });
      send('generate_lead', { metodo: 'formulario' });
    } else if (d.estado === 'error') {
      send('mail_error');
    } else if (d.estado) {
      send('mail_accion', { accion: d.estado });
    }
  });

  // which sections get read
  if ('IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || seen[en.target.id]) return;
        seen[en.target.id] = true;
        send('seccion_vista', { seccion: en.target.id });
        io.unobserve(en.target);
      });
    }, { threshold: 0.35 });
    ['servicios', 'proceso', 'contacto'].forEach(function (name) {
      var node = document.getElementById(name);
      if (node) io.observe(node);
    });
  }
  }
})();
