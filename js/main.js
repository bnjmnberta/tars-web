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
    setupNavToggle();
    setupNavAutohide();
    setupToTop();
    setupHeroVideo();
    setupReveals();
    setupStackReveals();
    setupHeroDepth();
    setupMetalText();
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
      // closing the mobile menu on link click is already handled by setupNavToggle()
    });
  }

  /* ---------- mobile nav ---------- */
  function setupNavToggle() {
    var burger = document.querySelector('[data-burger]');
    var mobile = document.querySelector('[data-nav-mobile]');
    if (!burger || !mobile) return;

    function close() {
      mobile.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
    function toggle() {
      var open = mobile.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    }
    burger.addEventListener('click', toggle);
    mobile.querySelectorAll('[data-nav-mobile-link]').forEach(function (link) {
      link.addEventListener('click', close);
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
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
        if (y > lastY && y > 140) {
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

  /* ---------- hero video: pause for reduced motion / small screens ---------- */
  function setupHeroVideo() {
    var video = document.querySelector('[data-hero-video]');
    if (!video) return;

    var smallScreen = window.matchMedia('(max-width: 480px)').matches;
    if (reduceMotion || smallScreen) {
      video.removeAttribute('autoplay');
      video.pause();
    }

    if (typeof IntersectionObserver === 'function' && !reduceMotion && !smallScreen) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            video.play().catch(function () {});
          } else {
            video.pause();
          }
        });
      }, { threshold: 0.1 });
      io.observe(video);
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

  /* ---------- hero title intro ---------- */
  function setupHeroIntro() {
    var lines = document.querySelectorAll('.hero__title i');
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
    // the line masks (overflow:hidden) only exist to hide the slide-up entrance;
    // drop them afterward so the metal letters can tilt/pop past the line box on mouse move
    tl.set(document.querySelectorAll('.hero__title span'), { overflow: 'visible' });
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
      { el: document.querySelector('.hero__video'), z: -140 },
      { el: document.querySelector('.hero__overlay'), z: -140 },
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

  /* ---------- metallic 3D letters: split "se mueven." into chars, tilt each toward the cursor ---------- */
  function setupMetalText() {
    var wrap = document.querySelector('[data-metal]');
    if (!wrap) return;

    var fullText = wrap.textContent;
    wrap.textContent = '';
    var letters = fullText.split('').map(function (ch) {
      var span = document.createElement('span');
      span.className = 'metal-letter';
      var glyph = ch === ' ' ? ' ' : ch;
      span.textContent = glyph;
      span.setAttribute('data-char', glyph);
      wrap.appendChild(span);
      return span;
    });
    wrap.setAttribute('aria-hidden', 'true'); // h1 already carries the full text via aria-label

    var isTouch = window.matchMedia('(hover: none)').matches;
    if (reduceMotion || isTouch || !hasGSAP) return;

    var TILT_RADIUS = 320; // px — letters beyond this distance from the cursor stay flat
    var MAX_TILT = 42; // deg
    var MAX_POP = 58; // px translateZ at the cursor's exact position

    var quick = letters.map(function (el) {
      return {
        rx: gsap.quickTo(el, 'rotationX', { duration: 0.45, ease: 'power3.out' }),
        ry: gsap.quickTo(el, 'rotationY', { duration: 0.45, ease: 'power3.out' }),
        tz: gsap.quickTo(el, 'z', { duration: 0.45, ease: 'power3.out' }),
        shine: gsap.quickTo(el, '--shine', { duration: 0.35, ease: 'power2.out' })
      };
    });

    var ticking = false;
    var lastX = 0, lastY = 0;

    function applyTilt() {
      ticking = false;
      letters.forEach(function (el, i) {
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = lastX - cx;
        var dy = lastY - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var influence = Math.max(0, 1 - dist / TILT_RADIUS);
        var ry = gsap.utils.clamp(-MAX_TILT, MAX_TILT, (dx / 11) * influence);
        var rx = gsap.utils.clamp(-MAX_TILT, MAX_TILT, (-dy / 11) * influence);
        quick[i].ry(ry);
        quick[i].rx(rx);
        quick[i].tz(MAX_POP * influence);
        // brushed-metal highlight slides across the glyph as it turns, like light catching a tilted blade
        quick[i].shine(50 + gsap.utils.clamp(-50, 50, ry * 1.6));
        // shadow leans away from the tilt so the pop toward the viewer actually reads as depth
        el.style.filter = 'drop-shadow(' + (-ry * 0.35).toFixed(1) + 'px ' + (rx * -0.35).toFixed(1) +
          'px ' + (4 + influence * 10).toFixed(1) + 'px rgba(0,0,0,' + (0.35 + influence * 0.35).toFixed(2) + '))';
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

    window.addEventListener('mouseleave', function () {
      quick.forEach(function (q, i) {
        q.rx(0); q.ry(0); q.tz(0); q.shine(50);
        letters[i].style.filter = 'none';
      });
    });
  }
})();
