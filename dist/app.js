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
// Alphabet navigation keeps the original links and nested sections intact.
const navigationTree=mobileNav?.querySelector('.navigation-tree');
if(navigationTree){
 const collator=new Intl.Collator('uk',{sensitivity:'base',numeric:true});
 const label=el=>(el.querySelector(':scope > summary,:scope > span')||el).textContent.trim();
 for(const children of navigationTree.querySelectorAll('.navigation-children')){
  const nodes=[...children.children];
  nodes.sort((a,b)=>label(a)==='Огляд розділу'?-1:label(b)==='Огляд розділу'?1:collator.compare(label(a),label(b)));
  children.append(...nodes);
 }
 const shortcuts=navigationTree.querySelector('.navigation-shortcuts');
 if(shortcuts){navigationTree.append(...shortcuts.children);shortcuts.remove();}
 const entries=[...navigationTree.children].sort((a,b)=>collator.compare(label(a),label(b)));
 navigationTree.append(...entries);
 const letterOf=el=>label(el).charAt(0).toLocaleUpperCase('uk');
 const desktopMenu=matchMedia('(min-width:1001px)');
 const flatCatalog=document.createElement('div');flatCatalog.className='navigation-flat';flatCatalog.hidden=true;
 const flatEntries=[],seenFlat=new Set();
 for(const original of navigationTree.querySelectorAll('a,.navigation-unavailable')){
  const item=original.cloneNode(true);item.removeAttribute('id');
  if(original.matches('a')&&label(original)==='Огляд розділу')item.textContent=label(original.closest('details'));
  const key=label(item)+'|'+(item.getAttribute('href')||'');if(seenFlat.has(key))continue;seenFlat.add(key);
  flatEntries.push(item);
 }
 flatEntries.sort((a,b)=>collator.compare(label(a),label(b)));flatCatalog.append(...flatEntries);
 const flatLetter=el=>/^\d/.test(label(el))?'#':letterOf(el);
 const topLetters=[...new Set(entries.map(letterOf))];
 const allLetters=[...new Set(flatEntries.map(flatLetter))].sort(collator.compare);

 const shell=document.createElement('div');shell.className='navigation-browser';
 const toolbar=document.createElement('div');toolbar.className='navigation-toolbar';
 const heading=document.createElement('strong');heading.textContent='Усі розділи';heading.setAttribute('aria-live','polite');
 const reset=document.createElement('button');reset.type='button';reset.textContent='Усі розділи';reset.hidden=true;
 toolbar.append(heading,reset);
 const rail=document.createElement('div');rail.className='navigation-alphabet';rail.setAttribute('role','group');rail.setAttribute('aria-label','Розділи за абеткою');
 const bubble=document.createElement('span');bubble.className='navigation-letter-preview';bubble.setAttribute('aria-hidden','true');
 const buttons=[];let selected='*';
 function selectLetter(value){
  selected=value;
  const flatMode=!desktopMenu.matches&&value!=='*';
  catalog.hidden=flatMode;flatCatalog.hidden=!flatMode;
  for(const entry of entries)entry.hidden=!flatMode&&value!=='*'&&letterOf(entry)!==value;
  for(const entry of flatEntries)entry.hidden=flatMode&&flatLetter(entry)!==value;
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.letter===value));
  heading.textContent=value==='*'?'Усі розділи':`${flatMode?'Усі пункти':'Розділи'} на «${value}»`;
  reset.hidden=value==='*';navigationTree.scrollTop=0;
  bubble.textContent=value==='*'?'Усі':value;
 }
 function buildAlphabet(){
 buttons.length=0;rail.replaceChildren();
 const letters=desktopMenu.matches?topLetters:allLetters;
 rail.style.setProperty('--letter-count',letters.length+1);
 for(const value of ['*',...letters]){
  const button=document.createElement('button');button.type='button';button.dataset.letter=value;button.textContent=value==='*'?'•':value;
  button.setAttribute('aria-label',value==='*'?'Усі розділи':`Розділи на літеру ${value}`);
  button.setAttribute('aria-pressed',String(value==='*'));button.setAttribute('aria-controls','navigation-sections');
  button.addEventListener('click',()=>selectLetter(value));buttons.push(button);rail.append(button);
 }
 }
 buildAlphabet();
 reset.addEventListener('click',()=>selectLetter('*'));
 rail.addEventListener('keydown',event=>{
  const index=buttons.indexOf(document.activeElement);if(index<0)return;
  const next=event.key==='ArrowDown'?Math.min(index+1,buttons.length-1):event.key==='ArrowUp'?Math.max(index-1,0):event.key==='Home'?0:event.key==='End'?buttons.length-1:-1;
  if(next<0)return;event.preventDefault();buttons[next].focus();selectLetter(buttons[next].dataset.letter);
 });
 const choose=event=>{
  const index=Math.max(0,Math.min(buttons.length-1,Math.floor((event.clientY-rail.getBoundingClientRect().top)/rail.clientHeight*buttons.length)));
  selectLetter(buttons[index].dataset.letter);bubble.textContent=index?buttons[index].dataset.letter:'Усі';
  bubble.style.top=`${buttons[index].offsetTop+buttons[index].offsetHeight/2}px`;
 };
 rail.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();rail.setPointerCapture(event.pointerId);shell.classList.add('is-browsing');choose(event);});
 rail.addEventListener('pointermove',event=>{if(rail.hasPointerCapture(event.pointerId))choose(event);});
 const finish=event=>{if(rail.hasPointerCapture(event.pointerId))rail.releasePointerCapture(event.pointerId);shell.classList.remove('is-browsing');};
 rail.addEventListener('pointerup',finish);rail.addEventListener('pointercancel',finish);rail.addEventListener('lostpointercapture',()=>shell.classList.remove('is-browsing'));
 navigationTree.id='navigation-sections';navigationTree.before(toolbar,shell);shell.append(navigationTree,rail,bubble);mobileNav.classList.add('has-alphabet');
 const catalog=document.createElement('div');catalog.className='navigation-catalog';catalog.append(...entries);navigationTree.append(catalog,flatCatalog);
 const pane=document.createElement('section');pane.className='navigation-detail';pane.id='navigation-detail';pane.setAttribute('aria-label','Підрозділи обраної категорії');
 const sidebar=document.createElement('div');sidebar.className='navigation-master';shell.prepend(sidebar);sidebar.append(navigationTree,rail,bubble);shell.append(pane);
 let activeGroup=null,movedChildren=null;
 const restore=()=>{if(activeGroup&&movedChildren)activeGroup.append(movedChildren);activeGroup=null;movedChildren=null;};
 const resetDirectory=()=>{
  restore();for(const group of catalog.querySelectorAll('details')){group.open=false;group.removeAttribute('data-selected');group.querySelector(':scope > summary')?.removeAttribute('aria-expanded');}
  pane.replaceChildren();const hint=document.createElement('p');hint.className='navigation-detail-hint';hint.textContent='Обери розділ ліворуч, щоб переглянути його підкатегорії';pane.append(hint);
 };
 const openGroup=group=>{
  if(!desktopMenu.matches){group.open=true;return;}
  restore();
  const lineage=[];for(let node=group;node&&node!==catalog;node=node.parentElement)if(node.tagName==='DETAILS')lineage.unshift(node);
  for(const other of catalog.querySelectorAll('details')){other.open=false;other.removeAttribute('data-selected');other.querySelector(':scope > summary')?.setAttribute('aria-expanded','false');}
  group.dataset.selected='true';group.querySelector(':scope > summary').setAttribute('aria-expanded','true');
  pane.replaceChildren();
  const trail=document.createElement('div');trail.className='navigation-detail-trail';
  for(const parent of lineage.slice(0,-1)){const back=document.createElement('button');back.type='button';back.textContent=label(parent);back.addEventListener('click',()=>openGroup(parent));trail.append(back);}
  const title=document.createElement('h2');title.textContent=label(group);title.tabIndex=-1;
  pane.append(trail,title);activeGroup=group;movedChildren=group.querySelector(':scope > .navigation-children');if(movedChildren)pane.append(movedChildren);
  pane.scrollTop=0;
 };
 mobileNav.addEventListener('click',event=>{const summary=event.target.closest('summary');if(!summary||!desktopMenu.matches)return;event.preventDefault();openGroup(summary.parentElement);});
 mobileNav.openDirectoryGroup=openGroup;mobileNav.resetDirectory=resetDirectory;
 resetDirectory();desktopMenu.addEventListener('change',()=>{resetDirectory();buildAlphabet();selectLetter('*');});

}
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
 clearTimeout(menuTimer);cancelAnimationFrame(menuFrame);savedScroll=window.scrollY;mobileNav.resetDirectory?.();mobileNav.hidden=false;mobileNav.inert=false;
 menuButton.setAttribute('aria-expanded','true');menuButton.setAttribute('aria-label','Закрити меню');document.body.classList.add('menu-open');
 document.documentElement.classList.add('menu-locked');menuBackdrop.hidden=false;menuBackdrop.style.pointerEvents='';
 document.querySelectorAll('main,.footer,.utility,.back-top').forEach(el=>el.inert=true);
 menuFrame=requestAnimationFrame(()=>{menuFrame=requestAnimationFrame(()=>{mobileNav.classList.add('is-open');menuBackdrop.classList.add('is-open');});});
});
mobileNav?.querySelectorAll('a').forEach((a,i)=>{a.style.setProperty('--menu-index',i);a.addEventListener('click',closeMenu);});
document.addEventListener('keydown',event=>{
 if(event.key!=='Tab'||menuButton?.getAttribute('aria-expanded')!=='true')return;
 const items=[...document.querySelector('.header-inner').querySelectorAll('a,button,input'),...mobileNav.querySelectorAll('a,button,input,summary'),...document.querySelectorAll('.header-search-results:not([hidden]) a,.header-search-results:not([hidden]) button')].filter(el=>el.getClientRects().length);
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
document.querySelectorAll('.header-search').forEach((form,index)=>{
 const input=form.querySelector('input');
 const panel=document.createElement('div');panel.className='header-search-results';panel.id=`header-results-${index}`;panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Результати пошуку');document.body.append(panel);
 input.setAttribute('aria-controls',panel.id);input.setAttribute('aria-expanded','false');
 let request=0;
 const hide=()=>{request++;panel.hidden=true;input.setAttribute('aria-expanded','false');};
 const position=()=>{const rect=form.getBoundingClientRect();panel.style.left=`${Math.max(10,Math.min(rect.left,innerWidth-Math.min(560,innerWidth-20)-10))}px`;panel.style.top=`${rect.bottom+8}px`;panel.style.width=`${Math.min(560,innerWidth-20)}px`;panel.style.maxHeight=`${Math.max(100,innerHeight-rect.bottom-20)}px`;};
 const show=()=>{position();panel.hidden=false;input.setAttribute('aria-expanded','true');};
 async function search(){
  const query=input.value.trim(),ticket=++request;
  if(!query){hide();return;}
  panel.innerHTML='<p role="status">Шукаємо…</p>';show();
  try{
   const records=await getIndex();if(ticket!==request)return;
   const seen=new Set();
   const results=records.filter(record=>matches(record,query)).sort((a,b)=>Number(norm(b.title).includes(norm(query)))-Number(norm(a.title).includes(norm(query)))||Number(b.type==='Розділ')-Number(a.type==='Розділ')).filter(record=>{if(seen.has(record.url))return false;seen.add(record.url);return true;});
   panel.innerHTML=results.length?`<p role="status">Знайдено: ${results.length}</p>`+results.slice(0,10).map(record=>`<a href="${escapeHTML(record.url)}" ${externalAttrs(record.url)}><strong>${escapeHTML(record.title)}</strong><small>${escapeHTML(record.type)}</small></a>`).join(''):'<p role="status">Нічого не знайдено. Спробуй інше слово.</p>';
   if(results.length>10){const more=document.createElement('button');more.type='button';more.textContent='Показати всі результати';more.addEventListener('click',()=>{more.remove();panel.insertAdjacentHTML('beforeend',results.slice(10).map(record=>`<a href="${escapeHTML(record.url)}" ${externalAttrs(record.url)}><strong>${escapeHTML(record.title)}</strong><small>${escapeHTML(record.type)}</small></a>`).join(''));});panel.append(more);}
   position();
  }catch{if(ticket===request)panel.innerHTML='<p role="status">Не вдалося завантажити пошук. Спробуй ще раз.</p>';}
 }
 const schedule=debounce(()=>{if(form.contains(document.activeElement))search();},120);
 input.addEventListener('input',()=>{request++;if(!input.value.trim())hide();else schedule();});
 input.addEventListener('focus',()=>{if(input.value.trim())search();});
 form.addEventListener('submit',event=>{event.preventDefault();search();});
 input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&!panel.hidden){event.preventDefault();panel.querySelector('a,button')?.focus();}if(event.key==='Escape'){event.stopPropagation();hide();}});
 panel.addEventListener('keydown',event=>{const items=[...panel.querySelectorAll('a,button')],i=items.indexOf(document.activeElement);if(event.key==='Escape'){event.stopPropagation();hide();input.focus();hide();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const next=i+(event.key==='ArrowDown'?1:-1);if(next<0)input.focus();else items[Math.min(next,items.length-1)]?.focus();}});
 panel.addEventListener('click',event=>{const link=event.target.closest('a');if(link){hide();closeMenu();const destination=new URL(link.href);if(destination.origin===location.origin&&destination.pathname===location.pathname&&destination.hash.startsWith('#menu-')&&destination.hash===location.hash){event.preventDefault();openMenuSearchTarget();}}});
 document.addEventListener('pointerdown',event=>{if(!form.contains(event.target)&&!panel.contains(event.target))hide();});
 document.addEventListener('focusin',event=>{if(!form.contains(event.target)&&!panel.contains(event.target))hide();});
 window.addEventListener('resize',()=>{if(!panel.hidden)position();});
 window.addEventListener('scroll',()=>{if(!panel.hidden)position();},true);
});
function openMenuSearchTarget(){
 if(!location.hash.startsWith('#menu-'))return;
 const target=document.getElementById(location.hash.slice(1));if(!target||!mobileNav?.contains(target))return;
 if(menuButton.getAttribute('aria-expanded')!=='true')menuButton.click();
 mobileNav.querySelector('[data-letter="*"]')?.click();
 if(matchMedia('(min-width:1001px)').matches){const group=target.matches('details')?target:target.closest('details');if(group)mobileNav.openDirectoryGroup?.(group);}
 else{let ancestor=target;while(ancestor&&ancestor!==mobileNav){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}}
 setTimeout(()=>{const visible=target.getClientRects().length?target:mobileNav.querySelector('.navigation-detail h2');visible?.scrollIntoView({block:'nearest'});const focus=visible?.querySelector('summary,a')||visible;if(focus){if(!focus.matches('summary,a'))focus.tabIndex=-1;focus.focus({preventScroll:true});}},550);
}
window.addEventListener('hashchange',openMenuSearchTarget);
openMenuSearchTarget();


