/* Motion for dhkts1.github.io.
 *
 * GSAP and Flip (vendor/, GSAP 3.15.0) move the page; d3 (vendor/, 7.9.0) draws the
 * four performance charts and is fetched only when they come near the viewport.
 *
 * The page does not depend on this file. With no script it is the static page; with reduced motion
 * asked for, the d3 charts are drawn without their race and nothing else moves. Every loop here
 * (the hero's requests, the closing mark) runs only while its section is on screen.
 *
 * Everything the hero panel does is an illustration with example accounts, like the panel itself.
 */
(function () {
  'use strict';

  var root = document.documentElement;

  function $(sel, from) { return (from || document).querySelector(sel); }
  function $$(sel, from) { return Array.prototype.slice.call((from || document).querySelectorAll(sel)); }
  function okColor() { return getComputedStyle(root).getPropertyValue('--ok').trim(); }
  function tint(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  // Chart row geometry. Set before charts() runs: a var declared further down is still
  // undefined at this point, and the height it computes would be NaN.
  var ROW = 32, TOP = 2, AXIS = 22;
  charts();

  if (!window.gsap || !window.Flip) {
    console.warn('tcr site: GSAP did not load, so the page stays static');
    root.classList.remove('motion');
    return;
  }
  // No ScrollTrigger: it keeps a requestAnimationFrame loop alive for as long as it is enabled
  // (_rafBugFix in its source), a measured 2% of a core on a page where nothing moves. Scrolling
  // is watched with IntersectionObserver and one passive scroll listener instead, so GSAP's own
  // ticker sleeps whenever nothing animates.
  gsap.registerPlugin(Flip);

  /* ------------------------------------------------------------------------------------------
   * The mark: eight rays round the proxy, each ray one account and its length the quota left.
   * Same geometry and colours as mark.svg, drawn as dashes so a ray's length can move.
   * ---------------------------------------------------------------------------------------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  var HOME = [1, 0.75, 0.94, 0.57, 0.81, 0.35, 0.69, 0.15]; // mark.svg's own ray lengths
  var MARK = { ok: '#66d081', near: '#ffd16b', out: '#ea5a56', track: '#2f3339', hub: '#f2f2ef', bg: '#090c10' };

  function el(name, attrs) {
    var node = document.createElementNS(SVGNS, name);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }
  function makeMark(cls) {
    var svg = el('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true', 'class': cls });
    svg.appendChild(el('rect', { width: 32, height: 32, rx: 8, fill: MARK.bg }));
    var rays = DIRS.map(function (d) {
      var k = d[0] && d[1] ? Math.SQRT1_2 : 1;
      var dx = d[0] * k, dy = d[1] * k;
      var path = 'M' + (16 + dx * 4.4).toFixed(2) + ' ' + (16 + dy * 4.4).toFixed(2) +
        'L' + (16 + dx * 12.5).toFixed(2) + ' ' + (16 + dy * 12.5).toFixed(2);
      var line = { fill: 'none', 'stroke-width': 2.6, 'stroke-linecap': 'round', d: path };
      svg.appendChild(el('path', Object.assign({ stroke: MARK.track }, line)));
      var ray = el('path', Object.assign({ pathLength: 1 }, line));
      svg.appendChild(ray);
      return ray;
    });
    var hub = el('circle', { cx: 16, cy: 16, r: 2.3, fill: MARK.hub });
    svg.appendChild(hub);
    var state = HOME.map(function () { return { f: 0 }; });
    function paint() {
      state.forEach(function (s, i) {
        var f = Math.max(0, Math.min(1, s.f));
        rays[i].setAttribute('stroke-dasharray', f.toFixed(3) + ' 2');
        rays[i].setAttribute('stroke', f < 0.2 ? MARK.out : f < 0.4 ? MARK.near : MARK.ok);
      });
    }
    paint();
    return { svg: svg, state: state, hub: hub, paint: paint };
  }

  /* ------------------------------------------------------------------------------------------
   * DOM preparation, once. Splitting text keeps every character in place, so the page reads and
   * copies the same; only the animations below use the new spans.
   * ---------------------------------------------------------------------------------------- */
  function splitLines(pre, cls, joiner) {
    if (pre.dataset.split) return;
    pre.dataset.split = '1';
    pre.innerHTML = pre.innerHTML.split('\n').map(function (l) {
      return '<span class="' + cls + '">' + l + '</span>';
    }).join(joiner);
  }
  $$('.step .code').forEach(function (pre) { splitLines(pre, 'ln', ''); });
  var termBody = $('.term-body');
  if (termBody) splitLines(termBody, 'tl', '\n');

  // One reading of a figure in the page's text ("97.6", "$184", "1,840 ms"), used by the counters
  // and by the charts alike, so the two can never disagree about a number.
  function parseFigure(text) {
    var m = /^(\s*)(\$?)([\d][\d,]*(?:\.\d+)?)(.*)$/.exec(text);
    if (!m) return null;
    var digits = m[3].replace(/,/g, '');
    var dp = (digits.split('.')[1] || '').length;
    return {
      lead: m[1], prefix: m[2], value: parseFloat(digits), dp: dp, rest: m[4],
      format: new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: m[3].indexOf(',') >= 0 })
    };
  }

  // A number that counts gets its own span, held at its final width so nothing beside it moves.
  // The width is in em, so it follows the font when the viewport resizes the type.
  function countable(host) {
    var tn = host.firstChild;
    if (!tn || tn.nodeType !== 3) return null;
    var fig = parseFigure(tn.nodeValue);
    if (!fig) return null;
    var span = document.createElement('span');
    span.className = 'num';
    span.textContent = fig.prefix + fig.format.format(fig.value);
    host.insertBefore(span, tn);
    tn.nodeValue = fig.rest;
    var px = parseFloat(getComputedStyle(span).fontSize);
    span.style.minWidth = (span.getBoundingClientRect().width / px).toFixed(3) + 'em';
    return {
      span: span, prefix: fig.prefix, end: fig.value, dp: fig.dp,
      show: function (v) { span.textContent = fig.prefix + fig.format.format(v); }
    };
  }
  var statNums = $$('.stat .big').map(countable);
  var spendNum = $('.tile .vbig') ? countable($('.tile .vbig')) : null;

  var nav = $('.nav');
  var pill = document.createElement('span');
  pill.className = 'nav-pill';
  pill.setAttribute('aria-hidden', 'true');
  if (nav) nav.insertBefore(pill, nav.firstChild);

  var scene = $('.scene');
  var req = document.createElement('i');
  req.className = 'req';
  req.setAttribute('aria-hidden', 'true');
  // In the hero, not the tilted scene: the flight is worked out in screen space, so it lands
  // on the row's dot however the scene leans.
  var heroBox = $('.hero');
  if (heroBox) heroBox.appendChild(req);
  // The hero's glow, as an element motion can move; CSS shows it only while motion is on.
  var glow = document.createElement('div');
  glow.className = 'hero-glow';
  glow.setAttribute('aria-hidden', 'true');
  if (heroBox) heroBox.insertBefore(glow, heroBox.firstChild);

  var brandImg = $('.brand img');
  var brand = makeMark('mark');
  var endWrap = $('.end .wrap');
  var endBox = document.createElement('div');
  endBox.className = 'end-mark';
  endBox.setAttribute('aria-hidden', 'true');
  var endMark = makeMark('');
  endBox.appendChild(endMark.svg);

  /* ------------------------------------------------------------------------------------------
   * The moving page, set up only while reduced motion is not asked for. matchMedia reverts every
   * tween made here if that changes; the cleanup disconnects the observers and puts the DOM back.
   * ---------------------------------------------------------------------------------------- */
  var mm = gsap.matchMedia();
  mm.add({
    motion: '(prefers-reduced-motion: no-preference)',
    fine: '(hover: hover) and (pointer: fine)'
  }, function (ctx) {
    if (!ctx.conditions.motion) { root.classList.remove('motion'); return; }
    var fine = ctx.conditions.fine;
    var ac = new AbortController();
    var on = { signal: ac.signal };
    var vh = window.innerHeight;
    var OK = okColor();
    // The green differs between the dark and light schemes; follow a switch mid-visit.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { OK = okColor(); }, on);

    root.classList.add('motion');
    if (brandImg && brandImg.isConnected) brandImg.replaceWith(brand.svg);
    if (endWrap && !endBox.isConnected) endWrap.insertBefore(endBox, endWrap.firstChild);

    // Writes to the DOM that matchMedia cannot revert by itself (text, order, classes); the
    // cleanup runs every one, so turning on reduced motion mid-visit leaves the page as written.
    var restores = [];

    var observers = [];
    function observe(targets, opts, cb) {
      var io = new IntersectionObserver(cb, opts);
      [].concat(targets).forEach(function (t) { if (t) io.observe(t); });
      observers.push(io);
      return io;
    }
    // "Seen" means the element's top has crossed `line` of the way down the screen, or the element
    // is above the screen. The root reaches 100000px above the viewport so that a jump straight
    // past an element (a #faq link) still counts it as seen: IntersectionObserver never reports an
    // element that was below the screen in one frame and above it in the next.
    function seenMargin(line) { return '100000px 0px -' + Math.round((1 - line) * 100) + '% 0px'; }
    function byPage(a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; }

    // Run `play` when `el` first scrolls into view. Only something below the screen is hidden
    // first: an element already on screen, or above it, is left exactly as it is, because hiding
    // what the reader can already see would be a flash.
    function whenSeen(target, play, hide, undo) {
      if (undo) restores.push(undo);
      if (!target || target.getBoundingClientRect().top <= vh) return;
      if (hide) hide();
      var io = observe(target, { rootMargin: seenMargin(0.86) }, function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        play();
      });
    }
    function reveal(targets, y) {
      targets = targets.filter(function (t) { return t.getBoundingClientRect().top > vh; });
      if (!targets.length) return;
      gsap.set(targets, { opacity: 0, y: y });
      var io = observe(targets, { rootMargin: seenMargin(0.9) }, function (entries) {
        var batch = entries.filter(function (e) { return e.isIntersecting; }).map(function (e) { return e.target; });
        if (!batch.length) return;
        batch.forEach(function (t) { io.unobserve(t); });
        gsap.to(batch.sort(byPage), {
          opacity: 1, y: 0, duration: 0.75, ease: 'power3.out', stagger: 0.09, overwrite: true,
          clearProps: 'transform,opacity'
        });
      });
    }
    // Calls `fn(true)` while any part of `el` is on screen and `fn(false)` once it is not.
    function whileOnScreen(target, fn, margin) {
      if (!target) return;
      observe(target, { rootMargin: margin || '0px' }, function (entries) { fn(entries[entries.length - 1].isIntersecting); });
    }
    function countTo(n, duration, delay) {
      var o = { v: 0 };
      return gsap.to(o, {
        v: n.end, duration: duration, delay: delay || 0, ease: 'power3.out',
        onUpdate: function () { n.show(o.v); }
      });
    }

    // The hero's entrance is CSS (index.html, "rise"), so it starts at first paint and never waits
    // for these scripts.

    /* --- The marks -------------------------------------------------------------------------- */
    gsap.fromTo(brand.state, { f: 0 }, {
      f: function (i) { return HOME[i]; }, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.2,
      onUpdate: brand.paint
    });
    var brandLink = $('.brand');
    if (brandLink && fine) {
      brandLink.addEventListener('pointerenter', function () {
        gsap.to(brand.state, {
          f: function () { return gsap.utils.random(0.08, 1); }, duration: 0.55, ease: 'power2.inOut',
          stagger: 0.03, overwrite: true, onUpdate: brand.paint
        });
      }, on);
      brandLink.addEventListener('pointerleave', function () {
        gsap.to(brand.state, {
          f: function (i) { return HOME[i]; }, duration: 0.6, ease: 'power3.out', stagger: 0.03,
          overwrite: true, onUpdate: brand.paint
        });
      }, on);
    }

    // Loops that run on their own (the hero's requests, the closing mark) get a budget of ticks.
    // Spent, they stop, so a tab left open costs nothing; pointer activity over their section, or
    // scrolling back to it, refills it.
    var LOOP_BUDGET = 12;

    // The closing mark keeps working while the install box is on screen: a request lands on the
    // hub, and one or two accounts' quota moves.
    endMark.state.forEach(function (s, i) { s.f = HOME[i]; });
    endMark.paint();
    var endSection = $('.end');
    var endTimer = null, endBudget = 0, endVisible = false;
    function endTick() {
      endTimer = null;
      if (endBudget-- <= 0) return;
      gsap.fromTo(endMark.hub, { attr: { r: 3.4 } }, { attr: { r: 2.3 }, duration: 0.6, ease: 'power2.out' });
      var picks = gsap.utils.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, gsap.utils.random(1, 2, 1));
      picks.forEach(function (i) {
        var s = endMark.state[i];
        var next = s.f < 0.25 ? gsap.utils.random(0.6, 1) : gsap.utils.clamp(0.06, 1, s.f + gsap.utils.random(-0.35, 0.2));
        gsap.to(s, { f: next, duration: 0.8, ease: 'power2.inOut', onUpdate: endMark.paint });
      });
      endTimer = gsap.delayedCall(gsap.utils.random(0.9, 1.6), endTick);
    }
    function endWake() {
      endBudget = LOOP_BUDGET;
      if (endVisible && !endTimer) endTimer = gsap.delayedCall(0.4, endTick);
    }
    whileOnScreen($('.end .cmd-box'), function (visible) {
      endVisible = visible;
      if (endSection) endSection.classList.toggle('live', visible);
      if (endTimer) { endTimer.kill(); endTimer = null; }
      if (visible) endWake();
    }, '0px 0px -8% 0px');
    if (endSection) endSection.addEventListener('pointermove', function () { if (endBudget < 3) endWake(); }, on);
    restores.push(function () { if (endSection) endSection.classList.remove('live'); });

    /* --- Header: scroll progress and the section you are in --------------------------------- */
    var progress = $('.progress');
    var progressQueued = false;
    function paintProgress() {
      progressQueued = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0).toFixed(4) + ')';
    }
    function queueProgress() {
      if (progressQueued) return;
      progressQueued = true;
      requestAnimationFrame(paintProgress);
    }
    if (progress) {
      window.addEventListener('scroll', queueProgress, { passive: true, signal: ac.signal });
      window.addEventListener('resize', queueProgress, on);
      paintProgress();
      restores.push(function () { progress.style.transform = ''; });
    }
    var links = nav ? $$('a', nav) : [];
    var current = null;
    function point(a) {
      current = a;
      links.forEach(function (l) { l.classList.toggle('on', l === a); });
      if (!a) { gsap.to(pill, { autoAlpha: 0, duration: 0.25, overwrite: 'auto' }); return; }
      var place = { x: a.offsetLeft, y: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight };
      if (gsap.getProperty(pill, 'opacity') < 0.05) gsap.set(pill, place);
      gsap.to(pill, Object.assign({ autoAlpha: 1, duration: 0.45, ease: 'power3.out', overwrite: 'auto' }, place));
    }
    // A resize moves the links; put the pill back under the current one.
    window.addEventListener('resize', function () { if (current) point(current); }, on);
    restores.push(function () { links.forEach(function (l) { l.classList.remove('on'); }); });
    // The section in view is the one crossing a line 45% of the way down the screen.
    var sectionOf = new Map();
    links.forEach(function (a) {
      var section = document.querySelector(a.getAttribute('href'));
      if (section) sectionOf.set(section, a);
    });
    var crossing = new Set();
    observe(Array.from(sectionOf.keys()), { rootMargin: '-45% 0px -54% 0px' }, function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) crossing.add(e.target);
        else crossing.delete(e.target);
      });
      var a = links.filter(function (l) {
        return Array.from(crossing).some(function (s) { return sectionOf.get(s) === l; });
      })[0] || null;
      if (a !== current) point(a);
    });

    /* --- Hero: the panel at work -----------------------------------------------------------
     * Every second or two a request leaves the tcr item in the menu bar and lands on an account
     * with quota left; that row lights and its five-hour bar moves. The account near its limit and
     * the two out of tokens are never picked. When every ready account has taken its share, the
     * bars ease back, as at a new window.
     * -------------------------------------------------------------------------------------- */
    var panel = $('.panel');
    var stamp = panel ? $('.p-head .t', panel) : null;
    var stampText = stamp ? stamp.textContent : '';
    var mbItem = scene ? $('.mb-item', scene) : null;
    var accounts = panel ? $$('.p-row', panel).filter(function (r) {
      return !r.classList.contains('near') && !r.classList.contains('out') && $('.bar', r);
    }).map(function (r) {
      var bar = $('.bar', r);
      var home = parseFloat(bar.style.getPropertyValue('--u'));
      return { row: r, bar: bar, pc: $('.pc', r), dot: $('.dot', r), home: home, u: home };
    }) : [];
    var heroTimer = null, clock = null, since = 0, heroBudget = 0, heroVisible = false;

    function setUse(a, u, duration) {
      a.u = u;
      gsap.to(a.bar, { '--u': u, duration: duration, ease: 'power2.out', overwrite: 'auto' });
      a.pc.textContent = Math.round(u * 100) + '%';
    }
    function land(a) {
      setUse(a, a.u + 0.01, 0.5);
      gsap.fromTo(a.row, { backgroundColor: tint(OK, 0.18) }, { backgroundColor: tint(OK, 0), duration: 1.2, ease: 'power2.out', clearProps: 'backgroundColor' });
      gsap.fromTo(a.dot, { scale: 2 }, { scale: 1, duration: 0.55, ease: 'back.out(3)' });
      since = 0;
      if (stamp) stamp.textContent = 'updated 0s ago';
    }
    function send() {
      var open = accounts.filter(function (a) { return a.u < a.home + 0.055; });
      if (!open.length) {
        accounts.forEach(function (a) { setUse(a, a.home, 1.2); });
        return;
      }
      var a = open[Math.floor(Math.random() * open.length)];
      var box = heroBox.getBoundingClientRect();
      var from = mbItem.getBoundingClientRect();
      var to = a.dot.getBoundingClientRect();
      var x0 = from.left + 10 - box.left, y0 = from.bottom - box.top;
      var x1 = to.left + to.width / 2 - box.left, y1 = to.top + to.height / 2 - box.top;
      gsap.timeline()
        .set(req, { x: x0, y: y0, autoAlpha: 1, scale: 0.6 })
        .to(req, { x: x1, duration: 0.6, ease: 'power1.inOut' }, 0)
        .to(req, { y: y1, scale: 1, duration: 0.6, ease: 'power2.in' }, 0)
        .add(function () { land(a); })
        .to(req, { autoAlpha: 0, scale: 2.2, duration: 0.3, ease: 'power2.out' });
    }
    function heroStop() {
      if (heroTimer) { heroTimer.kill(); heroTimer = null; }
      if (clock) { clock.kill(); clock = null; }
    }
    function loop() {
      heroTimer = null;
      if (heroBudget-- <= 0) { heroStop(); return; } // the "updated" clock stops with it
      send();
      heroTimer = gsap.delayedCall(gsap.utils.random(1.3, 2.4), loop);
    }
    function heroLive(first) {
      heroBudget = LOOP_BUDGET;
      if (!heroVisible || heroTimer || !accounts.length || !mbItem) return;
      heroTimer = gsap.delayedCall(first ? 1.2 : 0.3, loop);
      if (!clock) clock = gsap.delayedCall(1, function tickClock() {
        since += 1;
        if (stamp) stamp.textContent = 'updated ' + since + 's ago';
        clock = gsap.delayedCall(1, tickClock);
      });
    }
    var heroSeen = false;
    whileOnScreen(heroBox, function (visible) {
      heroVisible = visible;
      if (!visible) { heroStop(); return; }
      heroLive(!heroSeen);
      heroSeen = true;
    });
    if (heroBox) {
      ['pointermove', 'pointerdown'].forEach(function (type) {
        heroBox.addEventListener(type, function () { if (heroBudget < 3) heroLive(false); }, on);
      });
    }

    /* --- Pointer: the hero scene leans toward it, buttons pull toward it, cards light under it - */
    if (fine) {
      var hero = $('.hero');
      gsap.set(scene, { transformPerspective: 1100 });
      var leanX = gsap.quickTo(scene, 'rotationX', { duration: 0.9, ease: 'power3' });
      var leanY = gsap.quickTo(scene, 'rotationY', { duration: 0.9, ease: 'power3' });
      // The glow is its own element moved by transform; a CSS variable on .hero would restyle the
      // whole hero on every pointer frame. The panel moves by `translate`, because its CSS
      // entrance animation owns its `transform`.
      var drift = { px: 0, py: 0 };
      function paintDrift() {
        if (panel) panel.style.translate = drift.px.toFixed(2) + 'px ' + drift.py.toFixed(2) + 'px';
      }
      var to = {
        gx: gsap.quickTo(glow, 'x', { duration: 1.4, ease: 'power3' }),
        gy: gsap.quickTo(glow, 'y', { duration: 1.4, ease: 'power3' }),
        px: gsap.quickTo(drift, 'px', { duration: 0.9, ease: 'power3', onUpdate: paintDrift }),
        py: gsap.quickTo(drift, 'py', { duration: 0.9, ease: 'power3', onUpdate: paintDrift })
      };
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        var nx = (e.clientX - r.left) / r.width - 0.5;
        var ny = (e.clientY - r.top) / r.height - 0.5;
        leanY(nx * 7);
        leanX(-ny * 5);
        to.gx(nx * 120); to.gy(ny * 90);
        to.px(nx * 10); to.py(ny * 8);
      }, on);
      hero.addEventListener('pointerleave', function () {
        leanX(0); leanY(0);
        to.gx(0); to.gy(0); to.px(0); to.py(0);
      }, on);

      var pull = gsap.utils.clamp(-6, 6);
      $$('.hero .cta-row .btn, .end .cta-row .btn').forEach(function (b) {
        var bx = gsap.quickTo(b, 'x', { duration: 0.5, ease: 'power3' });
        var by = gsap.quickTo(b, 'y', { duration: 0.5, ease: 'power3' });
        b.addEventListener('pointermove', function (e) {
          var r = b.getBoundingClientRect();
          bx(pull((e.clientX - r.left - r.width / 2) * 0.18));
          by(pull((e.clientY - r.top - r.height / 2) * 0.3));
        }, on);
        b.addEventListener('pointerleave', function () { bx(0); by(0); }, on);
      });

      $$('.step, .stat, .tile, .chart').forEach(function (card) {
        card.addEventListener('pointermove', function (e) {
          var r = card.getBoundingClientRect();
          card.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
          card.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
        }, on);
      });
    }

    /* --- Section heads and lists come in as they are reached -------------------------------- */
    reveal($$('.sec-head > *'), 18);
    reveal($$('.step'), 26);
    reveal($$('.stat'), 26);
    reveal($$('.math, .term, .tablewrap, .note, .fit, .perf > h3, .perf-lead'), 20);
    reveal($$('.tile'), 30);
    reveal($$('.chart'), 26);
    reveal($$('.faq details'), 12);
    reveal($$('.end .wrap > *'), 18);

    /* --- Steps: the badge lands, then the commands type themselves --------------------------- */
    $$('.step').forEach(function (step) {
      var lines = $$('.code .ln', step);
      whenSeen(step, function () {
        var tl = gsap.timeline({ delay: 0.15 });
        tl.from($('.num', step), { scale: 0.5, opacity: 0, duration: 0.5, ease: 'back.out(2.2)' });
        lines.forEach(function (ln) {
          var n = Math.max(4, ln.textContent.length);
          tl.to(ln, { clipPath: 'inset(0 0% 0 0)', duration: n * 0.026, ease: 'steps(' + n + ')', clearProps: 'clipPath' }, '>-0.05');
        });
      }, function () { gsap.set(lines, { clipPath: 'inset(0 100% 0 0)' }); });
    });

    /* --- The terminal dashboard paints top to bottom, the way a TUI redraws ------------------- */
    var termLines = $$('.term .tl');
    whenSeen($('.term'), function () {
      gsap.to(termLines, { opacity: 1, duration: 0.12, stagger: 0.03, ease: 'none', delay: 0.25, clearProps: 'opacity,visibility' });
    }, function () { gsap.set(termLines, { opacity: 0 }); });

    /* --- Cache: the numbers count up; the price bars run at one speed, so the cold ones take longest */
    $$('.stat').forEach(function (stat, i) {
      var n = statNums[i];
      if (!n || n.end < 2) return; // "1 hour" has nothing to count
      whenSeen(stat, function () { countTo(n, 1.6, 0.2); }, function () { n.show(0); }, function () { n.show(n.end); });
    });
    var bars = $$('.math-row .track span');
    whenSeen($('.math'), function () {
      bars.forEach(function (b) {
        var w = parseFloat(b.style.getPropertyValue('--w')) / 100;
        gsap.to(b, { scaleX: 1, duration: 0.2 + 1.6 * w, ease: 'none', delay: 0.3, clearProps: 'transform' });
      });
    }, function () { gsap.set(bars, { scaleX: 0, transformOrigin: '0 50%' }); });

    /* --- Why tcr: each tile acts out its own sentence, when reached and again under the pointer */
    var tiles = $$('#why .tile');
    var acts = [];

    // 1. Chooses by quota: the accounts sort by the soonest reset, and the first is picked.
    (function (tile) {
      if (!tile) return;
      var viz = $('.viz', tile);
      var rows = $$('.vr', viz);
      if (rows.length !== 3) return;
      var busy = false;
      function arrange(order) { order.forEach(function (i) { viz.appendChild(rows[i]); }); }
      function sortNow() {
        var state = Flip.getState(rows);
        arrange([0, 1, 2]);
        Flip.from(state, {
          duration: 0.7, ease: 'power3.inOut', stagger: 0.04,
          onComplete: function () { rows[0].classList.add('pick'); busy = false; }
        });
      }
      acts[0] = function () {
        if (busy) return;
        busy = true;
        rows[0].classList.remove('pick');
        var state = Flip.getState(rows);
        arrange([2, 0, 1]);
        Flip.from(state, { duration: 0.45, ease: 'power2.inOut', onComplete: function () { gsap.delayedCall(0.25, sortNow); } });
      };
      whenSeen(tile, function () { busy = true; gsap.delayedCall(0.5, sortNow); }, function () {
        rows[0].classList.remove('pick');
        arrange([2, 0, 1]);
      }, function () {
        arrange([0, 1, 2]);
        rows[0].classList.add('pick');
      });
    })(tiles[0]);

    // 2. One proxy for every session: a request reaches each session's own account in turn.
    (function (tile) {
      if (!tile) return;
      var rows = $$('.vr', tile);
      acts[1] = function () {
        var tl = gsap.timeline();
        rows.forEach(function (r, i) {
          // immediateRender false: each row lights at its own turn, not all three at once.
          tl.fromTo(r, { boxShadow: 'inset 0 0 0 1.5px ' + tint(OK, 0.95) }, { boxShadow: 'inset 0 0 0 1.5px ' + tint(OK, 0), duration: 0.9, ease: 'power2.out', immediateRender: false, clearProps: 'boxShadow' }, i * 0.22);
          tl.fromTo($('.arr', r), { x: -4 }, { x: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, i * 0.22);
        });
      };
      whenSeen(tile, function () { gsap.delayedCall(0.5, acts[1]); });
    })(tiles[1]);

    // 3. Claude Code and Codex: the three clients light up behind the one proxy.
    (function (tile) {
      if (!tile) return;
      var names = $$('.vr b', tile);
      var pools = $$('.prov > div', tile);
      var lit = null;
      acts[2] = function () {
        if (lit && lit.isActive()) return; // a second hover mid-way would stack the colours
        lit = gsap.timeline()
          .fromTo(pools, { y: 6, opacity: 0.4 }, { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.12, clearProps: 'transform,opacity,visibility' })
          .to(names, { color: OK, duration: 0.2, stagger: 0.15, yoyo: true, repeat: 1, clearProps: 'color' }, 0.2);
      };
      whenSeen(tile, function () { gsap.delayedCall(0.5, acts[2]); });
    })(tiles[2]);

    // 4. See what it would have cost: the list-price figure counts up.
    (function (tile) {
      if (!tile || !spendNum) return;
      var counting = null;
      // One count at a time: sweeping the pointer across the tiles must not keep restarting it.
      acts[3] = function () {
        if (counting && counting.isActive()) return;
        counting = countTo(spendNum, 1.3, 0);
      };
      whenSeen(tile, function () { countTo(spendNum, 1.4, 0.4); }, function () { spendNum.show(0); }, function () { spendNum.show(spendNum.end); });
    })(tiles[3]);

    // 5. Lend to another Mac: the six digits settle, match on both screens, and the Macs agree.
    (function (tile) {
      if (!tile) return;
      var code = $('.code6', tile);
      var macs = $$('.mac', tile);
      if (!code) return;
      var target = code.textContent;
      var running = false;
      acts[4] = function () {
        if (running) return;
        running = true;
        code.classList.remove('match');
        var o = { p: 0 }, frame = 0;
        gsap.to(o, {
          p: 1, duration: 1, ease: 'none',
          onUpdate: function () {
            if (frame++ % 3) return;
            var settled = Math.floor(o.p * target.length);
            code.textContent = target.split('').map(function (ch, i) {
              return ch === ' ' || i < settled ? ch : String(Math.floor(Math.random() * 10));
            }).join('');
          },
          onComplete: function () {
            code.textContent = target;
            code.classList.add('match');
            gsap.fromTo(macs, { y: 0 }, { y: -4, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, stagger: 0.08 });
            gsap.delayedCall(1.4, function () { code.classList.remove('match'); running = false; });
          }
        });
      };
      whenSeen(tile, function () { gsap.delayedCall(0.45, acts[4]); }, null, function () {
        code.textContent = target;
        code.classList.remove('match');
      });
    })(tiles[4]);

    // 6. Stays on your machine: the lock, open, swings shut and the count of endpoints goes green.
    (function (tile) {
      if (!tile) return;
      var shackle = $('.files span:first-child svg path', tile);
      var zero = $('.files .muted', tile);
      if (!shackle) return;
      var open = { y: -5, rotation: -28, svgOrigin: '16 11' }; // pivot on the right leg
      acts[5] = function () {
        gsap.timeline({ delay: 0.1 })
          .fromTo(shackle, open, { y: 0, rotation: 0, svgOrigin: '16 11', duration: 0.55, ease: 'back.out(2.6)' })
          .fromTo(zero, { color: OK }, { color: '', duration: 1.2, ease: 'power1.in', immediateRender: false }, 0.45);
      };
      whenSeen(tile, function () { gsap.delayedCall(0.5, acts[5]); }, function () { gsap.set(shackle, open); });
    })(tiles[5]);

    if (fine) {
      tiles.forEach(function (tile, i) {
        if (acts[i]) tile.addEventListener('pointerenter', acts[i], on);
      });
    }

    /* --- Comparison table rows arrive one after another ------------------------------------- */
    var trs = $$('tbody tr');
    whenSeen($('.tablewrap'), function () {
      gsap.to(trs, { opacity: 1, duration: 0.4, stagger: 0.06, ease: 'power1.out', delay: 0.2, clearProps: 'opacity,visibility' });
    }, function () { gsap.set(trs, { opacity: 0 }); });

    /* --- FAQ answers open and close at their own height -------------------------------------- */
    $$('.faq details').forEach(function (d) {
      var summary = $('summary', d);
      var answer = $('.a', d);
      if (!summary || !answer) return;
      summary.addEventListener('click', function (e) {
        e.preventDefault();
        if (d.open && !d.classList.contains('closing')) {
          d.classList.add('closing');
          gsap.to(answer, {
            height: 0, autoAlpha: 0, duration: 0.26, ease: 'power2.in', overwrite: true,
            onStart: function () { answer.style.overflow = 'hidden'; },
            onComplete: function () {
              d.open = false;
              d.classList.remove('closing');
              gsap.set(answer, { clearProps: 'height,opacity,visibility,overflow' });
            }
          });
        } else {
          var wasClosing = d.classList.contains('closing');
          d.classList.remove('closing');
          d.open = true;
          answer.style.overflow = 'hidden';
          var grow = { height: 'auto', autoAlpha: 1, duration: 0.42, ease: 'power3.out', overwrite: true, clearProps: 'height,opacity,visibility,overflow' };
          // Clicked again while closing: turn round from where it is, never snap back to 0.
          if (wasClosing) gsap.to(answer, grow);
          else gsap.fromTo(answer, { height: 0, autoAlpha: 0 }, grow);
        }
      }, on);
    });

    return function () {
      ac.abort();
      restores.forEach(function (undo) { undo(); });
      observers.forEach(function (io) { io.disconnect(); });
      heroVisible = false;
      heroStop();
      if (endTimer) endTimer.kill();
      root.classList.remove('motion');
      if (brand.svg.isConnected && brandImg) brand.svg.replaceWith(brandImg);
      if (endBox.isConnected) endBox.remove();
      if (stamp) stamp.textContent = stampText;
      accounts.forEach(function (a) {
        a.u = a.home;
        a.bar.style.setProperty('--u', a.home);
        a.pc.textContent = Math.round(a.home * 100) + '%';
      });
      if (panel) panel.style.translate = '';
    };
  });

  /* ------------------------------------------------------------------------------------------
   * The performance charts, redrawn by d3 from the figures already in the page, so the text rows
   * stay the one source. d3 is fetched when the section is within 900px of the viewport.
   *
   * Each chart is laid out at its drawn size before d3 arrives, with its text rows showing, so
   * drawing it moves nothing below it: a link to #faq that scrolls past the charts while d3
   * loads still lands on #faq.
   *
   * The race: every bar grows at the same speed, so each one takes as long as its value is large
   * and tcr's finishes first. Pointing at a bar (or tapping it) says how it compares with tcr.
   * ---------------------------------------------------------------------------------------- */
  function charts() {
    var section = $('#performance');
    if (!section || !('IntersectionObserver' in window)) return;
    var prepared = $$('.chart').map(prepareChart).filter(Boolean);
    if (!prepared.length) return;
    // Reserving that space can run after the browser has already scrolled to a link's #target.
    // A target below the charts has then moved down, so put the reader back on it.
    var target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (target && (section.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    var near = new IntersectionObserver(function (entries) {
      if (!entries.some(function (e) { return e.isIntersecting; })) return;
      near.disconnect();
      var s = document.createElement('script');
      s.src = 'vendor/d3.min.js';
      // No ScrollTrigger.refresh() here: the charts already hold their drawn height, so nothing
      // below them moves, and a refresh restores the scroll position, which cancels a smooth
      // scroll in flight (a click on "FAQ" stopped dead at the charts).
      s.onload = function () { prepared.forEach(function (c) { c.draw(); }); };
      s.onerror = function () {
        console.warn('tcr site: d3 did not load, so the charts stay as text rows');
        prepared.forEach(function (c) { c.undo(); });
      };
      document.head.appendChild(s);
    }, { rootMargin: '900px 0px' });
    near.observe(section);
  }

  function readChart(fig) {
    return $$('.crow', fig).map(function (row) {
      var text = $('.cv', row).textContent.trim();
      var fig = parseFigure(text); // the same reading the counters use
      return {
        name: $('.cn', row).textContent.trim(),
        v: fig ? fig.value : NaN,
        dp: fig ? fig.dp : 0,
        unit: fig ? fig.rest.trim() : '',
        text: text,
        us: row.classList.contains('us')
      };
    });
  }


  function prepareChart(fig) {
    var data = readChart(fig);
    if (!data.length || data.some(function (d) { return !isFinite(d.v); })) {
      console.warn('tcr site: could not read the figures of a chart, so it stays as text rows', fig);
      return null;
    }
    var animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hover = window.matchMedia('(hover: hover)').matches;
    var hint = hover ? 'Point at a bar to compare it with tcr' : 'Tap a bar to compare it with tcr';

    // The title and its qualifier become one flex item, so the replay button pins to the right
    // and a narrow chart wraps the title instead of splitting it into columns.
    var cap = $('figcaption', fig);
    if (cap && !$('.cap-t', cap)) {
      var title = document.createElement('span');
      title.className = 'cap-t';
      while (cap.firstChild) title.appendChild(cap.firstChild);
      cap.appendChild(title);
    }
    var host = document.createElement('div');
    host.className = 'd3c';
    host.style.height = (TOP + data.length * ROW + AXIS) + 'px';
    var note = document.createElement('p');
    note.className = 'cmp';
    note.setAttribute('aria-hidden', 'true');
    note.textContent = hint;
    var replay = null;
    if (animate && cap) {
      replay = document.createElement('button');
      replay.type = 'button';
      replay.className = 'replay';
      replay.setAttribute('aria-label', 'Replay the chart: ' + (cap ? cap.textContent.trim().replace(/\s+/g, ' ') : 'performance'));
      replay.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>';
    }

    // Measure the drawn layout once, then keep the text rows on show in a box of that height.
    function mount() {
      fig.appendChild(host);
      fig.appendChild(note);
      if (replay) fig.appendChild(replay);
      fig.classList.add('drawn');
    }
    function unmount() {
      fig.classList.remove('drawn');
      host.remove();
      note.remove();
      if (replay) replay.remove();
    }
    mount();
    var drawnHeight = fig.offsetHeight;
    unmount();
    fig.style.minHeight = drawnHeight + 'px';

    return {
      draw: function () {
        mount();
        fig.style.minHeight = '';
        drawChart(fig, data, host, note, replay, hint, animate);
      },
      undo: function () { fig.style.minHeight = ''; }
    };
  }

  function drawChart(fig, data, host, note, replay, hint, animate) {
    var d3 = window.d3;
    var us = data.filter(function (d) { return d.us; })[0];
    var unit = data[0].unit;
    var fmt = function (v, d) { return v.toFixed(d.dp) + ' ' + d.unit; };
    var view = null;
    var picked = null;

    function show(d) {
      picked = d;
      if (!view) return;
      view.rows.classed('dim', function (o) { return d !== null && o !== d; });
      if (d) note.innerHTML = compare(d);
      else note.textContent = hint;
    }

    function render(width) {
      host.textContent = '';
      var labelW = 96, valW = 70, gap = 12;
      var x0 = labelW + gap, x1 = Math.max(x0 + 40, width - valW - gap);
      var x = d3.scaleLinear().domain([0, d3.max(data, function (d) { return d.v; })]).range([x0, x1]).nice();
      var H = TOP + data.length * ROW + AXIS;
      var svg = d3.select(host).append('svg').attr('width', width).attr('height', H).attr('aria-hidden', 'true');
      var y = function (i) { return TOP + i * ROW + ROW / 2; };

      svg.append('g').selectAll('rect').data(data).join('rect')
        .attr('class', 'trk').attr('x', x0).attr('y', function (d, i) { return y(i) - 5; })
        .attr('width', x1 - x0).attr('height', 10).attr('rx', 5);

      // Fewer ticks on a narrow track, so the labels never touch.
      var ticks = x.ticks(x1 - x0 < 240 ? 2 : 4);
      svg.append('g').selectAll('line').data(ticks).join('line')
        .attr('class', 'grid').attr('x1', x).attr('x2', x).attr('y1', TOP).attr('y2', TOP + data.length * ROW);
      svg.append('g').selectAll('text').data(ticks).join('text')
        .attr('class', 'tick').attr('x', x).attr('y', H - 5).attr('text-anchor', 'middle')
        .text(function (t, i) { return i === ticks.length - 1 ? t + ' ' + unit : t; });

      var rows = svg.append('g').selectAll('g').data(data).join('g')
        .attr('class', function (d) { return 'r' + (d.us ? ' us' : ''); });
      rows.append('text').attr('class', 'nm').attr('x', 0).attr('y', function (d, i) { return y(i); }).attr('dy', '.35em')
        .text(function (d) { return d.name; });
      var bar = rows.append('rect').attr('class', 'bar').attr('x', x0)
        .attr('y', function (d, i) { return y(i) - 5; }).attr('height', 10).attr('rx', 5)
        .attr('width', function (d) { return Math.max(5, x(d.v) - x0); });
      var val = rows.append('text').attr('class', 'val').attr('x', width).attr('y', function (d, i) { return y(i); })
        .attr('dy', '.35em').attr('text-anchor', 'end').text(function (d) { return fmt(d.v, d); });
      // A mouse shows the comparison while it points; a finger or pen toggles it with a tap,
      // because a touch ends with pointerleave straight after the tap.
      rows.append('rect').attr('class', 'hit').attr('x', 0).attr('y', function (d, i) { return y(i) - ROW / 2; })
        .attr('width', width).attr('height', ROW)
        .on('pointerenter', function (e, d) { if (e.pointerType === 'mouse') show(d); })
        .on('pointerleave', function (e) { if (e.pointerType === 'mouse') show(null); })
        .on('click', function (e, d) { if (e.pointerType !== 'mouse') show(picked === d ? null : d); });

      view = { x: x, x0: x0, x1: x1, bar: bar, val: val, rows: rows };
      show(picked);
    }

    // The page asks for the latency figures to be read as an order rather than an exact number,
    // so that chart says "about"; the CPU and memory charts give the ratio itself.
    function compare(d) {
      if (!us || d === us) return '<b>tcr</b>: ' + d.text + ', the lowest here';
      var times = d.v / us.v;
      if (d.unit === 'ms') {
        var p = Math.pow(10, Math.floor(Math.log10(times)));
        return '<b>' + d.name + '</b>: ' + d.text + ', about ' + Math.round(times / p) * p + '× tcr';
      }
      var t = times < 10 ? times.toFixed(1) : String(Math.round(times));
      return '<b>' + d.name + '</b>: ' + d.text + ', ' + t + '× tcr';
    }

    function race() {
      if (!view) return;
      var v = view, speed = (v.x1 - v.x0) / 1.7; // px per second: the full track in 1.7 s
      var dur = function (d) { return Math.max(160, ((v.x(d.v) - v.x0) / speed) * 1000); };
      v.bar.interrupt().attr('width', 0)
        .transition().duration(dur).ease(d3.easeLinear)
        .attr('width', function (d) { return Math.max(5, v.x(d.v) - v.x0); });
      v.val.interrupt().text(function (d) { return fmt(0, d); })
        .transition().duration(dur).ease(d3.easeLinear)
        .tween('text', function (d) {
          var node = this, i = d3.interpolateNumber(0, d.v);
          return function (t) { node.textContent = fmt(i(t), d); };
        });
    }

    var width = host.clientWidth;
    render(width);
    new ResizeObserver(function () {
      var w = host.clientWidth;
      if (Math.abs(w - width) < 1) return;
      width = w;
      render(w);
    }).observe(host);

    if (!animate) return;
    if (replay) {
      replay.addEventListener('click', function () {
        $('svg', replay).animate([{ rotate: '0deg' }, { rotate: '-360deg' }], { duration: 600, easing: 'cubic-bezier(.2,0,0,1)' });
        race();
      });
    }
    var seen = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      seen.disconnect();
      race();
    }, { threshold: 0.45 });
    seen.observe(fig);
  }
})();
