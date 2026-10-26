(function () {
  const root = document.querySelector('.library-page');
  if (!root) return;

  const tabs = [...root.querySelectorAll('[data-library-tab]')];
  const panels = tabs.map(tab => root.querySelector('#' + tab.dataset.libraryTab));
  const tablist = root.querySelector('.library-sections');

  function moveTabHighlight(tab) {
    if (!tab || !tablist) return;
    tablist.style.setProperty('--tab-glow-x', tab.offsetLeft + 'px');
    tablist.style.setProperty('--tab-glow-y', tab.offsetTop + 'px');
    tablist.style.setProperty('--tab-glow-width', tab.offsetWidth + 'px');
    tablist.style.setProperty('--tab-glow-height', tab.offsetHeight + 'px');
    tablist.dataset.glowReady = 'true';
  }

  function activate(index, focus) {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (panels[i]) panels[i].hidden = !active;
    });
    moveTabHighlight(tabs[index]);
    if (focus && tabs[index]) tabs[index].focus();
    requestAnimationFrame(() => {
      updateScrollDrivenItems();
      updateShowcaseParallax();
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(index, false));
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(next, true);
    });
  });

  root.querySelectorAll('[data-library-open-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.libraryOpenTab;
      const idx = tabs.findIndex(t => t.dataset.libraryTab === targetId);
      if (idx >= 0) activate(idx, true);
    });
  });

  moveTabHighlight(tabs.find(tab => tab.getAttribute('aria-selected') === 'true'));
  window.addEventListener('resize', () => {
    moveTabHighlight(tabs.find(tab => tab.getAttribute('aria-selected') === 'true'));
  });

  /* ---------- 1. Scroll-Driven Only Accordion Cards (.items -> .item) ---------- */
  const itemGroups = [...root.querySelectorAll('.items')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function updateScrollDrivenItems() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    // Focus zone around the upper-middle of the viewport
    const focusY = vh * 0.44;
    const activeBand = vh * 0.42;

    itemGroups.forEach(group => {
      if (group.closest('[hidden]')) return;
      const items = [...group.querySelectorAll(':scope > .item')];
      if (!items.length) return;

      if (items.length === 1) {
        const r = items[0].getBoundingClientRect();
        const visible = r.bottom > 60 && r.top < vh * 0.88;
        items[0].classList.toggle('is-active', visible);
        return;
      }

      let bestItem = null;
      let bestDist = Infinity;

      items.forEach(item => {
        const r = item.getBoundingClientRect();
        if (r.bottom < 40 || r.top > vh - 40) return;
        const center = (r.top + r.bottom) * 0.5;
        const dist = Math.abs(center - focusY);
        if (dist < bestDist) {
          bestDist = dist;
          bestItem = item;
        }
      });

      // If the user is at the very top of the page and the first card is visible near the top,
      // allow the closest visible card within the band to expand smoothly.
      items.forEach(item => {
        const shouldOpen = item === bestItem && bestDist <= activeBand;
        item.classList.toggle('is-active', shouldOpen);
      });
    });
  }

  /* ---------- 2. Subtle Editorial Photo Parallax on Scroll ---------- */
  const showcaseCards = [...root.querySelectorAll('[data-showcase-card]')];

  function updateShowcaseParallax() {
    if (reduceMotion.matches) return;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    showcaseCards.forEach((card, idx) => {
      if (card.closest('[hidden]')) return;
      const r = card.getBoundingClientRect();
      if (r.bottom < -60 || r.top > vh + 60) return;
      const img = card.querySelector('img');
      if (!img) return;
      const progress = ((r.top + r.height * 0.5) - vh * 0.5) / (vh * 0.7);
      const clamped = Math.max(-1, Math.min(1, progress));
      const shift = clamped * (idx % 2 === 0 ? -12 : 10);
      img.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0) scale(1.04)`;
    });
  }

  let scrollTicking = false;
  function onScrollOrResize() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      scrollTicking = false;
      updateScrollDrivenItems();
      updateShowcaseParallax();
    });
  }

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });
  requestAnimationFrame(() => {
    updateScrollDrivenItems();
    updateShowcaseParallax();
  });

  /* ---------- 2b. Minimalist Expandable Accordion List (.testimonials -> [data-expandable-item]) ---------- */
  root.querySelectorAll('[data-expandable-trigger]').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('[data-expandable-item]');
      if (!item) return;
      const willOpen = !item.classList.contains('is-open');
      item.classList.toggle('is-open', willOpen);
      trigger.setAttribute('aria-expanded', String(willOpen));
    });
  });

  /* ---------- 3. Editorial Photo Gallery Lightbox ---------- */
  const lightbox = root.querySelector('.library-lightbox');
  const lightboxImage = root.querySelector('[data-lightbox-image]');
  let activeCarousel = null;
  let zoom = 1;

  root.querySelectorAll('[data-library-carousel]').forEach(carousel => {
    carousel.dataset.index = '0';
    carousel.addEventListener('click', event => {
      const openBtn = event.target.closest('[data-lightbox-open]');
      if (!openBtn) return;
      const slideIndex = Number(openBtn.dataset.slideIndex ?? 0);
      carousel.dataset.index = String(slideIndex);
      activeCarousel = carousel;
      zoom = 1;
      syncZoom();
      updateLightbox();
      if (lightbox && lightbox.showModal) lightbox.showModal();
    });
  });

  /* ---------- 4. Book Cover / Poster Lightbox Preview on .MoreButton[data-book-cover] ---------- */
  root.querySelectorAll('[data-book-cover]').forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      const src = btn.dataset.bookCover;
      const title = btn.dataset.bookTitle || 'Видання бібліотеки';
      if (!src || !lightbox || !lightboxImage) return;
      activeCarousel = null;
      zoom = 1;
      syncZoom();
      lightboxImage.hidden = false;
      lightboxImage.src = src;
      lightboxImage.alt = title;
      lightbox.querySelector('[data-lightbox-prev]').disabled = true;
      lightbox.querySelector('[data-lightbox-next]').disabled = true;
      if (lightbox.showModal) lightbox.showModal();
    });
  });

  function updateLightbox() {
    if (!activeCarousel || !lightbox || !lightboxImage) return;
    const slides = [...activeCarousel.querySelectorAll('.library-carousel-slide')];
    const idx = Number(activeCarousel.dataset.index || 0);
    const slide = slides[idx] || slides[0];
    const image = slide?.querySelector('img');
    if (!image) return;
    lightboxImage.hidden = false;
    lightboxImage.src = image.dataset.fullSrc || image.currentSrc || image.src;
    lightboxImage.alt = image.alt;
    lightbox.querySelector('[data-lightbox-prev]').disabled = slides.length < 2;
    lightbox.querySelector('[data-lightbox-next]').disabled = slides.length < 2;
  }

  function syncZoom() {
    if (!lightboxImage || !lightbox) return;
    lightboxImage.style.transform = 'scale(' + zoom + ')';
    const resetBtn = lightbox.querySelector('[data-zoom-reset]');
    if (resetBtn) resetBtn.textContent = Math.round(zoom * 100) + '%';
  }

  function stepLightbox(direction) {
    if (!activeCarousel) return;
    const slides = [...activeCarousel.querySelectorAll('.library-carousel-slide')];
    if (!slides.length) return;
    const length = slides.length;
    const next = ((Number(activeCarousel.dataset.index || 0) + direction) % length + length) % length;
    activeCarousel.dataset.index = String(next);
    zoom = 1;
    syncZoom();
    updateLightbox();
  }

  if (lightbox) {
    root.querySelector('[data-lightbox-close]')?.addEventListener('click', () => lightbox.close());
    root.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => stepLightbox(-1));
    root.querySelector('[data-lightbox-next]')?.addEventListener('click', () => stepLightbox(1));
    root.querySelector('[data-zoom-in]')?.addEventListener('click', () => { zoom = Math.min(3, zoom + 0.25); syncZoom(); });
    root.querySelector('[data-zoom-out]')?.addEventListener('click', () => { zoom = Math.max(1, zoom - 0.25); syncZoom(); });
    root.querySelector('[data-zoom-reset]')?.addEventListener('click', () => { zoom = 1; syncZoom(); });
    lightboxImage?.addEventListener('dblclick', () => { zoom = zoom > 1 ? 1 : 2; syncZoom(); });
    lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
    document.addEventListener('keydown', event => {
      if (!lightbox.open) return;
      if (event.key === 'ArrowLeft') stepLightbox(-1);
      if (event.key === 'ArrowRight') stepLightbox(1);
    });
  }
})();
