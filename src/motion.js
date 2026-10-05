/* One-shot compositor animations. No scroll loops, card geometry or custom scrolling. */
(() => {
  const root = document.documentElement;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowPower = Boolean(navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 4 || connection?.saveData);
  root.classList.toggle('low-power', lowPower);

  // Keep the compact mobile layout without the former scroll-driven card fan.
  document.querySelectorAll('.program-grid,.home-page .news-grid,.council-activity-grid')
    .forEach(grid => grid.classList.add('program-deck'));

  if (lowPower || preference.matches || !('IntersectionObserver' in window)) return;
  const selector = '.section-heading,.program-card,.news-card,.resource-tile,.editorial-section';
  const seen = new WeakSet();
  const animations = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const target = entry.target;
      observer.unobserve(target);
      // Only the first entrance animates. Content is always readable beforehand.
      if (preference.matches || document.hidden || !target.animate) continue;
      const animation = target.animate(
        [{ opacity: .65, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: 'ease-out' }
      );
      animations.add(animation);
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    }
  }, { threshold: 0, rootMargin: '0px 0px -20px 0px' });

  function register(container) {
    const elements = [...(container.matches?.(selector) ? [container] : []), ...container.querySelectorAll(selector)];
    for (const element of elements) {
      if (seen.has(element)) continue;
      seen.add(element);
      observer.observe(element);
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
  preference.addEventListener('change', () => {
    if (preference.matches) {
      observer.disconnect();
      for (const animation of animations) animation.cancel();
      animations.clear();
    }
  });
})();
