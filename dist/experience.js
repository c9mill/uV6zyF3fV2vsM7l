// Shared theme, navigation and content sizing. Motion lives in motion.js.
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
 top?.addEventListener('click',()=>{if(window.fkbadScroll)window.fkbadScroll.scrollTo(0);else window.scrollTo({top:0,behavior:motion.matches?'instant':'smooth'});document.querySelector('.brand')?.focus({preventScroll:true});});

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

 // Keep wide content tables scrollable without changing their rows or semantics.
 document.querySelectorAll('main table').forEach(table=>{
  if(table.closest('.schedule-table-scroll'))return;
  let wrapper=table.closest('.table-scroll');
  if(!wrapper){wrapper=document.createElement('div');wrapper.className='table-scroll';table.before(wrapper);wrapper.append(table);}
  wrapper.tabIndex=0;wrapper.setAttribute('role','region');
  wrapper.setAttribute('aria-label',table.caption?.textContent.trim()||'Таблиця — прокрутіть, щоб переглянути всі стовпці');
 });
 // Filtered news uses the same natural-photo sizing as pre-rendered cards.
 function sizeNewsPhoto(img){
  if(!img.matches('.news-image img')||!img.naturalWidth)return;
  const card=img.closest('.news-card'),ratio=Math.max(.7,Math.min(1.9,img.naturalWidth/img.naturalHeight));
  card.style.setProperty('--photo-weight',ratio);card.style.setProperty('--photo-basis',`${210*ratio}px`);
  img.width=img.naturalWidth;img.height=img.naturalHeight;
 }
 document.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement)sizeNewsPhoto(event.target);},true);
 document.querySelectorAll('.news-image img').forEach(sizeNewsPhoto);
 // Flex rows stretch the cards; only the excerpt grows, never the heading.
 // Observe the actual free height so text stops on a complete line at any size.
 const excerptObserver=new ResizeObserver(entries=>{
  for(const {target,contentRect} of entries){
   const lineHeight=parseFloat(getComputedStyle(target).lineHeight);
   target.style.setProperty('--excerpt-lines',Math.max(1,Math.floor((contentRect.height+.25)/lineHeight)));
  }
 });
 document.querySelectorAll('.news-grid').forEach(grid=>{
  let observed=new Set();
  function observeExcerpts(){
   const current=new Set(grid.querySelectorAll('.news-excerpt'));
   for(const excerpt of observed)if(!current.has(excerpt))excerptObserver.unobserve(excerpt);
   for(const excerpt of current)if(!observed.has(excerpt))excerptObserver.observe(excerpt);
   observed=current;
  }
  observeExcerpts();
  new MutationObserver(observeExcerpts).observe(grid,{childList:true});
 });
})();
