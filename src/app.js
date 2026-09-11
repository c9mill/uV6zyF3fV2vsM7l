const actions=document.querySelector('.header-actions');
const translateRoot=document.createElement('div');translateRoot.id='google_translate_element';translateRoot.hidden=true;document.body.appendChild(translateRoot);
window.googleTranslateElementInit=()=>new google.translate.TranslateElement({pageLanguage:'uk',includedLanguages:'uk,en',autoDisplay:false},'google_translate_element');
const translateScript=document.createElement('script');translateScript.src='https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';translateScript.async=true;document.head.appendChild(translateScript);
if(actions&&!actions.querySelector('.language-toggle')){const languageButton=document.createElement('button');languageButton.className='icon-button language-toggle';languageButton.type='button';languageButton.textContent='EN';languageButton.title='English';languageButton.setAttribute('aria-label','Перемкнути мову');languageButton.addEventListener('click',()=>{const select=document.querySelector('.goog-te-combo');if(!select)return;const english=languageButton.dataset.lang!=='en';select.value=english?'en':'uk';select.dispatchEvent(new Event('change'));languageButton.dataset.lang=english?'en':'uk';languageButton.textContent=english?'УКР':'EN'});actions.insertBefore(languageButton,actions.firstElementChild)}
const menuButton=document.querySelector('.menu-toggle');
const mobileNav=document.querySelector('#mobile-nav');
const headerSearch=document.querySelector('.header-search');
const headerRow=document.querySelector('.header-inner');
const compactHeader=matchMedia('(max-width: 720px)');
function placeHeaderSearch(){
 if(!headerSearch||!mobileNav||!headerRow)return;
 if(compactHeader.matches)mobileNav.prepend(headerSearch);
 else headerRow.insertBefore(headerSearch,actions);
}
placeHeaderSearch();
compactHeader.addEventListener('change',()=>{closeMenu();placeHeaderSearch();});
const menuBackdrop=document.createElement('button');
menuBackdrop.className='menu-backdrop';menuBackdrop.type='button';menuBackdrop.hidden=true;
menuBackdrop.tabIndex=-1;menuBackdrop.setAttribute('aria-label','Закрити меню');
document.querySelector('.site-header')?.before(menuBackdrop);
menuBackdrop.addEventListener('click',()=>{closeMenu();menuButton?.focus();});
let menuTimer, savedScroll=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function closeMenu(){
 if(!menuButton||menuButton.getAttribute('aria-expanded')!=='true')return;
 clearTimeout(menuTimer);mobileNav.classList.remove('is-open');mobileNav.inert=true;
 menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Відкрити меню');
 document.body.classList.remove('menu-open');document.documentElement.classList.remove('menu-locked');menuBackdrop.hidden=true;
 document.querySelectorAll('main,.footer,.utility,.back-top').forEach(el=>el.inert=false);
 const previous=document.documentElement.style.scrollBehavior;document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,savedScroll);document.documentElement.style.scrollBehavior=previous;
 menuTimer=setTimeout(()=>{mobileNav.hidden=true;},reducedMotion.matches?0:340);
}
menuButton?.addEventListener('click',()=>{
 if(menuButton.getAttribute('aria-expanded')==='true'){closeMenu();return;}
 clearTimeout(menuTimer);savedScroll=window.scrollY;mobileNav.hidden=false;mobileNav.inert=false;
 menuButton.setAttribute('aria-expanded','true');menuButton.setAttribute('aria-label','Закрити меню');document.body.classList.add('menu-open');
 document.documentElement.classList.add('menu-locked');menuBackdrop.hidden=false;
 document.querySelectorAll('main,.footer,.utility,.back-top').forEach(el=>el.inert=true);
 requestAnimationFrame(()=>requestAnimationFrame(()=>mobileNav.classList.add('is-open')));
});
mobileNav?.querySelectorAll('a').forEach((a,i)=>{a.style.setProperty('--menu-index',i);a.addEventListener('click',closeMenu);});
document.addEventListener('keydown',event=>{
 if(event.key!=='Tab'||menuButton?.getAttribute('aria-expanded')!=='true')return;
 const items=[...document.querySelector('.header-inner').querySelectorAll('a,button,input'),...mobileNav.querySelectorAll('a,button,input')].filter(el=>el.getClientRects().length);
 const first=items[0],last=items.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuButton?.getAttribute('aria-expanded')==='true'){closeMenu();menuButton.focus();}});
