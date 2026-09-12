const actions=document.querySelector('.header-actions');
// Make the static site installable as FKBAD without changing page navigation.
if('serviceWorker' in navigator && window.isSecureContext){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{}),{once:true});
}
// Discard the old reverse-translation preference before loading the widget.
if(document.cookie.split(';').some(cookie=>/^googtrans=\/[^/]+\/uk$/.test(cookie.trim()))){
  for(const domain of ['',`; domain=${location.hostname}`,`; domain=.${location.hostname}`]){
    document.cookie=`googtrans=; path=/; max-age=0${domain}`;
  }
}
const translateRoot=document.createElement('div');translateRoot.id='google_translate_element';translateRoot.hidden=true;document.body.appendChild(translateRoot);
window.googleTranslateElementInit=()=>new google.translate.TranslateElement({pageLanguage:'uk',includedLanguages:'uk,en',autoDisplay:false},'google_translate_element');
let translateScript;
function loadTranslator(){
 if(translateScript)return;
 translateScript=document.createElement('script');translateScript.src='https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';translateScript.async=true;document.head.appendChild(translateScript);
}
// Ukrainian pages do not need to download and initialize the translation engine.
if(document.cookie.split(';').some(cookie=>/^googtrans=\/[^/]+\/en$/.test(cookie.trim())))loadTranslator();
if(actions&&!actions.querySelector('.language-toggle')){
  const languageButton=document.createElement('button');
  languageButton.className='icon-button language-toggle notranslate';
  languageButton.type='button';
  languageButton.setAttribute('translate','no');
  const setLanguage=english=>{
    languageButton.dataset.lang=english?'en':'uk';
    languageButton.textContent=english?'УКР':'ENG';
    languageButton.title=english?'Українська (оригінал)':'English';
    languageButton.setAttribute('aria-label',english?'Показати український оригінал':'Switch to English');
    document.documentElement.lang=english?'en':'uk';
  };
  setLanguage(document.cookie.split(';').some(cookie=>/^googtrans=\/[^/]+\/en$/.test(cookie.trim())));
  const waitForControl=async find=>{
    for(let attempt=0;attempt<100;attempt++){
      const control=find();
      if(control)return control;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Translation control unavailable');
  };
  languageButton.addEventListener('click',async()=>{
    const english=languageButton.dataset.lang!=='en';
    languageButton.disabled=true;
    try{
      if(english){
        loadTranslator();
        const select=await waitForControl(()=>document.querySelector('.goog-te-combo option[value="en"]')?.parentElement);
        select.value='en';
        select.dispatchEvent(new Event('change'));
      }else{
        // Restore Google's saved original DOM; selecting "uk" translates it again.
        const restore=await waitForControl(()=>{
          for(const frame of document.querySelectorAll('iframe')){
            try{
              const control=frame.contentDocument?.querySelector('button[id$=".restore"]');
              if(control)return control;
            }catch{/* Ignore unrelated cross-origin frames. */}
          }
        });
        restore.click();
      }
      setLanguage(english);
    }catch(error){
      console.warn('Could not switch language',error);
    }finally{
      languageButton.disabled=false;
    }
  });
  actions.insertBefore(languageButton,actions.firstElementChild);
}
const menuButton=document.querySelector('.menu-toggle');
const mobileNav=document.querySelector('#mobile-nav');
const menuBackdrop=document.createElement('button');
menuBackdrop.className='menu-backdrop';menuBackdrop.type='button';menuBackdrop.hidden=true;
menuBackdrop.tabIndex=-1;menuBackdrop.setAttribute('aria-label','Закрити меню');
document.querySelector('.site-header')?.before(menuBackdrop);
menuBackdrop.addEventListener('click',()=>{closeMenu();menuButton?.focus({preventScroll:true});});
let menuTimer, menuFrame, savedScroll=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function closeMenu(){
 if(!menuButton||menuButton.getAttribute('aria-expanded')!=='true')return;
 clearTimeout(menuTimer);cancelAnimationFrame(menuFrame);mobileNav.classList.remove('is-open');mobileNav.inert=true;
 menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Відкрити меню');
 document.body.classList.remove('menu-open');document.documentElement.classList.remove('menu-locked');menuBackdrop.classList.remove('is-open');menuBackdrop.style.pointerEvents='none';
 document.querySelectorAll('main,.footer,.utility,.back-top').forEach(el=>el.inert=false);
 const previous=document.documentElement.style.scrollBehavior;document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,savedScroll);document.documentElement.style.scrollBehavior=previous;
 menuTimer=setTimeout(()=>{mobileNav.hidden=true;menuBackdrop.hidden=true;},reducedMotion.matches?0:520);
}
menuButton?.addEventListener('click',()=>{
 if(menuButton.getAttribute('aria-expanded')==='true'){closeMenu();return;}
 clearTimeout(menuTimer);cancelAnimationFrame(menuFrame);savedScroll=window.scrollY;mobileNav.hidden=false;mobileNav.inert=false;
 menuButton.setAttribute('aria-expanded','true');menuButton.setAttribute('aria-label','Закрити меню');document.body.classList.add('menu-open');
 document.documentElement.classList.add('menu-locked');menuBackdrop.hidden=false;menuBackdrop.style.pointerEvents='';
 document.querySelectorAll('main,.footer,.utility,.back-top').forEach(el=>el.inert=true);
 menuFrame=requestAnimationFrame(()=>{menuFrame=requestAnimationFrame(()=>{mobileNav.classList.add('is-open');menuBackdrop.classList.add('is-open');});});
});
mobileNav?.querySelectorAll('a').forEach((a,i)=>{a.style.setProperty('--menu-index',i);a.addEventListener('click',closeMenu);});
document.addEventListener('keydown',event=>{
 if(event.key!=='Tab'||menuButton?.getAttribute('aria-expanded')!=='true')return;
 const items=[...document.querySelector('.header-inner').querySelectorAll('a,button,input'),...mobileNav.querySelectorAll('a,button,input')].filter(el=>el.getClientRects().length);
 const first=items[0],last=items.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuButton?.getAttribute('aria-expanded')==='true'){closeMenu();menuButton.focus({preventScroll:true});}});
