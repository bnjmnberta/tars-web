(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGSAP = typeof gsap !== 'undefined';
  if (hasGSAP && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }
  var lenis = null;

  document.addEventListener('DOMContentLoaded', function () {
    var yearEl = document.querySelector('[data-year]');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    setupLenis();
    setupMenu();
    setupNavAutohide();
    setupToTop();
    setupReveals();
    setupStackReveals();
    setupStackTitleShrink();
    setupStackBuild();
    setupHeroVideo();
    setupHeroDepth();
    setupHeroTrail();
    setupAnchorScroll();
    whenLoaderDone(setupHeroIntro);
  });

  /* ---------- run cb once the loading screen (js/loader.js) is gone ---------- */
  function whenLoaderDone(cb) {
    if (!document.getElementById('loader')) { cb(); return; }
    window.addEventListener('tars:loaded', function () {
      // body was height:100vh/overflow:hidden while the loader blocked scroll, so
      // every ScrollTrigger (and Lenis' own scroll-limit cache) measured itself
      // against that collapsed layout — recompute now that the real height is back.
      if (lenis) lenis.resize();
      if (hasGSAP && typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
      cb();
    }, { once: true });
  }

  /* ---------- Lenis: eased/inertial scroll, driven by GSAP's ticker so it
     stays frame-synced with every ScrollTrigger-based effect on the page ---------- */
  function setupLenis() {
    if (reduceMotion || typeof Lenis === 'undefined') return;

    lenis = new Lenis({
      duration: 1.1,
      easing: function (t) { return 1 - Math.pow(1 - t, 3); }, // ease-out cubic
      smoothWheel: true,
      syncTouch: false // native touch scroll feels better than simulated inertia on mobile
    });
    document.documentElement.classList.add('lenis');

    if (hasGSAP) {
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      requestAnimationFrame(function raf(time) { lenis.raf(time); requestAnimationFrame(raf); });
    }

    if (typeof ScrollTrigger !== 'undefined') {
      lenis.on('scroll', ScrollTrigger.update);
    }
  }

  /* ---------- route in-page #anchor links through Lenis so they ease instead of jump ---------- */
  function setupAnchorScroll() {
    var navH = document.querySelector('[data-nav]');
    var offset = navH ? -(navH.offsetHeight + 16) : -16;

    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link || link.getAttribute('href') === '#') return;
      var target = document.querySelector(link.getAttribute('href'));
      if (!target) return;

      e.preventDefault();
      if (lenis) {
        lenis.scrollTo(target, { offset: offset, duration: 1.3 });
      } else {
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
      // the full-screen menu closes itself on link click (setupMenu) before this scroll runs
    });
  }

  /* ---------- full-screen menu (animation is pure CSS; this only owns state + a11y) ----------
     opens and closes only on click / keyboard activation of the Menú button — never on hover. */
  function setupMenu() {
    var btn = document.querySelector('[data-menu-toggle]');
    var menu = document.querySelector('[data-menu]');
    if (!btn || !menu) return;

    var label = btn.querySelector('[data-menu-label]');
    var inertTargets = [document.getElementById('main'), document.querySelector('.footer')];
    var logo = document.querySelector('.nav__logo');
    var isOpen = false;

    function setOpen(open) {
      if (open === isOpen) return;
      isOpen = open;
      menu.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
      menu.inert = !open;
      inertTargets.forEach(function (el) { if (el) el.inert = open; });
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      if (label) label.textContent = open ? 'Cerrar' : 'Menú';
      document.body.style.overflow = open ? 'hidden' : '';
      if (lenis) { if (open) lenis.stop(); else lenis.start(); }
      if (open) {
        // the bar may already be tucked away by scroll-direction autohide; the Cerrar button lives in it
        var bar = document.querySelector('[data-nav]');
        if (bar) bar.classList.remove('nav--hidden');
        var first = menu.querySelector('[data-menu-link]');
        if (first) window.setTimeout(function () { first.focus({ preventScroll: true }); }, 60);
      }
    }

    btn.addEventListener('click', function () { setOpen(!isOpen); });

    // leaving through any link (section, contact, or the logo) closes it; the anchor handler then scrolls
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    if (logo) logo.addEventListener('click', function () { if (isOpen) setOpen(false); });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') { setOpen(false); btn.focus(); return; }
      if (e.key !== 'Tab') return;
      // keep Tab inside header + menu while it's open
      var stops = [].slice.call(document.querySelectorAll('.nav a, .nav button, .menu a')).filter(function (el) {
        return el.offsetParent !== null && getComputedStyle(el).pointerEvents !== 'none';
      });
      if (!stops.length) return;
      var first = stops[0], last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------- hide/show nav on scroll direction ---------- */
  function setupNavAutohide() {
    var nav = document.querySelector('[data-nav]');
    if (!nav) return;
    var lastY = window.scrollY;
    var ticking = false;

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y > lastY && y > 140 && !document.body.classList.contains('menu-open')) {
          nav.classList.add('nav--hidden');
        } else {
          nav.classList.remove('nav--hidden');
        }
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- back to top ---------- */
  function setupToTop() {
    var btn = document.querySelector('[data-to-top]');
    if (!btn) return;
    window.addEventListener('scroll', function () {
      btn.classList.toggle('is-visible', window.scrollY > window.innerHeight);
    }, { passive: true });
  }

  /* ---------- hero background video: starts paused for reduced motion, stops off-screen,
     and the pause button (WCAG 2.2.2) sticks even after scrolling away and back ---------- */
  function setupHeroVideo() {
    var video = document.querySelector('[data-hero-video]');
    if (!video) return;

    var toggle = document.querySelector('[data-video-toggle]');
    var userPaused = reduceMotion;

    function syncToggle() {
      if (!toggle) return;
      toggle.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      toggle.setAttribute('aria-label', userPaused ? 'Reproducir video de fondo' : 'Pausar video de fondo');
    }

    if (userPaused) {
      video.removeAttribute('autoplay');
      video.pause();
    }
    syncToggle();

    if (toggle) {
      toggle.addEventListener('click', function () {
        userPaused = !userPaused;
        if (userPaused) { video.pause(); } else { video.play().catch(function () {}); }
        syncToggle();
      });
    }

    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !userPaused) { video.play().catch(function () {}); }
          else { video.pause(); }
        });
      }, { threshold: 0.1 }).observe(video);
    }
  }

  /* ---------- generic [data-reveal] fade-up on scroll ---------- */
  function setupReveals() {
    var items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;

    if (reduceMotion || typeof IntersectionObserver !== 'function') {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- hero intro: TARS / STUDIO rise out of their masks ---------- */
  function setupHeroIntro() {
    var lines = document.querySelectorAll('.hero__bgline i');
    var brand = document.querySelector('.hero__brand');
    if (!lines.length) return;

    if (reduceMotion || !hasGSAP) {
      lines.forEach(function (l) { l.style.transform = 'none'; });
      return;
    }

    gsap.set(lines, { yPercent: 110 });
    var tl = gsap.timeline({ delay: 0.2 });
    tl.to(lines, {
      yPercent: 0,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.12
    });
    if (brand) {
      tl.from(brand, { opacity: 0, y: -16, duration: 0.6, ease: 'power2.out' }, '-=0.5');
    }
  }

  /* ---------- staggered reveal of title/CTA inside each sticky service block ---------- */
  function setupStackReveals() {
    var items = document.querySelectorAll('.stack__item');
    if (!items.length) return;

    items.forEach(function (item) {
      var targets = item.querySelectorAll('h3, .stack__cta');
      if (!targets.length) return;

      if (reduceMotion || !hasGSAP || typeof ScrollTrigger === 'undefined') {
        targets.forEach(function (t) { t.style.opacity = 1; });
        return;
      }

      gsap.set(targets, { opacity: 0, y: 30 });
      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.06,
        scrollTrigger: {
          trigger: item,
          start: 'top 55%',
          toggleActions: 'play none none reverse'
        }
      });
    });
  }

  /* ---------- each card's own title shrinks into the sliver strip that keeps peeking out once
     the next card stacks over it, instead of a separate duplicate label sitting there. Scrubbed
     to the exact scroll range right before the next card's sticky pin engages, so the title lands
     at its shrunk size/position at the same instant the next card starts covering everything else —
     no jump. Padding-top animates to whatever leaves the shrunk title vertically centered in the
     sliver (not flush to its top), using the h3's own line-height ratio so it's exact at any size.
     Skipped on narrow screens: the sliver there is only ~22px tall, too tight for a legible word. */
  function setupStackTitleShrink() {
    var items = [].slice.call(document.querySelectorAll('.stack__item'));
    if (items.length < 2 || reduceMotion || !hasGSAP || typeof ScrollTrigger === 'undefined') return;
    if (window.matchMedia('(max-width: 700px)').matches) return;

    var TRANSITION_PX = 260; // scroll distance the shrink is scrubbed over

    for (var i = 0; i < items.length - 1; i++) {
      (function (item, next) {
        var shape = item.querySelector('.stack__shape');
        var h3 = shape.querySelector('h3');
        var step = next.closest('.stack__step');
        if (!shape || !h3 || !step) return;

        var thisTop = parseFloat(getComputedStyle(item).top);
        var nextTop = parseFloat(getComputedStyle(next).top);
        var sliverH = nextTop - thisTop; // how tall the peeking strip actually is (56px desktop)
        var cs = getComputedStyle(h3);
        var lineHeightRatio = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); // unitless, same at any font-size
        var targetFontSize = Math.max(14, sliverH * 0.42);
        var targetPaddingTop = Math.max(0, (sliverH - targetFontSize * lineHeightRatio) / 2);

        // resting values come from the stylesheet (they change with the viewport), read with the
        // tween's own inline value cleared, and re-read on every refresh
        function atRest(el, prop) {
          var keep = el.style[prop];
          el.style[prop] = '';
          var v = getComputedStyle(el)[prop];
          el.style[prop] = keep;
          return v;
        }

        gsap.timeline({
          scrollTrigger: {
            trigger: step,
            start: 'top top+=' + (nextTop + TRANSITION_PX),
            end: 'top top+=' + nextTop,
            scrub: true,
            invalidateOnRefresh: true
          }
        })
          .fromTo(shape, { paddingTop: function () { return atRest(shape, 'paddingTop'); } },
            { paddingTop: targetPaddingTop, ease: 'none', immediateRender: false }, 0)
          .fromTo(h3, { fontSize: function () { return atRest(h3, 'fontSize'); } },
            { fontSize: targetFontSize, ease: 'none', immediateRender: false }, 0)
          // the drawing fills the card up to its top edge — fade it so only the title sits in the strip
          .to(shape.querySelector('.stack__art'), { opacity: 0, ease: 'none' }, 0);
      })(items[i], items[i + 1]);
    }
  }

  /* ---------- each card builds itself while it holds the top of the stack: once its sticky lock
     engages, the next --hold px of ordinary scrolling (CSS, on .stack) trace its drawing back to
     front and bring its copy in left to right, all before the next card starts sliding over it.
     Every shape is filled with the card colour, so front layers hide the lines behind them.
     Reduced motion (or no GSAP): every card simply shows fully built. ---------- */
  function setupStackBuild() {
    var stack = document.querySelector('.stack');
    var items = [].slice.call(document.querySelectorAll('.stack__item'));
    if (!stack || !items.length) return;
    var hold = parseFloat(getComputedStyle(stack).getPropertyValue('--hold')) || 0;
    var canScrub = hasGSAP && typeof ScrollTrigger !== 'undefined' && !reduceMotion && hold > 0;

    items.forEach(function (item) {
      var svg = item.querySelector('.stack__art svg');
      var art = svg && svg.querySelector('.art');
      if (!art || !hasGSAP) return;

      var ink = getComputedStyle(item).color;
      var bg = getComputedStyle(item).getPropertyValue('--card-bg').trim();

      var tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
      var painters = []; // proxy-driven paints, replayed after a refresh (see onRefresh below)
      var steps = [].slice.call(art.querySelectorAll('[data-step]'));
      var span = 0.86 / steps.length;

      // contours trace one layer per step; a finished contour drops its dash pattern so its
      // closing corner renders as a clean miter instead of a dash seam. A shape's card-coloured
      // fill fades in while its contour draws, so whatever it covers dissolves out gradually
      // instead of vanishing the instant the shape starts (and nothing is hidden before that)
      steps.forEach(function (step, i) {
        var at = i * span;
        step.querySelectorAll('path, rect, circle, line, ellipse').forEach(function (el) {
          if (el.classList.contains('pop')) return;
          var len = el.getTotalLength();
          var o = { p: 0 };
          function paint() {
            el.style.fillOpacity = Math.min(1, Math.max(0, (o.p - 0.15) / 0.85));
            if (o.p >= 0.999) {
              el.style.strokeDasharray = 'none';
              el.style.strokeDashoffset = '0';
            } else {
              el.style.strokeDasharray = len + ' ' + len;
              el.style.strokeDashoffset = len * (1 - o.p);
            }
          }
          paint();
          painters.push(paint);
          tl.to(o, { p: 1, duration: span * 0.92, onUpdate: paint }, at);
        });
        var pops = step.querySelectorAll('.pop');
        if (pops.length) {
          gsap.set(pops, { opacity: 0, scale: 0, transformOrigin: '50% 50%' });
          tl.to(pops, { opacity: 1, scale: 1, duration: span * 0.2, stagger: span * 0.05, ease: 'back.out(3)' }, at + span * 0.75);
        }
      });

      // the paragraph is written alongside the drawing, letter by letter, and lands with the final fill
      var writer = createWriter(item.querySelector('.stack__expand'));
      if (writer) {
        var pen = { p: 0 };
        var write = function () { writer.paint(pen.p); };
        painters.push(write);
        tl.to(pen, { p: 1, duration: 0.86, onUpdate: write }, 0.05);
      }

      var endfills = art.querySelectorAll('[data-endfill]');
      if (endfills.length) {
        gsap.set(endfills, { fill: bg });
        tl.to(endfills, { fill: ink, duration: 0.1 }, 0.88);
      }

      if (!canScrub) { tl.progress(1); return; }

      var step = item.closest('.stack__step');
      ScrollTrigger.create({
        trigger: step,
        start: function () { return 'top top+=' + parseFloat(getComputedStyle(item).top); },
        // re-read on every refresh: --hold changes between the desktop and phone layouts
        end: function () { return '+=' + (parseFloat(getComputedStyle(stack).getPropertyValue('--hold')) || hold) * 0.9; },
        scrub: true,
        animation: tl,
        invalidateOnRefresh: true,
        // a refresh (loader done, resize) restores the timeline's progress with callbacks
        // suppressed: the proxies land on the right value but nothing repaints from them
        onRefresh: function () { painters.forEach(function (fn) { fn(); }); }
      });
    });
  }

  /* ---------- hand-written copy: each card's paragraph is set as real glyph outlines (opentype.js
     reads the same Mona Sans / Cormorant files the CSS uses), sized to fill the whole copy box.
     paint(p) traces every letter's contour and then inks it in, left to right, a few letters in
     motion at once like a pen. The <p> stays in the DOM for screen readers and as the no-JS look. */
  var WRITE_LH = 1;          // line advance, in font-size units
  var WRITE_TOP = 0.95;      // first baseline: cap height + room for accents on capitals (É, Ó, Í)
  var WRITE_BOTTOM = 0.18;   // under the last baseline: commas and the tail of Q
  var WRITE_TRACK = -0.01;   // sans tracking, em
  var WRITE_PEN = 5;         // letters being written at the same time
  var WRITE_SCALE = 0.8;     // copy set at 80% of the size that would fill its box — the title leads
  var writeFonts = null;

  function loadWriteFonts() {
    if (writeFonts) return writeFonts;
    writeFonts = new Promise(function (resolve, reject) {
      if (typeof opentype === 'undefined') { reject(new Error('opentype.js missing')); return; }
      var urls = ['assets/fonts/MonaSans-Bold.woff', 'assets/fonts/CormorantGaramond-Bold.woff'];
      var fonts = [];
      var left = urls.length;
      urls.forEach(function (url, i) {
        opentype.load(url, function (err, font) {
          if (err) { reject(err); return; }
          fonts[i] = font;
          if (--left === 0) resolve({ sans: fonts[0], serif: fonts[1] });
        });
      });
    });
    return writeFonts;
  }

  // paragraph -> words -> letters, each letter tagged sans or serif (<em>)
  function readWords(p) {
    var words = [];
    var cur = [];
    function flush() { if (cur.length) { words.push(cur); cur = []; } }
    (function walk(node, serif) {
      [].forEach.call(node.childNodes, function (n) {
        if (n.nodeType === 3) {
          n.textContent.toUpperCase().split('').forEach(function (ch) {
            if (/\s/.test(ch)) flush(); else cur.push({ ch: ch, serif: serif });
          });
        } else if (n.nodeType === 1) {
          walk(n, serif || n.tagName === 'EM');
        }
      });
    })(p, false);
    flush();
    return words;
  }

  // shape every word once at font-size 1; any real size is just a multiple of these numbers
  function shapeWords(words, fonts) {
    var sans = fonts.sans;
    var serif = fonts.serif;
    // serif capitals drawn to the same cap height as the sans, as on the reference
    var serifScale = (sans.tables.os2.sCapHeight / sans.unitsPerEm) / (serif.tables.os2.sCapHeight / serif.unitsPerEm);
    var shaped = words.map(function (word) {
      var x = 0;
      var prev = null;
      var glyphs = word.map(function (c) {
        var font = c.serif ? serif : sans;
        var size = c.serif ? serifScale : 1;
        var g = font.charToGlyph(c.ch);
        if (prev && prev.font === font) x += font.getKerningValue(prev.g, g) * size / font.unitsPerEm;
        var out = { g: g, size: size, x: x };
        x += g.advanceWidth * size / font.unitsPerEm + (c.serif ? 0 : WRITE_TRACK);
        prev = { g: g, font: font };
        return out;
      });
      return { glyphs: glyphs, w: x };
    });
    return { words: shaped, space: sans.charToGlyph(' ').advanceWidth / sans.unitsPerEm };
  }

  function breakLines(shaped, s, W) {
    var lines = [];
    var line = [];
    var x = 0;
    shaped.words.forEach(function (w) {
      var ww = w.w * s;
      var gap = line.length ? shaped.space * s : 0;
      if (line.length && x + gap + ww > W) { lines.push(line); line = []; x = 0; gap = 0; }
      line.push({ word: w, x: x + gap });
      x += gap + ww;
    });
    if (line.length) lines.push(line);
    return lines;
  }

  function textHeight(n, s) { return s * (WRITE_TOP + (n - 1) * WRITE_LH + WRITE_BOTTOM); }

  // biggest font-size whose wrapped paragraph fits the box
  function fitSize(shaped, W, H) {
    var widest = 0;
    shaped.words.forEach(function (w) { widest = Math.max(widest, w.w); });
    var lo = 6;
    var hi = Math.min(220, W / widest);
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2;
      if (textHeight(breakLines(shaped, mid, W).length, mid) <= H) lo = mid; else hi = mid;
    }
    return lo * WRITE_SCALE;
  }

  function createWriter(box) {
    var para = box && box.querySelector('.stack__why');
    if (!para) return null;
    var shape = box.closest('.stack__shape');
    var h3 = shape && shape.querySelector('h3');
    var NS = 'http://www.w3.org/2000/svg';
    var words = readWords(para);
    var shaped = null;
    var svg = null;
    var glyphs = [];
    var last = [];
    var progress = 0;

    function layout() {
      // measure the box at rest: the title-shrink scrub may have left inline sizes on the card
      var keepPad = shape.style.paddingTop;
      var keepFont = h3 ? h3.style.fontSize : '';
      shape.style.paddingTop = '';
      if (h3) h3.style.fontSize = '';
      var W = box.clientWidth;
      var H = box.clientHeight;
      shape.style.paddingTop = keepPad;
      if (h3) h3.style.fontSize = keepFont;
      if (W < 40 || H < 20) return;

      var s = fitSize(shaped, W, H);
      var lines = breakLines(shaped, s, W);
      var h = textHeight(lines.length, s);

      if (svg) svg.remove();
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'stack__write');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + h);
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('stroke-width', Math.max(0.8, s * 0.022).toFixed(2));
      svg.appendChild(g);

      glyphs = [];
      lines.forEach(function (line, li) {
        var baseline = s * (WRITE_TOP + li * WRITE_LH);
        line.forEach(function (item) {
          item.word.glyphs.forEach(function (gl) {
            var d = gl.g.getPath(item.x + gl.x * s, baseline, gl.size * s).toPathData(2);
            if (!d) return;
            var path = document.createElementNS(NS, 'path');
            path.setAttribute('d', d);
            g.appendChild(path);
            glyphs.push({ el: path, len: 0 });
          });
        });
      });
      box.appendChild(svg);
      glyphs.forEach(function (gl) { gl.len = Math.ceil(gl.el.getTotalLength()) + 1; });
      last = [];
      box.classList.add('is-written');
      paint(progress);
    }

    function paint(p) {
      progress = p;
      var n = glyphs.length;
      if (!n) return;
      var head = p * (n + WRITE_PEN);
      for (var i = 0; i < n; i++) {
        var t = Math.min(1, Math.max(0, (head - i) / WRITE_PEN));
        if (t === last[i]) continue;
        last[i] = t;
        var gl = glyphs[i];
        var st = gl.el.style;
        if (t <= 0) { st.visibility = 'hidden'; continue; }
        st.visibility = 'visible';
        var drawn = Math.min(1, t / 0.7); // the contour first...
        if (drawn >= 1) {
          st.strokeDasharray = 'none';
          st.strokeDashoffset = '0';
        } else {
          st.strokeDasharray = gl.len + ' ' + gl.len;
          st.strokeDashoffset = String(gl.len * (1 - drawn));
        }
        st.fillOpacity = String(Math.min(1, Math.max(0, (t - 0.45) / 0.55))); // ...then the ink
      }
    }

    Promise.all([loadWriteFonts(), document.fonts ? document.fonts.ready : null]).then(function (res) {
      shaped = shapeWords(words, res[0]);
      layout();
      var wait;
      window.addEventListener('resize', function () {
        clearTimeout(wait);
        wait = setTimeout(layout, 150);
      });
    }).catch(function () { /* fonts or opentype.js unavailable: the plain <p> stays visible */ });

    return { paint: paint };
  }

  /* ---------- hero 3D depth: each layer rides its own Z-plane, driven by one scroll scrub ----------
     .hero has perspective + preserve-3d directly (single 3D context, no nested transform-origins),
     so every layer below animates its own translateZ independently: background recedes,
     foreground (logo, headline) pushes toward the viewer — real depth, not a flat 2D parallax fake. */
  function setupHeroDepth() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    if (reduceMotion || !hasGSAP || typeof ScrollTrigger === 'undefined') return;

    var isSmall = window.matchMedia('(max-width: 700px)').matches;
    var factor = isSmall ? 0.55 : 1; // tone down travel distance on small screens

    var layers = [
      { el: document.querySelector('.hero__frame'), z: 45 },
      { el: document.querySelector('.hero__brand'), z: 115 }
    ];

    var st = {
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      scrub: 0.4
    };

    layers.forEach(function (layer, i) {
      if (!layer.el) return;
      gsap.fromTo(layer.el,
        { z: 0 },
        {
          z: layer.z * factor,
          ease: 'none',
          scrollTrigger: i === 0 ? st : Object.assign({}, st) // each gets its own ScrollTrigger instance
        }
      );
    });
  }

  /* ---------- hero image trail: every ~100px of pointer travel, the next image drops at the
     cursor (eased position), glides to it over 1.8s, then vanishes; later images stack on top.
     Mouse: follows the pointer. Touch: no hover exists, so a random image flashes every ~0.9s. ---------- */
  function setupHeroTrail() {
    var hero = document.querySelector('.hero');
    var box = document.querySelector('[data-trail]');
    if (!hero || !box || reduceMotion || !hasGSAP) return;
    var imgs = [].slice.call(box.querySelectorAll('img'));
    if (!imgs.length) return;

    var THRESHOLD = 100; // px of travel before the next image
    var isTouch = window.matchMedia('(hover: none)').matches;
    var index = 0;
    var z = 1;

    function place(img, x, y) {
      // offsetWidth/Height are layout sizes: getBoundingClientRect would include the leftover
      // scale(2) from the previous run and push the image off-centre from the cursor
      var b = box.getBoundingClientRect();
      return { x: x - b.left - img.offsetWidth / 2, y: y - b.top - img.offsetHeight / 2 };
    }

    /* Ambient layer (Analogue's second effect): while the pointer is still, ONE extra image at a time,
       next in order, lands at a random spot for 0.6s, then a 0.1s gap, on loop. Moving the mouse hands
       control back to the trail. Touch has no pointer, so it is always in this mode. */
    var ambient = document.createElement('img');
    ambient.alt = '';
    ambient.width = 600;
    ambient.height = 800;
    ambient.setAttribute('aria-hidden', 'true');
    box.appendChild(ambient);

    var IDLE_MS = 450; // still for this long => ambient takes over
    var ambientIndex = 0;
    var heroVisible = true;
    var lastMoveAt = 0;

    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; }, { threshold: 0.2 }).observe(hero);
    }

    function isIdle() { return isTouch || performance.now() - lastMoveAt > IDLE_MS; }
    function hideAmbient() { ambient.style.opacity = 0; }

    function ambientCycle() {
      if (document.hidden || !heroVisible || !isIdle()) {
        hideAmbient();
        window.setTimeout(ambientCycle, 150);
        return;
      }
      var src = imgs[ambientIndex];
      ambient.width = src.getAttribute('width');
      ambient.height = src.getAttribute('height');
      ambient.src = src.currentSrc || src.src;
      ambientIndex = (ambientIndex + 1) % imgs.length;
      var b = box.getBoundingClientRect();
      var x = Math.random() * Math.max(0, b.width - ambient.offsetWidth);
      var y = Math.random() * Math.max(0, b.height - ambient.offsetHeight);
      ambient.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      ambient.style.opacity = 1;
      window.setTimeout(function () {
        hideAmbient();
        window.setTimeout(ambientCycle, 100);
      }, 600);
    }
    ambientCycle();

    if (isTouch) return;

    var mouse = { x: 0, y: 0 };
    var last = { x: 0, y: 0 };
    var eased = { x: 0, y: 0 };
    var over = false;

    hero.addEventListener('mouseenter', function (e) {
      over = true;
      mouse.x = last.x = eased.x = e.clientX;
      mouse.y = last.y = eased.y = e.clientY;
    });
    hero.addEventListener('mouseleave', function () { over = false; });
    window.addEventListener('mousemove', function (e) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      lastMoveAt = performance.now();
      hideAmbient();
    }, { passive: true });

    function show() {
      var img = imgs[index];
      var from = place(img, eased.x, eased.y);
      var to = place(img, mouse.x, mouse.y);
      gsap.killTweensOf(img);
      gsap.timeline()
        .set(img, { opacity: 1, scale: 1, zIndex: z, x: from.x, y: from.y })
        .to(img, { duration: 1.8, ease: 'expo.out', x: to.x, y: to.y })
        .to(img, { duration: 0, opacity: 0 }, 0.8)
        .to(img, { duration: 0, scale: 2 }, 0.8);
      z++;
      index = (index + 1) % imgs.length;
    }

    gsap.ticker.add(function () {
      if (!over) return;
      eased.x += (mouse.x - eased.x) * 0.1;
      eased.y += (mouse.y - eased.y) * 0.1;
      if (Math.hypot(mouse.x - last.x, mouse.y - last.y) > THRESHOLD) {
        show();
        last.x = mouse.x;
        last.y = mouse.y;
      }
    });
  }
})();
