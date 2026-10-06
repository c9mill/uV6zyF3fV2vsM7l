/* A small motion vocabulary: settle, reveal, respond. No work runs while idle. */
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
  const shortTravel = () => compact.matches || lite;

  function animate(target, frames, options = {}) {
    if (!allowed() || !target?.animate) return;
    animations.get(target)?.cancel();
    const animation = target.animate(frames, { duration: shortTravel() ? 420 : 680, easing: ease, ...options });
    animations.set(target, animation);
    const finish = () => { if (animations.get(target) === animation) animations.delete(target); };
    animation.finished.then(finish, finish);
  }

  function finishAll() {
    for (const animation of animations.values()) animation.finish();
    animations.clear();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishAll(); });
  preference.addEventListener('change', () => {
    if (preference.matches) finishAll();
  });
  window.addEventListener('pagehide', finishAll);
  window.addEventListener('beforeprint', () => { printing = true;finishAll(); });
  window.addEventListener('afterprint', () => { printing = false; });

  // No hidden/pending state: interrupted animations and missing JS never hide content.
  const cardSelector = '.program-card,.news-card,.resource-tile,.resource-group,.steps>div,.contact-details>div,.library-book,.document-row,.council-activity-card';
  const selector = `${cardSelector},.section-heading,.student-feature h2,.subheading,.editorial-section,.library-portfolio-copy,.library-event-copy`;
  const seen = new WeakSet();
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    const groups = new Map();
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = entry.target;
      // A closed tab gets its entrance only after becoming visible.
      if (target.closest('[hidden]') || target.closest('details:not([open])')) continue;
      observer.unobserve(target);
      if (!allowed() || animations.size >= (shortTravel() ? 3 : 6)) continue;
      // Do not animate both a disclosure surface and its contents at once.
      if ([...animations.keys()].some(parent => parent.contains(target))) continue;
      const card = target.matches(cardSelector);
      const order = groups.get(target.parentElement) || 0;
      groups.set(target.parentElement, order + 1);
      const distance = shortTravel() ? 12 : card ? 22 : 16;
      animate(target,
        [{ opacity: .35, transform: `translate3d(0,${distance}px,0)` }, { opacity: 1, transform: 'none' }],
        { delay: Math.min(order * (shortTravel() ? 40 : 65), 150), fill: 'backwards' });
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
    [{ opacity: .45, transform: 'translate3d(0,8px,0)' }, { opacity: 1, transform: 'none' }],
    { duration: 320 })).observe(pane, { childList: true });

  // Existing tab code owns visibility, focus and gallery sizing. Only the small
  // heading enters here; never promote a whole book catalogue to a GPU layer.
  document.querySelectorAll('[data-library-open-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = document.getElementById(`tab-${button.dataset.libraryOpenTab}`);
      if (!tab) return;
      tab.click();
      tab.focus({ preventScroll: true });
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    });
  });
  for (const panel of document.querySelectorAll('.library-page > [role="tabpanel"]')) {
    let wasHidden = panel.hidden;
    new MutationObserver(() => {
      if (panel.hidden === wasHidden) return;
      wasHidden = panel.hidden;
      const heading = panel.querySelector('.library-section-heading');
      if (panel.hidden) { animations.get(heading)?.cancel();return; }
      animate(heading,
        [{ opacity: .3, transform: 'translate3d(0,8px,0)' }, { opacity: 1, transform: 'none' }],
        { duration: shortTravel() ? 260 : 380 });
    }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.addEventListener('toggle', event => {
    const detail = event.target;
    if (detail.tagName !== 'DETAILS') return;
    if (!detail.open) { for (const child of detail.children) animations.get(child)?.cancel();return; }
    const content = [...detail.children].find(child => child.tagName !== 'SUMMARY');
    animate(content, [{ opacity: .4, transform: 'translate3d(0,6px,0)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
  }, true);
  // Focus or a press settles the entrance immediately, so controls cannot flee
  // the pointer or keyboard. This never touches the gallery's own animations.
  function settleTarget(event) {
    for (const [target, animation] of animations) if (target.contains(event.target)) animation.finish();
  }
  document.addEventListener('focusin', settleTarget);
  document.addEventListener('pointerdown', settleTarget, { passive: true });
  if (allowed()) {
    const headline = document.querySelector('.hero h1,.page-heading h1');
    const words = headline?.querySelectorAll('.hero-word');
    if (words?.length) {
      words.forEach((word, index) => animate(word,
        [{ opacity: .35, transform: `translate3d(0,${shortTravel() ? 14 : 28}px,0)` }, { opacity: 1, transform: 'none' }],
        { duration: shortTravel() ? 480 : 820, delay: index * (shortTravel() ? 55 : 90), fill: 'backwards' }));
    } else {
      animate(headline, [{ transform: 'translate3d(0,14px,0)' }, { transform: 'none' }], { duration: 600 });
    }
    const name = document.querySelector('.hero-college-name');
    animate(name, [{ opacity: .4, transform: 'translate3d(0,8px,0)' }, { opacity: 1, transform: 'none' }],
      { delay: shortTravel() ? 80 : 150, fill: 'backwards' });
    const actions = document.querySelector('.hero .button-row');
    animate(actions, [{ opacity: .5, transform: 'translate3d(0,10px,0)' }, { opacity: 1, transform: 'none' }],
      { delay: shortTravel() ? 120 : 210, fill: 'backwards' });
  }
})();
