/* Shared motion: native document scrolling, original text nodes and layout retained. */
(()=>{
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const pointer=matchMedia('(hover: hover) and (pointer: fine)');
  let scroll, revealObserver, mediaObserver, pointerFrame=0, scrollFrame=0, printing=false;
  const seen=new WeakSet(), activeMedia=new Set();
  const hero=document.querySelector('.hero-visual');
  const cursor=document.createElement('div');
  cursor.className='motion-cursor notranslate';
  cursor.setAttribute('aria-hidden','true');
  cursor.setAttribute('translate','no');
  document.body.append(cursor);

  function syncScroll(){
    if(reduced.matches||!pointer.matches){scroll?.destroy();scroll=null;delete window.fkbadScroll;return;}
    if(!scroll&&window.Lenis){
      scroll=new Lenis({
        autoRaf:true, lerp:.085, smoothWheel:true, syncTouch:false,
        anchors:{offset:-120},
        prevent:node=>node.matches?.('.mobile-nav,.schedule-picker,textarea,select,[data-lenis-prevent]'),
        virtualScroll:({event,deltaX,deltaY})=>!event.shiftKey&&Math.abs(deltaX)<=Math.abs(deltaY),
      });
      window.fkbadScroll=scroll;
    }
    if(printing||root.classList.contains('menu-locked'))scroll?.stop();
    else if(scroll?.isStopped)scroll.start();
  }
  new MutationObserver(syncScroll).observe(root,{attributes:true,attributeFilter:['class']});

  const families=[
    ['.section-heading,.student-feature h2,.subheading,.editorial-section h2','heading'],
    ['.program-card,.news-card,.resource-tile,.steps>div,.facts>div,.resource-group','card'],
    ['.about-intro>img,.location-photo,.admission-intro>img,.editorial-photo,.article-hero','media'],
    ['.student-resources>a,.contact-details>div,.admission-banner,.editorial-section,.document-row,.footer>.container','line'],
  ];
  function reveal(el){
    el.classList.remove('motion-pending');
    el.classList.add('motion-enter');
    const finish=event=>{
      if(event.target!==el)return;
      el.classList.remove('motion-enter');el.removeEventListener('animationend',finish);
    };
    el.addEventListener('animationend',finish);
  }
  function register(container=document){
    if(reduced.matches)return;
    for(const [selector,kind] of families){
      const elements=[...(container.matches?.(selector)?[container]:[]),...container.querySelectorAll(selector)];
      for(const el of elements){
        if(seen.has(el)||el.closest('[hidden]')||el.matches('.program-grid>.program-card'))continue;
        seen.add(el);
        el.dataset.motion=kind;
        // Never hold the first screen, hash target, or keyboard focus out of view.
        const rect=el.getBoundingClientRect();
        if(rect.top<innerHeight*.95||el.contains(document.activeElement))continue;
        const index=[...el.parentElement.children].indexOf(el);
        el.style.setProperty('--motion-delay',`${Math.min(index%4,3)*65}ms`);
        el.classList.add('motion-pending');
        revealObserver?.observe(el);
      }
    }
    for(const el of container.querySelectorAll('.about-intro>img,.admission-intro>img'))mediaObserver?.observe(el);
  }
  function showAll(){
    revealObserver?.disconnect();mediaObserver?.disconnect();activeMedia.clear();
    document.querySelectorAll('.motion-pending,.motion-enter').forEach(el=>el.classList.remove('motion-pending','motion-enter'));
    document.querySelectorAll('[data-motion-parallax]').forEach(el=>el.style.removeProperty('--media-drift'));
  }
  function setupMotion(){
    syncScroll();
    root.classList.toggle('motion-enabled',!reduced.matches);
    if(reduced.matches){showAll();resetPointer();hero?.style.removeProperty('--scroll-drift');return;}
    revealObserver?.disconnect();mediaObserver?.disconnect();
    revealObserver=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){reveal(entry.target);revealObserver.unobserve(entry.target);}
    },{threshold:0,rootMargin:'0px 0px -12px 0px'});
    mediaObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){if(entry.isIntersecting)activeMedia.add(entry.target);else activeMedia.delete(entry.target);}
      requestScrollFrame();
    },{rootMargin:'80px'});
    if(hero)mediaObserver.observe(hero);
    register();
  }
  // Filters and "load more" reuse the same effects; translator-generated text is ignored.
  for(const id of ['news-results','search-results']){
    const container=document.getElementById(id);
    if(container)new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes){
        if(node.nodeType!==1)continue;
        node.classList.remove('motion-pending','motion-enter');
        node.querySelectorAll('.motion-pending,.motion-enter').forEach(el=>el.classList.remove('motion-pending','motion-enter'));
        register(node);
      }
    }).observe(container,{childList:true});
  }
  document.addEventListener('focusin',event=>{
    const pending=event.target.closest('.motion-pending');
    if(pending){pending.classList.remove('motion-pending');revealObserver?.unobserve(pending);}
  });

  function updateParallax(){
    scrollFrame=0;
    if(reduced.matches||!pointer.matches)return;
    for(const el of activeMedia){
      const rect=el.getBoundingClientRect();
      const progress=Math.max(-1,Math.min(1,(innerHeight/2-rect.top-rect.height/2)/innerHeight));
      if(el===hero)el.style.setProperty('--scroll-drift',`${progress*28}px`);
      else{el.dataset.motionParallax='';el.style.setProperty('--media-drift',`${progress*12}px`);}
    }
  }
  function requestScrollFrame(){if(pointer.matches&&!reduced.matches&&!scrollFrame)scrollFrame=requestAnimationFrame(updateParallax);}
  window.addEventListener('scroll',requestScrollFrame,{passive:true});
  window.addEventListener('resize',requestScrollFrame,{passive:true});

  let x=0,y=0,cx=0,cy=0,magnet=null,surface=null,overHero=false,visible=false;
  function clearMagnet(){if(magnet){magnet.style.removeProperty('--magnet-x');magnet.style.removeProperty('--magnet-y');magnet=null;}}
  function resetPointer(){
    visible=false;cursor.classList.remove('is-visible','is-active');clearMagnet();
    surface?.classList.remove('motion-hover');surface=null;
    hero?.style.removeProperty('--photo-x');hero?.style.removeProperty('--photo-y');
    cancelAnimationFrame(pointerFrame);pointerFrame=0;
  }
  function animatePointer(){
    pointerFrame=0;
    cx+=(x-cx)*.22;cy+=(y-cy)*.22;
    cursor.style.transform=`translate3d(${cx}px,${cy}px,0)`;
    if(magnet){
      const rect=magnet.getBoundingClientRect();
      magnet.style.setProperty('--magnet-x',`${Math.max(-5,Math.min(5,(x-rect.left-rect.width/2)*.1))}px`);
      magnet.style.setProperty('--magnet-y',`${Math.max(-4,Math.min(4,(y-rect.top-rect.height/2)*.13))}px`);
    }
    if(surface){
      const rect=surface.getBoundingClientRect();
      surface.style.setProperty('--light-x',`${x-rect.left}px`);
      surface.style.setProperty('--light-y',`${y-rect.top}px`);
    }
    if(hero&&overHero){
      const rect=hero.getBoundingClientRect();
      hero.style.setProperty('--photo-x',`${((x-rect.left)/rect.width-.5)*12}px`);
      hero.style.setProperty('--photo-y',`${((y-rect.top)/rect.height-.5)*12}px`);
    }
    if(visible&&(Math.abs(x-cx)>.1||Math.abs(y-cy)>.1))pointerFrame=requestAnimationFrame(animatePointer);
  }
  document.addEventListener('pointermove',event=>{
    if(reduced.matches||!pointer.matches||event.pointerType!=='mouse')return;
    x=event.clientX;y=event.clientY;
    if(!visible){cx=x;cy=y;visible=true;}
    const textInput=event.target.closest('input,textarea,select,[contenteditable="true"]');
    const staticSchedule=event.target.closest('.schedule-table-scroll');
    cursor.classList.toggle('is-visible',!textInput&&!staticSchedule);
    cursor.classList.toggle('is-active',!staticSchedule&&!!event.target.closest('a,button'));
    const nextMagnet=event.target.closest('.button,.header-actions>.icon-button,.back-top');
    if(nextMagnet!==magnet){clearMagnet();magnet=nextMagnet;magnet?.classList.add('motion-magnet');}
    const nextSurface=event.target.closest('.program-card,.news-card,.resource-tile');
    if(nextSurface!==surface){surface?.classList.remove('motion-hover');surface=nextSurface;surface?.classList.add('motion-hover');}
    overHero=!!event.target.closest('.hero-visual');
    if(!overHero){hero?.style.removeProperty('--photo-x');hero?.style.removeProperty('--photo-y');}
    if(!pointerFrame)pointerFrame=requestAnimationFrame(animatePointer);
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',resetPointer);
  document.addEventListener('keydown',resetPointer);
  document.addEventListener('pointerdown',()=>cursor.classList.add('is-pressed'),{passive:true});
  document.addEventListener('pointerup',()=>cursor.classList.remove('is-pressed'),{passive:true});
  window.addEventListener('blur',resetPointer);
  pointer.addEventListener('change',()=>{resetPointer();setupMotion();requestScrollFrame();});
  reduced.addEventListener('change',setupMotion);
  window.addEventListener('beforeprint',()=>{printing=true;showAll();resetPointer();scroll?.stop();});
  window.addEventListener('afterprint',()=>{printing=false;syncScroll();});
  window.addEventListener('pageshow',event=>{if(event.persisted){showAll();scroll?.resize();syncScroll();}});
  window.addEventListener('load',()=>{scroll?.resize();syncScroll();});
  setupMotion();
  // Three-card fan: specialties and home-page news keep a subtle five-percent overlap when open.
  const decks=[...document.querySelectorAll('.program-grid,.home-page .news-grid')].map(grid=>{
    grid.classList.add('program-deck');
    const cardSelector=grid.matches('.news-grid')?':scope>.news-card':':scope>.program-card';
    const heading=grid.previousElementSibling?.matches('.section-heading')?grid.previousElementSibling:null;
    heading?.classList.add('deck-heading');
    return {grid,cards:[...grid.querySelectorAll(cardSelector)],heading,visible:false};
  });
  let deckFrame=0;
  function drawDecks(){
    deckFrame=0;
    if(!pointer.matches){for(const deck of decks)for(const card of deck.cards){card.style.removeProperty('transform');card.style.removeProperty('z-index');}return;}
    for(const deck of decks){
      if(!deck.visible)continue;
      const {grid,cards,heading}=deck,rect=grid.getBoundingClientRect();
      const mobile=innerWidth<=720;
      const center=rect.top+rect.height/2;
      const distance=Math.abs(center-innerHeight*.53);
      const enter=Math.max(0,Math.min(1,(innerHeight*.96-rect.top)/(innerHeight*.24)));
      const leave=Math.max(0,Math.min(1,(rect.bottom-innerHeight*.04)/(innerHeight*.24)));
      const viewportSpread=mobile ? .95*Math.min(enter,leave) : Math.max(0,Math.min(.95,(innerHeight*.68-distance)/(innerHeight*.43)));
      const spread=reduced.matches?1:(grid.contains(document.activeElement) ? .95 : viewportSpread);
      const fold=1-spread;
      cards.forEach((card,i)=>{
        const x=mobile?(i-(cards.length-1)/2)*4*fold:(grid.clientWidth/2-card.offsetLeft-card.offsetWidth/2)*fold;
        const y=mobile?((cards[0]?.offsetTop||0)+i*12-card.offsetTop)*fold:(grid.clientHeight/2-card.offsetTop-card.offsetHeight/2+(i-1)*9)*fold;
        const angle=(i-(cards.length-1)/2)*(mobile?3:9)*fold;
        card.style.transform=`translate3d(${x}px,${y}px,0) rotate(${angle}deg) scale(${1-fold*.08})`;
        card.style.zIndex=String(mobile?cards.length-i:(i===1?3:i+1));
      });
      if(heading){
        heading.style.transform=`translate3d(0,${fold*26}px,0) scale(${1-fold*.055})`;
        heading.style.opacity=String(1-fold*.42);
      }
    }
  }
  function queueDecks(){if(!pointer.matches)return;if(!deckFrame&&decks.some(d=>d.visible))deckFrame=requestAnimationFrame(drawDecks);}
  const deckObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){const deck=decks.find(d=>d.grid===entry.target);deck.visible=entry.isIntersecting;}
    queueDecks();
  },{rootMargin:'180px'});
  decks.forEach(({grid})=>{
    deckObserver.observe(grid);
    grid.addEventListener('focusin',queueDecks);
    grid.addEventListener('focusout',()=>requestAnimationFrame(queueDecks));
  });
  window.addEventListener('scroll',queueDecks,{passive:true});
  window.addEventListener('resize',queueDecks,{passive:true});
  window.addEventListener('pageshow',queueDecks);
  reduced.addEventListener('change',queueDecks);

  // The main page unfolds section by section as each block reaches the viewport.
  const homeStages=[...document.querySelectorAll('.home-page .quick-links,.home-page main>.section.container,.home-page .news-section>.container,.home-page .future-invitation,.home-page .footer>.container')];
  let stageObserver;
  function syncHomeStages(){
    stageObserver?.disconnect();
    if(reduced.matches){homeStages.forEach(stage=>stage.classList.add('is-open'));return;}
    stageObserver=new IntersectionObserver(entries=>{
      for(const entry of entries)entry.target.classList.toggle('is-open',entry.isIntersecting);
    },{threshold:.05,rootMargin:'-5% 0px -5% 0px'});
    homeStages.forEach(stage=>{stage.classList.add('home-stage');stageObserver.observe(stage);});
  }
  syncHomeStages();
  reduced.addEventListener('change',syncHomeStages);
})();
