// A small shared interaction layer. No animation dependencies or scroll hijacking.
(()=>{
 const root=document.documentElement,themeButton=document.querySelector('.theme-toggle'),system=matchMedia('(prefers-color-scheme: dark)'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 let themeTimer;
 function syncTheme(){
  const dark=root.dataset.theme==='dark',label=dark?'Увімкнути світлу тему':'Увімкнути темну тему';
  themeButton?.setAttribute('aria-label',label);themeButton?.setAttribute('title',label);themeButton?.setAttribute('aria-pressed',String(dark));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#0a1425':'#f8faff');
 }
 themeButton?.addEventListener('click',()=>{
  clearTimeout(themeTimer);root.classList.add('theme-changing');root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';
  try{localStorage.setItem('fkbad-theme',root.dataset.theme);}catch{}
  syncTheme();themeTimer=setTimeout(()=>root.classList.remove('theme-changing'),400);
 });
 system.addEventListener('change',()=>{let choice;try{choice=localStorage.getItem('fkbad-theme');}catch{}if(choice!=='light'&&choice!=='dark'){root.dataset.theme=system.matches?'dark':'light';syncTheme();}});
 window.addEventListener('storage',event=>{if(event.key==='fkbad-theme'){root.dataset.theme=['light','dark'].includes(event.newValue)?event.newValue:system.matches?'dark':'light';syncTheme();}});syncTheme();

 const header=document.querySelector('.site-header'),top=document.querySelector('.back-top');let scrollFrame=false;
 function updateScroll(){if(!document.body.classList.contains('menu-open')){header?.classList.toggle('is-scrolled',scrollY>30);top?.classList.toggle('visible',scrollY>650);}scrollFrame=false;}
 window.addEventListener('scroll',()=>{if(!scrollFrame){scrollFrame=true;requestAnimationFrame(updateScroll);}},{passive:true});updateScroll();
 top?.addEventListener('click',()=>{window.scrollTo({top:0,behavior:motion.matches?'instant':'smooth'});document.querySelector('.brand')?.focus({preventScroll:true});});

 document.querySelectorAll('.nav-group').forEach(group=>{
  const trigger=group.querySelector('.nav-expand'),panel=group.querySelector('.nav-dropdown');let timer;
  function setOpen(open){clearTimeout(timer);group.classList.toggle('is-open',open);trigger.setAttribute('aria-expanded',String(open));panel.inert=!open;}
  trigger.addEventListener('click',()=>setOpen(!group.classList.contains('is-open')));
  group.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')setOpen(true);});
  group.addEventListener('pointerleave',()=>{timer=setTimeout(()=>{if(!group.contains(document.activeElement))setOpen(false);},150);});
  group.addEventListener('focusout',()=>{setTimeout(()=>{if(!group.contains(document.activeElement))setOpen(false);},0);});
  group.addEventListener('keydown',event=>{if(event.key==='Escape'){setOpen(false);trigger.focus();event.stopPropagation();}if(event.key==='ArrowDown'&&event.target===trigger){event.preventDefault();setOpen(true);panel.querySelector('a')?.focus();}});
  document.addEventListener('pointerdown',event=>{if(!group.contains(event.target))setOpen(false);});
 });

 // Observe below-the-fold content only; first-screen information is never withheld.
 let observer;
 if('IntersectionObserver' in window&&!motion.matches){
  observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){entry.target.classList.remove('reveal-pending');entry.target.classList.add('reveal-in');observer.unobserve(entry.target);}}},{threshold:.06,rootMargin:'0px 0px -24px 0px'});
  const families=[['.section-heading,.student-feature h2,.subheading','heading'],['.program-card,.news-card,.resource-tile,.steps>div,.facts>div','card'],['.about-intro>img,.location-photo,.admission-intro>img','media'],['.student-resources>a,.contact-details>div,.admission-banner','line']];
  for(const [selector,kind] of families){document.querySelectorAll(selector).forEach(el=>{
   if(el.getBoundingClientRect().top<innerHeight*.96)return;
   el.classList.add('reveal-pending',`reveal-${kind}`);
   if(kind==='card')el.style.setProperty('--stagger',`${Math.min([...el.parentElement.children].indexOf(el)%4,3)*65}ms`);
   el.addEventListener('animationend',()=>el.classList.remove('reveal-in'),{once:true});
   observer.observe(el);
  });}
 }
 function showAll(){observer?.disconnect();document.querySelectorAll('.reveal-pending').forEach(el=>el.classList.remove('reveal-pending'));}
 motion.addEventListener('change',()=>{if(motion.matches)showAll();});
 window.addEventListener('beforeprint',showAll);
 // Cloned search results remain visible even when their original cards had reveals.
 for(const id of ['news-results','search-results']){const container=document.getElementById(id);if(container)new MutationObserver(()=>{container.querySelectorAll('.reveal-pending').forEach(el=>el.classList.remove('reveal-pending'));}).observe(container,{childList:true});}
 window.addEventListener('pageshow',event=>{if(event.persisted)showAll();});

 const hero=document.querySelector('.hero-visual');
 if(hero&&matchMedia('(hover:hover) and (min-width:1001px)').matches){
  let frame;
  hero.addEventListener('pointermove',event=>{
   if(motion.matches||frame)return;
   frame=requestAnimationFrame(()=>{const box=hero.getBoundingClientRect();hero.style.setProperty('--photo-x',`${((event.clientX-box.left)/box.width-.5)*9}px`);hero.style.setProperty('--photo-y',`${((event.clientY-box.top)/box.height-.5)*9}px`);frame=null;});
  });
  hero.addEventListener('pointerleave',()=>{hero.style.setProperty('--photo-x','0px');hero.style.setProperty('--photo-y','0px');});
 }
})();
