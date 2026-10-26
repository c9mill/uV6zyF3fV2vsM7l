/* Kinetic layer: inertial scroll, magnetic pointer, masked type and scroll depth.
 *
 * Everything here is additive. Without this file, with reduced motion, or on a
 * slow device the page is the same static and fully readable layout:
 *  - Text is never hidden by static CSS. The only pre-hidden state (the hero
 *    intro) is set by an inline <head> script that also clears it on a timer.
 *  - Only transform and opacity are animated (compositor-only).
 *  - One requestAnimationFrame loop runs only while something is moving and
 *    stops completely when the page is idle or hidden.
 *  - IntersectionObserver gates every scroll effect; off-screen work is zero.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const script = document.currentScript;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
  const weak = Boolean(connection.saveData || navigator.deviceMemory <= 2 || navigator.hardwareConcurrency <= 2);
  const EASE = 'cubic-bezier(.19,1,.22,1)';
  const releaseIntro = () => root.classList.remove('kx-intro');

  if (reduce.matches || !('IntersectionObserver' in window) || !Element.prototype.animate) {
    root.classList.remove('kx-text');
    releaseIntro();
    return;
  }
  root.classList.add('kx-on');
  if (weak) root.classList.add('kx-low');
  const low = () => root.classList.contains('kx-low');
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /* ---------- One shared, self-stopping frame loop ---------- */
  const tasks = new Set();
  let frame = 0;
  function tick(time) {
    frame = 0;
    for (const task of [...tasks]) {
      let keep = false;
      try { keep = task(time); } catch (error) { keep = false; }
      if (!keep) tasks.delete(task);
    }
    if (tasks.size && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function run(task) {
    tasks.add(task);
    if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && tasks.size && !frame) frame = requestAnimationFrame(tick);
  });

  /* ---------- Inertial smooth scrolling (Lenis, desktop wheel only) ---------- */
  // Touch keeps native momentum; nested scrollers keep their own wheel handling.
  const PREVENT = '.mobile-nav,.header-search-results,.table-scroll,.schedule-table-scroll,.navigation-detail,.navigation-tree,dialog,textarea,select,iframe,[data-lenis-prevent]';
  let lenis = null;
  let idleFrames = 0;
  function lenisTask(time) {
    if (!lenis) return false;
    lenis.raf(time);
    idleFrames = lenis.isScrolling ? 0 : idleFrames + 1;
    return idleFrames < 12;
  }
  const wakeLenis = () => { if (lenis) { idleFrames = 0; run(lenisTask); } };
  function startLenis() {
    if (lenis || !window.Lenis || low() || !fine.matches || reduce.matches) return;
    try {
      lenis = new window.Lenis({
        lerp: 0.105,
        wheelMultiplier: 1,
        smoothWheel: true,
        syncTouch: false,
        allowNestedScroll: true,
        prevent: node => Boolean(node && node.closest && node.closest(PREVENT)),
      });
    } catch (error) { lenis = null; return; }
    const scrollTo = lenis.scrollTo.bind(lenis);
    lenis.scrollTo = (...args) => { scrollTo(...args); wakeLenis(); };
    window.fkbadScroll = lenis;
    addEventListener('wheel', wakeLenis, { passive: true });
    // The menu locks the page: pause the inertia with it.
    let locked = root.classList.contains('menu-locked');
    new MutationObserver(() => {
      const now = root.classList.contains('menu-locked');
      if (now === locked || !lenis) return;
      locked = now;
      if (now) lenis.stop(); else { lenis.start(); wakeLenis(); }
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  function loadLenis() {
    if (!fine.matches || low()) return;
    if (window.Lenis) { startLenis(); return; }
    const tag = document.createElement('script');
    tag.src = script?.dataset.lenis || '/vendor/lenis.min.js';
    tag.async = true;
    tag.onload = startLenis;
    document.head.append(tag);
  }
  function stopLenis() {
    if (!lenis) return;
    try { lenis.destroy(); } catch (error) { /* already gone */ }
    lenis = null;
    if (window.fkbadScroll) window.fkbadScroll = undefined;
  }

  /* ---------- Masked word reveals ---------- */
  // Words slide up from behind a mask. Before arming and after finishing the
  // heading is plain, untouched text; the original nodes are restored afterwards.
  const SPLIT = '.section-heading h2,.page-heading h1,.student-feature h2,.future-copy h2';
  const INLINE = /^(A|ABBR|B|EM|I|SPAN|STRONG|SMALL|MARK|SUP|SUB|BR|TIME|Q)$/;
  const live = new Map(); // heading -> { original, animations, words }

  function splittable(heading) {
    if (heading.dataset.kxSplit || !heading.textContent.trim()) return false;
    for (const child of heading.children) if (!INLINE.test(child.tagName)) return false;
    const style = getComputedStyle(heading);
    return style.backgroundClip !== 'text' && style.webkitBackgroundClip !== 'text';
  }
  function split(heading) {
    const original = [...heading.childNodes];
    const fragment = document.createDocumentFragment();
    const words = [];
    const wrap = node => {
      const mask = document.createElement('span');
      const word = document.createElement('span');
      mask.className = 'kx-w';
      word.className = 'kx-wi';
      word.append(node);
      mask.append(word);
      fragment.append(mask);
      words.push(word);
    };
    for (const node of original) {
      if (node.nodeType === 3) {
        for (const part of node.data.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) fragment.append(document.createTextNode(part));
          else wrap(document.createTextNode(part));
        }
      } else if (node.nodeType === 1 && node.tagName !== 'BR') wrap(node);
      else fragment.append(node);
    }
    heading.replaceChildren(fragment);
    heading.dataset.kxSplit = 'on';
    // A single word wider than its line would be clipped by its mask: undo.
    const limit = heading.clientWidth + 1;
    if (words.some(word => word.parentNode.offsetWidth > limit)) {
      heading.replaceChildren(...original);
      heading.dataset.kxSplit = 'skip';
      return null;
    }
    const step = words.length > 8 ? 34 : 60;
    const animations = words.map((word, index) => word.animate(
      [{ transform: 'translate3d(0,118%,0)' }, { transform: 'translate3d(0,0,0)' }],
      { duration: 1050, delay: Math.min(index * step, 520), easing: EASE, fill: 'both' }));
    const record = { original, animations, armed: false };
    live.set(heading, record);
    Promise.all(animations.map(animation => animation.finished)).then(() => restore(heading), () => restore(heading));
    return record;
  }
  function restore(heading) {
    const record = live.get(heading);
    if (!record) return;
    live.delete(heading);
    armed.delete(heading);
    for (const animation of record.animations) animation.cancel();
    heading.replaceChildren(...record.original);
    heading.dataset.kxSplit = 'done';
  }
  function play(heading) {
    const record = live.get(heading);
    if (!record) return;
    armed.delete(heading);
    record.armed = false;
    for (const animation of record.animations) animation.play();
  }
  function finishAll() {
    for (const heading of [...live.keys()]) restore(heading);
  }

  const armed = new Set();
  const inView = element => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight * 0.94;
  };
  // Observer B: an armed (masked) heading plays once it is genuinely on screen.
  const playObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      playObserver.unobserve(entry.target);
      play(entry.target);
    }
  }, { rootMargin: '0px 0px -6% 0px' });
  // Observer A: split shortly before a heading arrives, so nothing visible pops.
  const armObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const heading = entry.target;
      armObserver.unobserve(heading);
      if (heading.closest('[hidden],details:not([open])') || !splittable(heading)) continue;
      const record = split(heading);
      if (!record) continue;
      if (inView(heading)) continue; // plays immediately (already running)
      for (const animation of record.animations) animation.pause();
      record.armed = true;
      armed.add(heading);
      playObserver.observe(heading);
      watch();
    }
  }, { rootMargin: '0px 0px 40% 0px' });
  // Watchdog: an armed heading can never stay masked while it is on screen,
  // even if an observer callback is skipped (fast jumps, layout changes).
  let watchTimer = 0;
  function watch() {
    if (watchTimer) return;
    watchTimer = setInterval(() => {
      for (const heading of armed) if (!heading.isConnected || inView(heading)) play(heading);
      if (!armed.size) { clearInterval(watchTimer); watchTimer = 0; }
    }, 900);
  }
  function registerSplit(scope, boot) {
    for (const heading of scope.querySelectorAll(SPLIT)) {
      // On boot, headings already on screen start now, in the same frame the
      // intro guard is lifted, so they never flash in their resting state.
      if (boot && inView(heading) && !heading.closest('[hidden],details:not([open])') && splittable(heading)) split(heading);
      else armObserver.observe(heading);
    }
  }

  /* ---------- Hero intro (pre-rendered masks, see kinetic.css) ---------- */
  function heroIntro() {
    // Two frames: the hidden first state is painted, then the transition runs.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      releaseIntro();
      setTimeout(() => root.classList.add('kx-intro-done'), 2200);
    }));
  }

  /* ---------- Media scale reveals ---------- */
  const mediaObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      mediaObserver.unobserve(entry.target);
      if (low() || inView(entry.target) && entry.boundingClientRect.top < innerHeight * 0.5) continue;
      const img = entry.target.querySelector('img');
      img?.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
        { duration: 1300, easing: EASE });
    }
  }, { rootMargin: '0px 0px -4% 0px' });
  function registerMedia(scope) {
    for (const media of scope.querySelectorAll('.news-card .news-image')) mediaObserver.observe(media);
  }

  /* ---------- Scroll depth (parallax / scale), visible elements only ---------- */
  const depthItems = new Map(); // ref -> [{ el, fn }]
  const visibleRefs = new Set();
  let depthQueued = false;
  const depthObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleRefs.add(entry.target);
      else visibleRefs.delete(entry.target);
    }
    queueDepth();
  }, { rootMargin: '15% 0px' });
  function addDepth(el, ref, fn) {
    if (!el || !ref) return;
    if (!depthItems.has(ref)) { depthItems.set(ref, []); depthObserver.observe(ref); }
    depthItems.get(ref).push({ el, fn });
  }
  function depthTask() {
    depthQueued = false;
    if (low()) return false;
    const vh = innerHeight;
    const reads = [];
    for (const ref of visibleRefs) reads.push([ref, ref.getBoundingClientRect()]);
    for (const [ref, rect] of reads) for (const item of depthItems.get(ref) || []) item.fn(item.el, rect, vh);
    return false;
  }
  function queueDepth() {
    if (depthQueued || !visibleRefs.size || low()) return;
    depthQueued = true;
    run(depthTask);
  }
  function initDepth() {
    if (low()) return;
    const hero = document.querySelector('.hero-centered');
    if (hero) {
      const background = hero.querySelector('.hero-background');
      const copy = hero.querySelector('.hero-copy');
      // Background drifts slower than the page; the headline lifts and softens away.
      addDepth(background, hero, (el, rect) => {
        const p = clamp(-rect.top / rect.height, 0, 1);
        el.style.transform = `translate3d(0,${(p * 6).toFixed(3)}%,0) scale(1.12)`;
      });
      addDepth(copy, hero, (el, rect) => {
        const p = clamp(-rect.top / rect.height, 0, 1);
        el.style.transform = p ? `translate3d(0,${(p * rect.height * 0.22).toFixed(1)}px,0)` : '';
        el.style.opacity = p > 0.02 ? (1 - p * 0.75).toFixed(3) : '';
      });
    }
    const banner = document.querySelector('.future-banner');
    if (banner) addDepth(banner, banner.parentElement, (el, rect, vh) => {
      const p = clamp((vh - rect.top) / (vh * 0.75), 0, 1);
      el.style.transform = p < 1 ? `scale(${(0.93 + p * 0.07).toFixed(4)})` : '';
    });
    const signature = document.querySelector('.footer-signature');
    if (signature) addDepth(signature, signature.parentElement, (el, rect, vh) => {
      const p = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
      el.style.transform = `translate3d(${((0.5 - p) * 14).toFixed(2)}%,0,0)`;
    });
    addEventListener('scroll', queueDepth, { passive: true });
    addEventListener('resize', queueDepth, { passive: true });
    queueDepth();
  }
  function clearDepth() {
    for (const items of depthItems.values()) for (const { el } of items) {
      el.style.removeProperty('transform');
      el.style.removeProperty('opacity');
    }
    depthObserver.disconnect();
    visibleRefs.clear();
  }

  /* ---------- Magnetic controls and fluid cards ---------- */
  const MAGNET = '.button,.icon-button,.back-top,.text-link,.desktop-nav>a,.nav-group>a,.socials a,.program-bottom>.icon,.future-arrow,.library-catalog-link,.MoreButton,.showcase-arrow';
  const STRONG = '.icon-button,.back-top,.socials a,.program-bottom>.icon,.future-arrow,.showcase-arrow';
  const SOFT = '.text-link,.desktop-nav>a,.nav-group>a';
  const CARD = '.program-card,.quick-links>a,.student-resources>a,.resource-tile,.document-link,.contact-details>div,.steps>div';
  function tracker(kind) {
    return { kind, el: null, rect: null, strength: 0.3, dx: 0, dy: 0 };
  }
  const magnet = tracker('magnet');
  const card = tracker('card');
  let px = 0, py = 0, pointerQueued = false;

  function measure(state) {
    const rect = state.el.getBoundingClientRect();
    // Measure the resting box, not the currently displaced one.
    state.rect = { left: rect.left - state.dx, top: rect.top - state.dy, width: rect.width, height: rect.height };
  }
  function engage(state, el) {
    if (state.el === el) return;
    release(state);
    if (!el) return;
    if (getComputedStyle(el).display === 'inline') return;
    state.el = el;
    state.dx = state.dy = 0;
    measure(state);
    if (state.kind === 'magnet') {
      state.strength = el.matches(STRONG) ? 0.42 : el.matches(SOFT) ? 0.24 : 0.3;
      el.classList.add('kx-mag', 'kx-mag-on');
    } else {
      if (!el.querySelector(':scope>.kx-glow')) {
        const glow = document.createElement('span');
        glow.className = 'kx-glow';
        glow.setAttribute('aria-hidden', 'true');
        el.prepend(glow);
      }
      el.classList.add('kx-card', 'kx-card-on');
    }
  }
  function release(state) {
    const el = state.el;
    if (!el) return;
    state.el = null;
    state.rect = null;
    state.dx = state.dy = 0;
    el.classList.remove('kx-mag-on', 'kx-card-on');
    el.style.removeProperty('transform');
    el.style.removeProperty('--kx-ix');
    el.style.removeProperty('--kx-iy');
  }
  function applyPointer() {
    pointerQueued = false;
    for (const state of [magnet, card]) {
      const el = state.el;
      if (!el) continue;
      if (!el.isConnected) { release(state); continue; }
      if (!state.rect) measure(state);
      const { left, top, width, height } = state.rect;
      const ox = px - (left + width / 2);
      const oy = py - (top + height / 2);
      if (state.kind === 'magnet') {
        const max = Math.max(10, Math.min(22, Math.max(width, height) * 0.35));
        state.dx = clamp(ox * state.strength, -max, max);
        state.dy = clamp(oy * state.strength, -max, max);
        el.style.transform = `translate3d(${state.dx.toFixed(2)}px,${state.dy.toFixed(2)}px,0)`;
        el.style.setProperty('--kx-ix', `${(state.dx * 0.45).toFixed(2)}px`);
        el.style.setProperty('--kx-iy', `${(state.dy * 0.45).toFixed(2)}px`);
      } else {
        // Cards lean subtly toward the pointer; a soft light follows inside.
        state.dx = clamp(ox * 0.035, -8, 8);
        state.dy = clamp(oy * 0.035, -6, 6) - (el.matches('.program-card') ? 6 : 0);
        if (!el.matches('.document-link,.contact-details>div,.steps>div')) {
          el.style.transform = `translate3d(${state.dx.toFixed(2)}px,${state.dy.toFixed(2)}px,0)`;
        } else { state.dx = state.dy = 0; }
        el.style.setProperty('--kx-ix', `${(px - left).toFixed(1)}px`);
        el.style.setProperty('--kx-iy', `${(py - top).toFixed(1)}px`);
      }
    }
  }
  function initPointer() {
    if (!fine.matches) return;
    document.addEventListener('pointerover', event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const target = event.target instanceof Element ? event.target : null;
      const m = target?.closest(MAGNET);
      engage(magnet, m && !m.closest('.mobile-nav,.header-search-results') ? m : null);
      engage(card, low() ? null : target?.closest(CARD) || null);
    }, { passive: true });
    addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      px = event.clientX; py = event.clientY;
      if ((magnet.el || card.el) && !pointerQueued) { pointerQueued = true; requestAnimationFrame(applyPointer); }
    }, { passive: true });
    // Positions change while scrolling under a resting pointer; re-measure lazily.
    addEventListener('scroll', () => { magnet.rect = null; card.rect = null; }, { passive: true });
    document.addEventListener('mouseout', event => { if (!event.relatedTarget) { release(magnet); release(card); } });
    // Keyboard focus must never land on a displaced control.
    document.addEventListener('focusin', event => {
      if (magnet.el && !magnet.el.contains(event.target)) release(magnet);
    });
  }

  /* ---------- Follower cursor (clean trailing circle, native cursor preserved) ---------- */
  let cursor = null;
  function initCursor() {
    if (!fine.matches || low() || cursor) return;
    const ring = document.createElement('div');
    const circle = document.createElement('i');
    ring.className = 'kx-cursor-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.append(circle);
    document.body.append(ring);
    let x = -100, y = -100, rx = -100, ry = -100, last = 0, shown = false;
    const ringTask = time => {
      if (!cursor) return false;
      const dt = last ? Math.min(64, time - last) : 16.7;
      last = time;
      const k = 1 - Math.pow(1 - 0.22, dt / 16.7);
      rx += (x - rx) * k;
      ry += (y - ry) * k;
      ring.style.transform = `translate3d(${rx.toFixed(2)}px,${ry.toFixed(2)}px,0)`;
      const moving = Math.abs(x - rx) > 0.15 || Math.abs(y - ry) > 0.15;
      if (!moving) last = 0;
      return moving;
    };
    const onMove = event => {
      if (event.pointerType !== 'mouse') return;
      x = event.clientX; y = event.clientY;
      if (!shown) {
        shown = true; rx = x; ry = y;
        root.classList.add('kx-cursor-visible');
      }
      run(ringTask);
    };
    const hide = () => { shown = false; root.classList.remove('kx-cursor-visible'); };
    const onOver = event => {
      const t = event.target instanceof Element ? event.target : null;
      if (!t) return;
      const field = t.closest('input,textarea,select,[contenteditable="true"],iframe');
      const interactive = t.closest('a,button,summary,label,[role="button"],[role="tab"],.navigation-alphabet');
      ring.classList.toggle('is-field', Boolean(field));
      ring.classList.toggle('is-link', Boolean(interactive));
    };
    const press = () => ring.classList.add('is-pressed');
    const lift = () => ring.classList.remove('is-pressed');
    const out = event => { if (!event.relatedTarget) hide(); };
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerdown', press, { passive: true });
    document.addEventListener('pointerup', lift, { passive: true });
    document.addEventListener('mouseout', out);
    addEventListener('blur', hide);
    root.classList.add('kx-cursor-on');
    cursor = {
      destroy() {
        removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerover', onOver);
        document.removeEventListener('pointerdown', press);
        document.removeEventListener('pointerup', lift);
        document.removeEventListener('mouseout', out);
        removeEventListener('blur', hide);
        ring.remove();
        root.classList.remove('kx-cursor-on', 'kx-cursor-visible');
      },
    };
  }

  /* ---------- Graceful downgrade ---------- */
  function degrade() {
    if (low() && !cursor && !lenis) return;
    root.classList.add('kx-low');
    stopLenis();
    cursor?.destroy();
    cursor = null;
    clearDepth();
    release(card);
  }
  // Measure real frame pacing once the page has settled. A struggling GPU/CPU
  // keeps the reveals (compositor-only) but drops the continuous effects.
  function probe() {
    if (low() || document.hidden) return;
    const samples = [];
    let previous = 0;
    run(time => {
      if (previous) samples.push(time - previous);
      previous = time;
      if (samples.length < 48) return true;
      samples.sort((a, b) => a - b);
      if (samples[samples.length >> 1] > 25) degrade();
      return false;
    });
  }

  function onReduceChange() {
    if (!reduce.matches) return;
    finishAll();
    degrade();
    root.classList.remove('kx-on', 'kx-text');
    releaseIntro();
    release(magnet);
  }
  reduce.addEventListener?.('change', onReduceChange);
  addEventListener('beforeprint', () => { finishAll(); releaseIntro(); });
  fine.addEventListener?.('change', () => { if (!fine.matches) { cursor?.destroy(); cursor = null; stopLenis(); release(magnet); release(card); } });

  /* ---------- Boot ---------- */
  registerSplit(document, true);
  registerMedia(document);
  heroIntro();
  initPointer();
  initCursor();
  initDepth();
  loadLenis();
  for (const id of ['news-results', 'search-results']) {
    const container = document.getElementById(id);
    if (!container) continue;
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1) { registerSplit(node); registerMedia(node); }
      }
    }).observe(container, { childList: true });
  }
  if (document.readyState === 'complete') setTimeout(probe, 900);
  else addEventListener('load', () => setTimeout(probe, 900), { once: true });
})();
