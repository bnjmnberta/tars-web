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
    setupHeroVideo();
    setupHeroDepth();
    setupMetalText();
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

  /* ---------- staggered reveal of tags/CTA inside each sticky service block ---------- */
  function setupStackReveals() {
    var items = document.querySelectorAll('.stack__item');
    if (!items.length) return;

    items.forEach(function (item) {
      var targets = item.querySelectorAll('.stack__index, h3, .tags span, .stack__cta');
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
      { el: document.querySelector('.hero__content'), z: 75 },
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

  /* ---------- metallic 3D letters: split every [data-metal] run into chars and tilt each toward the
     cursor. The runs live in the scrolling marquee, so their positions change every frame:
     letters are only measured while the pointer is near their band, and reset when it leaves. ---------- */
  function setupMetalText() {
    var wraps = [].slice.call(document.querySelectorAll('[data-metal]'));
    if (!wraps.length) return;

    var groups = wraps.map(function (wrap) {
      var fullText = wrap.textContent;
      wrap.textContent = '';
      var letters = fullText.split('').map(function (ch) {
        var span = document.createElement('span');
        span.className = 'metal-letter';
        var glyph = ch === ' ' ? '\u00A0' : ch; // a plain space inside an inline-block collapses to nothing
        span.textContent = glyph;
        span.setAttribute('data-char', glyph);
        wrap.appendChild(span);
        return span;
      });
      return { band: wrap.closest('.marquee') || wrap, letters: letters, active: false, quick: null };
    });

    var isTouch = window.matchMedia('(hover: none)').matches;
    if (reduceMotion || isTouch || !hasGSAP) return;

    var TILT_RADIUS = 320; // px — letters beyond this distance from the cursor stay flat
    var MAX_TILT = 42; // deg
    var MAX_POP = 58; // px translateZ at the cursor's exact position

    groups.forEach(function (g) {
      g.quick = g.letters.map(function (el) {
        return {
          rx: gsap.quickTo(el, 'rotationX', { duration: 0.45, ease: 'power3.out' }),
          ry: gsap.quickTo(el, 'rotationY', { duration: 0.45, ease: 'power3.out' }),
          tz: gsap.quickTo(el, 'z', { duration: 0.45, ease: 'power3.out' }),
          shine: gsap.quickTo(el, '--shine', { duration: 0.35, ease: 'power2.out' })
        };
      });
    });

    function reset(g) {
      g.quick.forEach(function (q, i) {
        q.rx(0); q.ry(0); q.tz(0); q.shine(50);
        g.letters[i].style.filter = 'none';
      });
      g.active = false;
    }

    var ticking = false;
    var lastX = 0, lastY = 0;

    function applyTilt() {
      ticking = false;
      groups.forEach(function (g) {
        var band = g.band.getBoundingClientRect();
        var near = lastY > band.top - TILT_RADIUS && lastY < band.bottom + TILT_RADIUS &&
                   band.bottom > 0 && band.top < window.innerHeight;
        if (!near) { if (g.active) reset(g); return; }
        g.active = true;
        g.letters.forEach(function (el, i) {
          var r = el.getBoundingClientRect();
          var dx = lastX - (r.left + r.width / 2);
          var dy = lastY - (r.top + r.height / 2);
          var influence = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / TILT_RADIUS);
          var ry = gsap.utils.clamp(-MAX_TILT, MAX_TILT, (dx / 11) * influence);
          var rx = gsap.utils.clamp(-MAX_TILT, MAX_TILT, (-dy / 11) * influence);
          var q = g.quick[i];
          q.ry(ry);
          q.rx(rx);
          q.tz(MAX_POP * influence);
          // brushed-metal highlight slides across the glyph as it turns, like light catching a tilted blade
          q.shine(50 + gsap.utils.clamp(-50, 50, ry * 1.6));
          // no shadow at rest (keeps the letters crisp); it grows only as a letter lifts toward the cursor
          el.style.filter = influence < 0.02 ? 'none' :
            'drop-shadow(' + (-ry * 0.35).toFixed(1) + 'px ' + (rx * -0.35).toFixed(1) +
            'px ' + (influence * 12).toFixed(1) + 'px rgba(0,0,0,' + (influence * 0.6).toFixed(2) + '))';
        });
      });
    }

    window.addEventListener('mousemove', function (e) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(applyTilt);
      }
    }, { passive: true });

    window.addEventListener('mouseleave', function () { groups.forEach(reset); });
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