matchMedia('(min-width: 1001px)').addEventListener('change',closeMenu);

const norm=text=>(text||'').toLocaleLowerCase('uk').replace(/[’ʼ`]/g,"'").replace(/\s+/g,' ').trim();
const escapeHTML=text=>String(text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const externalAttrs=url=>url.startsWith('http')?' target="_blank" rel="noopener noreferrer"':'';
const matches=(record,query)=>norm(query).split(' ').filter(Boolean).every(word=>norm(record.title+' '+record.text).includes(word));
let indexPromise;
function getIndex(){return indexPromise??=(fetch('/search-index.json').then(r=>{if(!r.ok)throw Error('load');return r.json();}).catch(e=>{indexPromise=null;throw e;}));}
function debounce(fn,delay=180){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay);};}

const documentForm=document.querySelector('#document-filter');
if(documentForm){
 const input=document.querySelector('#document-query'),category=document.querySelector('#document-category'),rows=[...document.querySelectorAll('.document-row')];
 function filterDocuments(){let count=0;for(const row of rows){const visible=norm(row.textContent).includes(norm(input.value))&&(!category.value||row.dataset.category===category.value);row.hidden=!visible;if(visible)count++;}document.querySelector('#document-status').textContent=`Знайдено документів: ${count}`;document.querySelector('#document-empty').hidden=count>0;}
 input.addEventListener('input',debounce(filterDocuments));category.addEventListener('change',filterDocuments);documentForm.addEventListener('submit',e=>{e.preventDefault();filterDocuments();});document.querySelector('#reset-documents').addEventListener('click',()=>{documentForm.reset();filterDocuments();input.focus();});
}

function moreButton(container,callback){const b=document.createElement('button');b.type='button';b.className='button load-more';b.textContent='Показати ще';b.addEventListener('click',()=>{b.remove();callback();});container.append(b);}
const siteSearch=document.querySelector('#site-search');
if(siteSearch){
 const input=document.querySelector('#site-query'),type=document.querySelector('#search-type'),results=document.querySelector('#search-results'),status=document.querySelector('#search-status');
 const params=new URLSearchParams(location.search);input.value=params.get('q')||'';type.value=params.get('type')||'';
 let request=0;
 async function search(updateURL=true){
  const id=++request,q=input.value.trim(),kind=type.value;results.replaceChildren();
  if(!q){status.textContent='Введи назву або ключове слово.';return;}
  if(updateURL){const p=new URLSearchParams({q});if(kind)p.set('type',kind);history.replaceState(null,'','?'+p);}
  status.textContent='Шукаємо матеріали…';
  try{const index=await getIndex();if(id!==request)return;const found=index.filter(r=>(!kind||r.type===kind)&&matches(r,q)).sort((a,b)=>Number(norm(b.title).includes(norm(q)))-Number(norm(a.title).includes(norm(q))));status.textContent=found.length?`Знайдено матеріалів: ${found.length}`:'Нічого не знайдено. Спробуй інше слово або зміни тип матеріалу.';
   let shown=0;function renderMore(){const batch=found.slice(shown,shown+20);results.insertAdjacentHTML('beforeend',batch.map(r=>`<article class="search-result"><small>${escapeHTML(r.type)}${r.type==='Новина'?' · '+escapeHTML(r.date):''}</small><h2><a href="${escapeHTML(r.url)}"${externalAttrs(r.url)}>${escapeHTML(r.title)}${r.url.startsWith('http')?' ↗':''}</a></h2><p>${escapeHTML((r.text||'').slice(0,220))}${r.text?.length>220?'…':''}</p></article>`).join(''));shown+=batch.length;if(shown<found.length)moreButton(results,renderMore);}renderMore();
  }catch{if(id===request)status.textContent='Не вдалося завантажити пошук. Перевір з’єднання та натисни «Знайти» ще раз.';}
 }
 siteSearch.addEventListener('submit',e=>{e.preventDefault();search();});type.addEventListener('change',()=>search());if(input.value)search(false);
}

const newsForm=document.querySelector('#news-filter');
if(newsForm){
 const input=document.querySelector('#news-query'),year=document.querySelector('#news-year'),results=document.querySelector('#news-results'),status=document.querySelector('#news-status'),pagination=document.querySelector('#news-pagination');
 const original={html:results.innerHTML,status:status.textContent};let request=0;
 async function filterNews(){
  const id=++request,q=input.value.trim(),y=year.value;
  if(!q&&!y){results.innerHTML=original.html;status.textContent=original.status;pagination.hidden=false;document.querySelector('#news-more')?.remove();return;}
  status.textContent='Шукаємо новини…';
  try{const index=await getIndex();if(id!==request)return;const found=index.filter(r=>r.type==='Новина'&&(!y||r.iso.startsWith(y))&&matches(r,q));results.replaceChildren();pagination.hidden=true;document.querySelector('#news-more')?.remove();status.textContent=found.length?`Знайдено новин: ${found.length}`:'Новин не знайдено. Спробуй інші слова або обери всі роки.';
   let shown=0;const more=document.createElement('div');more.id='news-more';results.after(more);
   function renderMore(){results.insertAdjacentHTML('beforeend',found.slice(shown,shown+12).map(r=>`<article class="news-card"><a class="news-image" href="${escapeHTML(r.url)}">${r.image?`<img src="${escapeHTML(r.image)}" alt="${escapeHTML(r.title)}" width="640" height="430" loading="lazy">`:'<div class="news-placeholder">ФКБАД</div>'}</a><div class="news-meta"><time datetime="${escapeHTML(r.iso)}">${escapeHTML(r.date)}</time><span>Життя коледжу</span></div><h3><a href="${escapeHTML(r.url)}">${escapeHTML(r.title)}</a></h3><a class="text-link" href="${escapeHTML(r.url)}">Читати новину →</a></article>`).join(''));shown+=12;if(shown<found.length)moreButton(more,renderMore);}renderMore();
  }catch{if(id===request)status.textContent='Не вдалося завантажити новини. Перевір з’єднання та повтори пошук.';}
 }
 newsForm.addEventListener('submit',e=>{e.preventDefault();filterNews();});year.addEventListener('change',filterNews);input.addEventListener('input',debounce(filterNews,250));
}

document.querySelector('[data-share]')?.addEventListener('click',async()=>{
 const status=document.querySelector('.share-status');
 try{if(navigator.share){await navigator.share({title:document.title,url:location.href});}else if(navigator.clipboard){await navigator.clipboard.writeText(location.href);status.textContent='Посилання скопійовано';}else{status.textContent='Скопіюй посилання з адресного рядка.';}}catch(error){if(error.name!=='AbortError')status.textContent='Скопіюй посилання з адресного рядка.';}
});

// Support old WordPress ID links while serving ordinary static HTML everywhere else.
const legacyParams=new URLSearchParams(location.search);const legacyId=legacyParams.get('page_id')||legacyParams.get('p');
if(legacyId&&/^\d+$/.test(legacyId)){fetch('/route-map.json').then(r=>r.ok?r.json():{}).then(routes=>{if(routes[legacyId])location.replace(routes[legacyId]);}).catch(()=>{});}
