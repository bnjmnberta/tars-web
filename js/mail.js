(function () {
  'use strict';

  /* Mail composer: the page has no server, so it writes the mail with the visitor and hands it to
     their own mail program (mailto:), to Gmail on the web, or to the clipboard. */
  var form = document.getElementById('mailform');
  if (!form) return;

  var TO = form.getAttribute('data-to');
  var DRAFT_KEY = 'tars-mail-draft';
  var MAILTO_SAFE_LENGTH = 1900; // some mail programs drop longer mailto: links

  var status = document.querySelector('[data-status]');
  var statusTimer = null;

  function field(name) { return form.elements[name]; }
  function value(name) { return (field(name).value || '').trim(); }
  function chosenServices() {
    return [].slice.call(form.querySelectorAll('input[name="service"]:checked')).map(function (i) { return i.value; });
  }

  function subject() {
    var typed = value('subject');
    if (typed) return typed;
    var services = chosenServices();
    var who = value('name');
    return 'Consulta TARS' + (services.length ? ' — ' + services.join(' + ') : '') + (who ? ' — ' + who : '');
  }

  function body() {
    var sign = [];
    function add(label, v) { if (v) sign.push(label + ': ' + v); }
    add('Nombre', value('name'));
    add('Negocio o proyecto', value('company'));
    add('Necesito', chosenServices().join(', '));
    add('Para cuándo', value('when'));
    add('Referencias', value('links'));
    add('Mi mail', value('email'));
    add('Mi WhatsApp', value('phone'));
    var lines = ['Hola TARS,', '', value('message') || '…'];
    if (sign.length) lines = lines.concat(['', '—'], sign);
    return lines.join('\n');
  }

  /* ---------- draft ---------- */
  function render() { saveDraft(); }

  function saveDraft() {
    try {
      var data = {};
      [].slice.call(form.elements).forEach(function (el) {
        if (!el.name) return;
        if (el.type === 'checkbox') { if (el.checked) (data[el.name] = data[el.name] || []).push(el.value); }
        else data[el.name] = el.value;
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch (e) { /* private mode: the draft just isn't kept */ }
  }

  function restoreDraft() {
    try {
      var data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!data) return;
      [].slice.call(form.elements).forEach(function (el) {
        if (!el.name || !(el.name in data)) return;
        if (el.type === 'checkbox') el.checked = data[el.name].indexOf(el.value) !== -1;
        else el.value = data[el.name];
      });
    } catch (e) { /* ignore a broken draft */ }
  }

  function say(text) {
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { status.textContent = ''; }, 6000);
  }

  /* ---------- validation: a name and a message are what we need to answer ---------- */
  function showError(name, on) {
    var input = field(name);
    var msg = document.getElementById('e-' + name);
    input.setAttribute('aria-invalid', on ? 'true' : 'false');
    if (msg) msg.hidden = !on;
  }

  function validate() {
    var firstBad = null;
    ['name', 'message'].forEach(function (n) {
      var bad = !value(n);
      showError(n, bad);
      if (bad && !firstBad) firstBad = field(n);
    });
    if (firstBad) { firstBad.focus(); say('Falta completar los campos marcados.'); return false; }
    return true;
  }

  function mailtoUrl() {
    var crlf = function (s) { return s.replace(/\r?\n/g, '\r\n'); };
    return 'mailto:' + TO + '?subject=' + encodeURIComponent(subject()) + '&body=' + encodeURIComponent(crlf(body()));
  }

  function gmailUrl() {
    return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(TO) +
      '&su=' + encodeURIComponent(subject()) + '&body=' + encodeURIComponent(body());
  }

  function copyText(text) {
    function legacy() {
      return new Promise(function (resolve, reject) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        ok ? resolve() : reject();
      });
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(legacy); // permission refused: try the old way
    }
    return legacy();
  }

  var actions = {
    mailto: function () {
      var url = mailtoUrl();
      if (url.length > MAILTO_SAFE_LENGTH) say('Tu mensaje es largo: si no se abre tu correo, usá Gmail o copiá el mensaje.');
      else say('Abriendo tu programa de correo…');
      window.location.href = url;
    },
    gmail: function () {
      var w = window.open(gmailUrl(), '_blank', 'noopener');
      say(w ? 'Abriendo Gmail en otra pestaña…' : 'Tu navegador bloqueó la ventana. Permitila o usá “Copiar mensaje”.');
    },
    copy: function () {
      var text = 'Para: ' + TO + '\nAsunto: ' + subject() + '\n\n' + body();
      copyText(text).then(
        function () { say('Mensaje copiado. Pegalo en tu mail y mandalo a ' + TO + '.'); },
        function () { say('No pudimos copiarlo. Probá con “Abrir en mi correo” o “Abrir en Gmail”.'); }
      );
    }
  };

  [].slice.call(document.querySelectorAll('[data-act]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (validate()) actions[btn.getAttribute('data-act')]();
    });
  });

  form.addEventListener('input', function (e) {
    if (e.target.name === 'name' || e.target.name === 'message') {
      if (value(e.target.name)) showError(e.target.name, false);
    }
    render();
  });
  form.addEventListener('change', render);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('reset', function () {
    // the reset itself runs after this handler: render once the fields are empty
    setTimeout(function () {
      showError('name', false);
      showError('message', false);
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      render();
      say('Listo, empezaste de cero.');
    }, 0);
  });

  /* ---------- the composer lives inside the contact section: "Mail" opens it in place ---------- */
  var box = document.getElementById('mail');
  var toggles = [].slice.call(document.querySelectorAll('[data-mail-toggle]'));
  var title = box && box.querySelector('[data-mail-title]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function isOpen() { return box.classList.contains('is-open'); }

  function setOpen(open, scroll) {
    if (!box || open === isOpen()) return;
    box.classList.toggle('is-open', open);
    if (open) box.removeAttribute('inert'); else box.setAttribute('inert', '');
    toggles.forEach(function (t) { t.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    if (open && scroll) {
      box.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    if (open && title) title.focus({ preventScroll: true });
  }

  if (box) {
    box.setAttribute('inert', '');
    toggles.forEach(function (t) {
      t.addEventListener('click', function () { setOpen(!isOpen(), true); });
    });
    // menu / footer links to #mail only open it: the page's own anchor scrolling takes them there
    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[href="#mail"]');
      if (!link) return;
      var wasOpen = isOpen();
      setOpen(true, false);
      // the panel was closed when the page's own scroll computed its target, so the page was too
      // short to bring it to the top: once it has finished opening, settle it into place
      if (!wasOpen) setTimeout(function () { box.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }, 1500);
    });
    if (window.location.hash === '#mail') setOpen(true, false);
  }

  restoreDraft();
  render();
})();
