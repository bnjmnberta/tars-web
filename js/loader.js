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

  /* -------- animated loop: the mark draws itself back to front, as on the Logos card —
     each bar's contour traces in (bars in front hide what's behind them), the dot pops in
     with the first bar, the white bar fills, a short hold, then it fades and starts over
     until the page is ready -------- */
  var mark = loader.querySelector('.loader__mark');
  var bars = [].slice.call(loader.querySelectorAll('.bar'));
  var solid = loader.querySelector('.bar--solid');
  var dot = loader.querySelector('.dot');
  var BLACK = '#0a0a0a';
  var WHITE = '#f6f6f1';
  var DRAW = 0.45; // seconds per contour
  var GAP = 0.3;   // next bar starts this long after the previous one

  var loop = gsap.timeline({ repeat: -1, repeatDelay: 0.1 });

  loop.set(solid, { fill: BLACK }, 0)
    .set(dot, { visibility: 'visible', opacity: 0, scale: 0, transformOrigin: '50% 50%' }, 0)
    .set(mark, { opacity: 1 }, 0);

  bars.forEach(function (bar, i) {
    var len = Math.ceil(bar.getTotalLength()) + 1;
    var at = i * GAP;
    // hidden until its turn: a zero-length dash can still leave a speck at the path's start
    loop.set(bar, { visibility: 'hidden', strokeDasharray: len + ' ' + len * 2, strokeDashoffset: len }, 0)
      .set(bar, { visibility: 'visible' }, at)
      .to(bar, { strokeDashoffset: 0, duration: DRAW, ease: 'power2.inOut' }, at)
      .set(bar, { strokeDasharray: 'none' }, at + DRAW); // clean miter at the closing corner
  });

  var drawn = (bars.length - 1) * GAP + DRAW;
  loop.to(dot, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(3)' }, DRAW * 0.8)
    .to(solid, { fill: WHITE, duration: 0.3, ease: 'power1.out' }, drawn)
    .to({}, { duration: 0.45 }) // hold beat on the finished mark
    .call(function () {
      if (isReady()) {
        loop.pause();
        gsap.to(loader, { opacity: 0, duration: 0.6, ease: 'power2.inOut', onComplete: removeLoader });
      }
    })
    .to(mark, { opacity: 0, duration: 0.3, ease: 'power1.in' });
})();
