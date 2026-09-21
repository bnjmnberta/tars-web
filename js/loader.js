(function () {
  'use strict';

  var loader = document.getElementById('loader');
  if (!loader) return;

  document.body.classList.add('is-loading');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGSAP = typeof gsap !== 'undefined';

  var MIN_VISIBLE_MS = 900;
  var HARD_TIMEOUT_MS = 8000;

  var minTimeReached = false;
  var pageReady = false;
  var done = false;

  window.setTimeout(function () { minTimeReached = true; }, MIN_VISIBLE_MS);
  window.setTimeout(function () { pageReady = true; minTimeReached = true; }, HARD_TIMEOUT_MS);

  var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  var pageLoaded = new Promise(function (resolve) {
    if (document.readyState === 'complete') { resolve(); }
    else { window.addEventListener('load', resolve, { once: true }); }
  });
  Promise.all([fontsReady, pageLoaded]).then(function () { pageReady = true; });

  function isReady() { return minTimeReached && pageReady; }

  function removeLoader() {
    if (done) return;
    done = true;
    document.body.classList.remove('is-loading');
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    window.dispatchEvent(new CustomEvent('tars:loaded'));
  }

  /* -------- reduced motion / no GSAP: static mark, poll + quick fade -------- */
  if (reduceMotion || !hasGSAP) {
    loader.classList.add('is-static');
    (function poll() {
      if (isReady()) {
        loader.style.transition = 'opacity .5s ease';
        loader.style.opacity = '0';
        window.setTimeout(removeLoader, 500);
      } else {
        window.setTimeout(poll, 120);
      }
    })();
    return;
  }

  /* -------- animated loop: draw bars, fill, pop dot, hold, fade mark -------- */
  var bars = loader.querySelectorAll('.bar');
  var solidBars = loader.querySelectorAll('.bar--x1, .bar--x2');
  var dot = loader.querySelector('.dot');
  var mark = loader.querySelector('.loader__mark');
  var dashVals = [412, 412, 192]; // bar--x1, bar--x2, bar--accent (DOM order)

  var loop = gsap.timeline({ repeat: -1, repeatDelay: 0.15 });

  bars.forEach(function (bar, i) {
    loop.fromTo(bar,
      { strokeDashoffset: dashVals[i] },
      { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' },
      i * 0.12
    );
  });
  loop.fromTo(solidBars,
    { fill: 'rgba(246,246,241,0)' },
    { fill: '#f6f6f1', duration: 0.3, ease: 'power1.out', stagger: 0.06 },
    '-=0.2'
  );
  loop.fromTo(dot,
    { opacity: 0, scale: 0 },
    { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(3)' },
    '-=0.1'
  );
  loop.to({}, { duration: 0.45 }); // hold beat
  loop.call(function () {
    if (isReady()) {
      loop.pause();
      gsap.to(loader, { opacity: 0, duration: 0.6, ease: 'power2.inOut', onComplete: removeLoader });
    }
  });
  loop.to(mark, { opacity: 0, duration: 0.3, ease: 'power1.in' });
  loop.set(mark, { opacity: 1 });
})();
