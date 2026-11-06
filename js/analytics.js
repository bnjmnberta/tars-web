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
})();