const documentForm=document.querySelector('#document-filter');
if(documentForm){
 const input=document.querySelector('#document-query'),rows=[...document.querySelectorAll('.document-row')];
 function filterDocuments(){let count=0;for(const row of rows){const visible=norm(row.textContent).includes(norm(input.value));row.hidden=!visible;if(visible)count++;}document.querySelector('#document-status').textContent=`Знайдено документів: ${count}`;document.querySelector('#document-empty').hidden=count>0;}
 input.addEventListener('input',()=>filterDocuments());documentForm.addEventListener('submit',e=>{e.preventDefault();filterDocuments();});document.querySelector('#reset-documents')?.addEventListener('click',()=>{documentForm.reset();filterDocuments();input.focus();});
}

function moreButton(container,callback){const b=document.createElement('button');b.type='button';b.className='button load-more';b.textContent='Показати ще';b.addEventListener('click',()=>{b.remove();callback();});container.append(b);}
const siteSearch=document.querySelector('#site-search');
if(siteSearch){
 const input=document.querySelector('#site-query'),results=document.querySelector('#search-results'),status=document.querySelector('#search-status');
 const params=new URLSearchParams(location.hash.slice(1)||location.search);input.value=params.get('q')||'';
 let request=0;
 async function search(updateURL=true){
  const id=++request,q=input.value.trim();results.replaceChildren();
  if(!q){status.textContent='Введи назву або ключове слово.';return;}
  if(updateURL){const p=new URLSearchParams({q});history.replaceState(null,'','#'+p);}
  status.textContent='Шукаємо матеріали…';
  try{const index=await getIndex();if(id!==request)return;const found=index.filter(r=>matches(r,q)).sort((a,b)=>Number(norm(b.title).includes(norm(q)))-Number(norm(a.title).includes(norm(q))));status.textContent=found.length?`Знайдено матеріалів: ${found.length}`:'Нічого не знайдено. Спробуй інше слово.';
   let shown=0;function renderMore(){const batch=found.slice(shown,shown+20);results.insertAdjacentHTML('beforeend',batch.map(r=>`<article class="search-result"><small>${escapeHTML(r.type)}${r.type==='Новина'?' · '+escapeHTML(r.date):''}</small><h2><a href="${escapeHTML(r.url)}"${externalAttrs(r.url)}>${escapeHTML(r.title)}${r.url.startsWith('http')?' ↗':''}</a></h2><p>${escapeHTML((r.text||'').slice(0,220))}${r.text?.length>220?'…':''}</p></article>`).join(''));shown+=batch.length;if(shown<found.length)moreButton(results,renderMore);}renderMore();
  }catch{if(id===request)status.textContent='Не вдалося завантажити пошук. Перевір з’єднання та натисни «Знайти» ще раз.';}
 }
 siteSearch.addEventListener('submit',e=>{e.preventDefault();search();});input.addEventListener('input',()=>search());if(input.value)search(false);
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
 let previous='',removeTimer;
 function render(value){
  clearTimeout(removeTimer);echo.querySelectorAll('.typed-letter-removing').forEach(letter=>letter.remove());
  if(!value){host.classList.remove('has-typed-text');const oldLetters=[...echo.children];oldLetters.forEach((letter,index)=>{letter.className='typed-letter typed-letter-removing';letter.style.setProperty('--scatter-x',`${(index%2?-1:1)*(18+Math.random()*28)}px`);letter.style.setProperty('--scatter-y',`${-12-Math.random()*25}px`);letter.style.setProperty('--scatter-r',`${(index%2?-1:1)*(10+Math.random()*25)}deg`);});removeTimer=setTimeout(()=>echo.replaceChildren(),520);previous='';return;}
  host.classList.add('has-typed-text');const chars=[...value],old=[...previous];let start=0;while(start<chars.length&&start<old.length&&chars[start]===old[start])start++;
  const fragment=document.createDocumentFragment();chars.forEach((char,index)=>{const letter=document.createElement('span');letter.textContent=char===' '?'\u00a0':char;if(index>=start){letter.className='typed-letter typed-letter-new';letter.style.setProperty('--typed-index',index-start);}fragment.append(letter);});
  if(old.length>chars.length){old.slice(chars.length).forEach((char,index)=>{const letter=document.createElement('span');letter.className='typed-letter typed-letter-removing';letter.textContent=char===' '?'\u00a0':char;letter.style.setProperty('--scatter-x',`${(index%2?-1:1)*(18+Math.random()*28)}px`);letter.style.setProperty('--scatter-y',`${-12-Math.random()*25}px`);letter.style.setProperty('--scatter-r',`${(index%2?-1:1)*(10+Math.random()*25)}deg`);fragment.append(letter);});}
  echo.replaceChildren(fragment);if(old.length>chars.length)removeTimer=setTimeout(()=>echo.querySelectorAll('.typed-letter-removing').forEach(letter=>letter.remove()),520);previous=value;
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
