/* Animate visible content on the compositor; never measure cards during scroll. */
(() => {
  const root = document.documentElement;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const compact = matchMedia('(max-width: 720px)');
  const lite = Boolean(navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 4 || connection?.saveData);
  root.classList.toggle('motion-lite', lite);
  root.classList.add('motion-ready');
  const animations = new Map();
  let printing = false;
  const allowed = () => !preference.matches && !document.hidden && !printing;
  const ease = 'cubic-bezier(.22,1,.36,1)';

  function animate(target, frames, options = {}) {
    if (!allowed() || !target?.animate) return;
    animations.get(target)?.cancel();
    const animation = target.animate(frames, { duration: lite ? 420 : 620, easing: ease, ...options });
    animations.set(target, animation);
    const finish = () => { if (animations.get(target) === animation) animations.delete(target); };
    animation.finished.then(finish, finish);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const animation of animations.values()) animation.finish();
  });
  preference.addEventListener('change', () => {
    if (preference.matches) for (const animation of animations.values()) animation.finish();
  });
  window.addEventListener('beforeprint', () => { printing = true;for (const animation of animations.values()) animation.finish(); });
  window.addEventListener('afterprint', () => { printing = false; });

  document.querySelectorAll('.program-grid,.home-page .news-grid,.council-activity-grid')
    .forEach(grid => grid.classList.add('program-deck'));

  // No hidden/pending state: interrupted animations and missing JS never hide content.
  const cardSelector = '.program-card,.news-card,.resource-tile,.resource-group,.steps>div,.contact-details>div,.library-book,.document-row,.council-activity-card';
  const selector = `${cardSelector},.section-heading,.student-feature h2,.subheading,.editorial-section,.library-portfolio-copy,.library-event-copy`;
  const seen = new WeakSet();
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    let stagger = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = entry.target;
      // A closed tab gets its entrance only after becoming visible.
      if (target.closest('[hidden]') || target.closest('details:not([open])')) continue;
      observer.unobserve(target);
      if (!allowed() || animations.size >= (compact.matches || lite ? 3 : 6)) continue;
      const card = target.matches(cardSelector);
      const deck = card && target.parentElement.matches('.program-deck');
      let start = `translate3d(0,${card ? 24 : 16}px,0)`;
      if (deck) {
        const siblings = [...target.parentElement.children];
        const offset = siblings.indexOf(target) - (siblings.length - 1) / 2;
        start = compact.matches || lite
          ? 'translate3d(0,18px,0) scale(.985)'
          : `translate3d(${-offset * 12}px,28px,0) rotate(${offset * 1.8}deg) scale(.97)`;
      }
      animate(target, [{ opacity: .35, transform: start }, { opacity: 1, transform: 'none' }],
        { delay: Math.min(stagger++ * 45, 135), fill: 'backwards' });
    }
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' }) : null;

  function register(container) {
    if (!observer) return;
    const elements = [...(container.matches?.(selector) ? [container] : []), ...container.querySelectorAll(selector)];
    for (const element of elements) {
      if (seen.has(element) || element.parentElement?.closest(selector)) continue;
      seen.add(element);observer.observe(element);
    }
  }
  register(document);
  for (const id of ['news-results', 'search-results']) {
    const container = document.getElementById(id);
    if (!container) continue;
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1) register(node);
      }
    }).observe(container, { childList: true });
  }
  // Content changes animate as one surface, not every menu item separately.
  const pane = document.querySelector('.navigation-detail');
  if (pane) new MutationObserver(() => animate(pane,
    [{ opacity: .4, transform: 'translate3d(0,10px,0)' }, { opacity: 1, transform: 'none' }],
    { duration: 300 })).observe(pane, { childList: true });
  document.addEventListener('toggle', event => {
    const detail = event.target;
    if (detail.tagName !== 'DETAILS') return;
    if (!detail.open) { for (const child of detail.children) animations.get(child)?.cancel();return; }
    const content = [...detail.children].find(child => child.tagName !== 'SUMMARY');
    animate(content, [{ opacity: .3, transform: 'translate3d(0,-6px,0)' }, { opacity: 1, transform: 'none' }], { duration: 280 });
  }, true);
  // Keyboard focus must not chase a moving control.
  document.addEventListener('focusin', event => {
    for (const [target, animation] of animations) if (target.contains(event.target)) animation.finish();
  });
  if (allowed()) {
    const headline = document.querySelector('.hero h1,.page-heading h1');
    animate(headline, [{ transform: 'translate3d(0,18px,0)' }, { transform: 'none' }], { duration: 700 });
    const actions = document.querySelector('.hero .button-row');
    animate(actions, [{ opacity: .5, transform: 'translate3d(0,12px,0)' }, { opacity: 1, transform: 'none' }], { delay: 90 });
  }
})();