// Keep the panel and focused search open when the mobile keyboard resizes the viewport.
window.addEventListener('pagehide',closeMenu);

const norm=text=>(text||'').toLocaleLowerCase('uk').replace(/[’ʼ`]/g,"'").replace(/\s+/g,' ').trim();
const escapeHTML=text=>String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const externalAttrs=url=>url.startsWith('http')?' target="_blank" rel="noopener noreferrer"':'';
const matches=(record,query)=>norm(query).split(' ').filter(Boolean).every(word=>norm(record.title+' '+record.text).includes(word));
let indexPromise;
function getIndex(){return indexPromise??=(fetch('/search-index.json').then(r=>{if(!r.ok)throw Error('load');return r.json();}).catch(e=>{indexPromise=null;throw e;}));}
function debounce(fn,delay=180){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay);};}
// Keep search terms in the URL fragment so they are not included in the page request or server logs.
document.querySelectorAll('.header-search').forEach(form=>form.addEventListener('submit',event=>{
 event.preventDefault();const q=form.querySelector('input[name="q"]')?.value.trim();if(q)location.assign('/пошук/#'+new URLSearchParams({q}));
}));

const documentForm=document.querySelector('#document-filter');
if(documentForm){
 const input=document.querySelector('#document-query'),category=document.querySelector('#document-category'),rows=[...document.querySelectorAll('.document-row')];
 function filterDocuments(){let count=0;for(const row of rows){const visible=norm(row.textContent).includes(norm(input.value))&&(!category.value||row.dataset.category===category.value);row.hidden=!visible;if(visible)count++;}document.querySelector('#document-status').textContent=`Знайдено документів: ${count}`;document.querySelector('#document-empty').hidden=count>0;}
 input.addEventListener('input',()=>filterDocuments());category.addEventListener('change',filterDocuments);documentForm.addEventListener('submit',e=>{e.preventDefault();filterDocuments();});document.querySelector('#reset-documents').addEventListener('click',()=>{documentForm.reset();filterDocuments();input.focus();});
}

function moreButton(container,callback){const b=document.createElement('button');b.type='button';b.className='button load-more';b.textContent='Показати ще';b.addEventListener('click',()=>{b.remove();callback();});container.append(b);}
const siteSearch=document.querySelector('#site-search');
if(siteSearch){
 const input=document.querySelector('#site-query'),type=document.querySelector('#search-type'),results=document.querySelector('#search-results'),status=document.querySelector('#search-status');
 const params=new URLSearchParams(location.hash.slice(1)||location.search);input.value=params.get('q')||'';type.value=params.get('type')||'';
 let request=0;
 async function search(updateURL=true){
  const id=++request,q=input.value.trim(),kind=type.value;results.replaceChildren();
  if(!q){status.textContent='Введи назву або ключове слово.';return;}
  if(updateURL){const p=new URLSearchParams({q});if(kind)p.set('type',kind);history.replaceState(null,'','#'+p);}
  status.textContent='Шукаємо матеріали…';
  try{const index=await getIndex();if(id!==request)return;const found=index.filter(r=>(!kind||r.type===kind)&&matches(r,q)).sort((a,b)=>Number(norm(b.title).includes(norm(q)))-Number(norm(a.title).includes(norm(q))));status.textContent=found.length?`Знайдено матеріалів: ${found.length}`:'Нічого не знайдено. Спробуй інше слово або зміни тип матеріалу.';
   let shown=0;function renderMore(){const batch=found.slice(shown,shown+20);results.insertAdjacentHTML('beforeend',batch.map(r=>`<article class="search-result"><small>${escapeHTML(r.type)}${r.type==='Новина'?' · '+escapeHTML(r.date):''}</small><h2><a href="${escapeHTML(r.url)}"${externalAttrs(r.url)}>${escapeHTML(r.title)}${r.url.startsWith('http')?' ↗':''}</a></h2><p>${escapeHTML((r.text||'').slice(0,220))}${r.text?.length>220?'…':''}</p></article>`).join(''));shown+=batch.length;if(shown<found.length)moreButton(results,renderMore);}renderMore();
  }catch{if(id===request)status.textContent='Не вдалося завантажити пошук. Перевір з’єднання та натисни «Знайти» ще раз.';}
 }
 siteSearch.addEventListener('submit',e=>{e.preventDefault();search();});type.addEventListener('change',()=>search());input.addEventListener('input',()=>search());if(input.value)search(false);
}

const newsForm=document.querySelector('#news-filter');
if(newsForm){
 const input=document.querySelector('#news-query'),results=document.querySelector('#news-results'),status=document.querySelector('#news-status'),pagination=document.querySelector('#news-pagination');
 const original={html:results.innerHTML,status:status.textContent};let request=0;
 async function filterNews(){
  const id=++request,q=input.value.trim();
  if(!q){results.innerHTML=original.html;status.textContent=original.status;pagination.hidden=false;document.querySelector('#news-more')?.remove();return;}
  status.textContent='Шукаємо новини…';
  try{const index=await getIndex();if(id!==request)return;const found=index.filter(r=>r.type==='Новина'&&matches(r,q));results.replaceChildren();pagination.hidden=true;document.querySelector('#news-more')?.remove();status.textContent=found.length?`Знайдено новин: ${found.length}`:'Новин не знайдено. Спробуй інші слова.';
   let shown=0;const more=document.createElement('div');more.id='news-more';results.after(more);
   function renderMore(){results.insertAdjacentHTML('beforeend',found.slice(shown,shown+12).map(r=>`<article class="news-card"><a class="news-image" href="${escapeHTML(r.url)}">${r.image?`<img src="${escapeHTML(r.image)}" alt="${escapeHTML(r.title)}" width="640" height="430" loading="lazy">`:'<div class="news-placeholder">ВСП ФКБАД Поліського університету</div>'}</a><div class="news-meta"><time datetime="${escapeHTML(r.iso)}">${escapeHTML(r.date)}</time><span>Життя коледжу</span></div><h3><a href="${escapeHTML(r.url)}">${escapeHTML(r.title)}</a></h3><p class="news-excerpt"><span>${escapeHTML(r.text)}</span></p><a class="text-link" href="${escapeHTML(r.url)}">Читати новину →</a></article>`).join(''));shown+=12;if(shown<found.length)moreButton(more,renderMore);}renderMore();
  }catch{if(id===request)status.textContent='Не вдалося завантажити новини. Перевір з’єднання та повтори пошук.';}
 }
 newsForm.addEventListener('submit',e=>{e.preventDefault();filterNews();});input.addEventListener('input',()=>filterNews());
}

// Original typewriter treatment for empty search fields: type, pause, then erase.
function startTypewriter(input,phrases){
 if(!input||input.value)return;
 const fallback=input.placeholder;let phrase=0,position=0,deleting=false,stopped=false,timer;
 const stop=()=>{stopped=true;clearTimeout(timer);input.placeholder=fallback;};
 const resume=()=>{if(input.value)return;stopped=false;position=0;deleting=false;tick();};
 input.addEventListener('focus',stop);input.addEventListener('input',stop);input.addEventListener('blur',resume);
 function tick(){if(stopped||input.value)return;const text=phrases[phrase];position+=deleting?-1:1;input.placeholder=text.slice(0,position);let delay=deleting?38:72;
  if(!deleting&&position>=text.length){deleting=true;delay=1450;}else if(deleting&&position<=0){deleting=false;phrase=(phrase+1)%phrases.length;delay=280;}
  timer=setTimeout(tick,delay);
 }
 tick();
}
document.querySelectorAll('.header-search input').forEach(input=>startTypewriter(input,['Пошук на сайті','Знайди потрібний розділ','Наприклад, розклад…']));
startTypewriter(document.querySelector('#site-query'),['Наприклад, розклад…','Знайди новину або документ']);
startTypewriter(document.querySelector('#news-query'),['Пошук у новинах…','Знайди подію або досягнення']);

// Animate the characters the visitor actually types, while keeping the native input for editing and accessibility.
function bindTypedInput(input){
 if(!input)return;const host=input.closest('.header-search,.search-field');if(!host)return;
 const echo=document.createElement('span');echo.className='typed-echo';echo.setAttribute('aria-hidden','true');host.append(echo);
 let previous='';
 function render(value){
  if(!value){host.classList.remove('has-typed-text');echo.replaceChildren();previous='';return;}
  host.classList.add('has-typed-text');const chars=[...value],old=[...previous];let start=0;while(start<chars.length&&start<old.length&&chars[start]===old[start])start++;
  const fragment=document.createDocumentFragment();chars.forEach((char,index)=>{const letter=document.createElement('span');letter.textContent=char===' '?'\u00a0':char;if(index>=start){letter.className='typed-letter typed-letter-new';letter.style.setProperty('--typed-index',index-start);}fragment.append(letter);});echo.replaceChildren(fragment);previous=value;
 }
 input.addEventListener('input',()=>render(input.value));input.addEventListener('focus',()=>render(input.value));render(input.value);
}
document.querySelectorAll('.header-search input,.search-field input').forEach(bindTypedInput);

document.querySelector('[data-share]')?.addEventListener('click',async()=>{
 const status=document.querySelector('.share-status');
 try{if(navigator.share){await navigator.share({title:document.title,url:location.href});}else if(navigator.clipboard){await navigator.clipboard.writeText(location.href);status.textContent='Посилання скопійовано';}else{status.textContent='Скопіюй посилання з адресного рядка.';}}catch(error){if(error.name!=='AbortError')status.textContent='Скопіюй посилання з адресного рядка.';}
});

document.querySelector('[data-load-map]')?.addEventListener('click',event=>{
 const container=event.currentTarget.closest('[data-map-src]');if(!container)return;
 const frame=document.createElement('iframe');frame.title='Панорама біля ФКБАД у Google Maps';frame.src=container.dataset.mapSrc;frame.loading='lazy';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
 container.replaceChildren(frame);
});

document.querySelector('[data-clear-site-data]')?.addEventListener('click',async event=>{
 for(const key of ['fkbad-theme','fkbad.schedule.selection.v3','fkbad.schedule.data.v3']){try{localStorage.removeItem(key)}catch{}}
 try{sessionStorage.clear()}catch{}
 for(const domain of ['',`; domain=${location.hostname}`,`; domain=.${location.hostname}`])document.cookie=`googtrans=; path=/; max-age=0${domain}`;
 try{for(const key of await caches.keys())await caches.delete(key)}catch{}
 const status=document.querySelector('[data-clear-status]');if(status)status.textContent='Локальні налаштування та кеш цього сайту очищено.';event.currentTarget.disabled=true;
});

// Support old WordPress ID links while serving ordinary static HTML everywhere else.
const legacyParams=new URLSearchParams(location.search);const legacyId=legacyParams.get('page_id')||legacyParams.get('p');
if(legacyId&&/^\d+$/.test(legacyId)){fetch('/route-map.json').then(r=>r.ok?r.json():{}).then(routes=>{if(routes[legacyId])location.replace(routes[legacyId]);}).catch(()=>{});}
