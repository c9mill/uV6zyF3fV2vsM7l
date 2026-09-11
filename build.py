"""Generate the college website from the supplied WordPress export. No WP runtime."""
from pathlib import Path
from urllib.parse import urlparse, unquote, quote
from html import escape, unescape
from datetime import datetime
import hashlib, json, re, shutil, sys
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
EXPORT = ROOT.parent / 'fkbad_migrator/fkbad_export_lean'
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
(OUT / 'assets').mkdir(exist_ok=True)
def read(name): return json.loads((EXPORT / name).read_text(encoding='utf-8'))
PAGES = read('backend/pages.json')
POSTS = sorted(read('backend/posts.json'), key=lambda x:x['date'], reverse=True)
MEDIA = {x['id']:x for x in read('backend/media.json')}
MANIFEST = read('media_manifest.json')
MENUS = read('menus.json')[0]['tree']
BY_ID = {p['id']:p for p in PAGES + POSTS}
NAME = 'Фаховий коледж будівництва, архітектури та дизайну'
FULL_NAME = NAME + ' Поліського національного університету'
MONTHS = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня']
ROUTES = {308:'/',625:'/',307:'/новини/',592:'/про-коледж/',593:'/вступнику/',594:'/студенту/'}
for p in PAGES + POSTS:
    ROUTES.setdefault(p['id'], unquote(urlparse(p['link']).path))
URLS = {unquote(urlparse(p['link']).path).rstrip('/') or '/':ROUTES[p['id']] for p in PAGES + POSTS}
URLS['/головна'] = '/'

def clean_text(html):
    s = BeautifulSoup(html, 'html.parser')
    for t in s(['style','script']): t.decompose()
    return re.sub(r'\s+', ' ', s.get_text(' ', strip=True)).strip()
def title(p):
    t = clean_text(p['title']['rendered'])
    if not t:
        s = BeautifulSoup(p['content']['rendered'], 'html.parser')
        h = s.find(re.compile('^h[1-6]$'))
        t = h.get_text(' ',strip=True) if h else unquote(p['slug']).replace('-',' ')
    if t.isupper(): t = t.capitalize()
    return t
def norm(u):
    return re.sub(r'-\d+x\d+(?=\.[^.]+$)', '', unquote(urlparse(u).path)).lower()
ASSETS = {}
for m in MANIFEST:
    for u in [m['original_url'],m.get('final_url','')] + m.get('aliases',[]):
        if u: ASSETS[norm(u)] = m
COPIED = {}
def asset(url):
    if not url: return ''
    m = ASSETS.get(norm(url))
    if not m: return ''
    source = EXPORT / m['local_file']
    if not source.is_file(): return ''
    if m['local_file'] in COPIED: return COPIED[m['local_file']]
    name = hashlib.sha1(m['local_file'].encode()).hexdigest()[:16]
    existing = OUT / 'assets' / (name+'.webp')
    if existing.exists():
        result='/assets/'+existing.name
        COPIED[m['local_file']]=result
        return result
    try:
        with Image.open(source) as original:
            im = ImageOps.exif_transpose(original)
            im.thumbnail((1280,1280))
            if im.mode not in ('RGB','RGBA'): im = im.convert('RGBA' if 'transparency' in im.info else 'RGB')
            dest = OUT / 'assets' / (name+'.webp')
            if not dest.exists(): im.save(dest,'WEBP',quality=74,method=1)
    except (OSError,ValueError):
        return ''
    result = '/assets/'+dest.name
    COPIED[m['local_file']] = result
    return result
def photo(index): return asset(MANIFEST[index]['original_url'])
def featured(p):
    u = MEDIA.get(p.get('featured_media'),{}).get('source_url')
    result = asset(u)
    if result: return result
    s = BeautifulSoup(p['content']['rendered'],'html.parser')
    for i in s.select('img[src]'):
        result = asset(i['src'])
        if result: return result
    return ''
def local_url(u):
    if not u: return ''
    u = unescape(u).strip()
    parsed = urlparse(u)
    if parsed.scheme not in ('','http','https','mailto','tel'): return ''
    if parsed.netloc in ('2','localhost'): return ''
    if parsed.hostname and parsed.hostname.endswith('fkbad.com.ua'):
        path = unquote(parsed.path).rstrip('/') or '/'
        if path in URLS: return URLS[path]+('#'+parsed.fragment if parsed.fragment else '')
        media = asset(u)
        if media: return media
    if u.startswith('http://'): u = 'https://'+u[7:]
    return u
def icon(name):
    paths = {'arrow':'<path d="M5 12h14m-6-6 6 6-6 6"/>','external':'<path d="M7 17 17 7M7 7h10v10"/>','search':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>','menu':'<path d="M4 7h16M4 12h16M4 17h16"/>','close':'<path d="m6 6 12 12M6 18 18 6"/>','book':'<path d="M3 5c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2ZM12 7v14"/>','calendar':'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3"/>','file':'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 13h8m-8 4h6"/>','pin':'<path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>','phone':'<path d="M5 3H3c-1 10 8 19 18 18v-5l-5-2-2 3-7-7 3-2-2-5Z"/>','mail':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>','cap':'<path d="m2 9 10-5 10 5-10 5ZM6 11v6c4 3 8 3 12 0v-6m4-2v8"/>','chevron':'<path d="m8 10 4 4 4-4"/>'}
    return f'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths.get(name,paths["arrow"])}</svg>'
def link(u,label,cls=''):
    u = local_url(u)
    if not u: return ''
    external = u.startswith('https:')
    return f'<a href="{escape(u,quote=True)}" class="{cls}"'+(' target="_blank" rel="noopener noreferrer"' if external else '')+f'>{label}</a>'
def button(u,label,secondary=False): return link(u,escape(label)+icon('arrow'),'button'+(' secondary' if secondary else ''))
def date(p):
    d = datetime.fromisoformat(p['date'])
    return f'{d.day} {MONTHS[d.month-1]} {d.year}'
def menu(label): return next((x for x in MENUS if x['label'].upper()==label.upper()),{'children':[]})['children']
def flatten(items):
    for item in items:
        if item.get('url'): yield item
        yield from flatten(item.get('children',[]))
def menu_find(needle): return next((x for x in flatten(MENUS) if needle.lower() in x['label'].lower()),{})
SCHEDULE = '/розклад/'
RULES = menu_find('ПРАВИЛА ПРИЙОМУ НА НАВЧАННЯ У 2026').get('url','/вступнику/')
DATES = menu_find('Строки вступної кампанії').get('url','/вступнику/')
CAMPUS = photo(47)
ANNIVERSARY_SOURCE = ROOT/'src/assets/campus-80.jpg'
ANNIVERSARY = '/assets/campus-80-' + hashlib.sha256(ANNIVERSARY_SOURCE.read_bytes()).hexdigest()[:12] + '.jpg'
shutil.copy2(ANNIVERSARY_SOURCE, OUT/ANNIVERSARY.lstrip('/'))
LOGO = photo(1885)
FAVICON = '/favicon.webp'
logo_file = OUT / LOGO.lstrip('/') if LOGO else None
if logo_file and logo_file.is_file():
    # The exported logo has a wide transparent canvas. Make a square tab icon
    # so browsers cannot letterbox or visually stretch it in the tab strip.
    with Image.open(logo_file) as logo_image:
        logo_image = logo_image.convert('RGBA')
        alpha_box = logo_image.getchannel('A').getbbox()
        if alpha_box:
            logo_image = logo_image.crop(alpha_box).resize((192, 192), Image.Resampling.LANCZOS)
        logo_image.save(OUT / FAVICON.lstrip('/'), 'WEBP', quality=94, method=6)

def header(active=''):
    nav = [('/про-коледж/','Про коледж'),('/спеціальності/','Спеціальності'),('/студенту/','Студенту'),(SCHEDULE,'Розклад'),('/новини/','Новини'),('/контакти/','Контакти')]
    items = ''.join(f'<a href="{u}"'+(' aria-current="page"' if active==u else '')+f'>{t}</a>' for u,t in nav)
    desktop = items
    student_link = next(x+'</a>' for x in items.split('</a>') if 'href="/студенту/"' in x)
    desktop = desktop.replace(student_link, f'<div class="nav-group">{student_link}<button class="nav-expand" aria-label="Навчальні ресурси" aria-expanded="false" aria-controls="study-menu">{icon("chevron")}</button><div class="nav-dropdown" id="study-menu" inert><span class="eyebrow">Для твоїх планів</span><a href="/вступнику/">Вступнику {icon("arrow")}</a><a href="/бібліотека/">Бібліотека {icon("book")}</a><a href="/документи/">Документи {icon("file")}</a>{link(SCHEDULE,"Розклад занять "+icon("calendar"))}</div></div>')
    return f'''<a class="skip-link" href="#main">Перейти до вмісту</a>
    <header class="site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="ВСП Фаховий коледж будівництва, архітектури та дизайну — головна"><img src="{LOGO}" alt="" width="96" height="72"><span><strong>ВСП «Фаховий коледж будівництва, архітектури та дизайну»</strong></span></a>
    <nav class="desktop-nav" aria-label="Головна навігація">{desktop}</nav><form class="header-search" action="/пошук/" method="get" role="search" aria-label="Пошук на сайті" autocomplete="off"><button type="submit" aria-label="Знайти">{icon("search")}</button><input type="search" name="q" aria-label="Пошуковий запит" placeholder="Пошук на сайті" required autocomplete="off"></form><div class="header-actions"><button class="icon-button theme-toggle" type="button" aria-label="Увімкнути темну тему" aria-pressed="false" title="Увімкнути темну тему"><svg class="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><svg class="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg></button><a class="button compact" href="/вступнику/">Вступнику {icon('external')}</a><button class="icon-button menu-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="Відкрити меню"><span></span><span></span></button></div></div>
    <nav id="mobile-nav" class="mobile-nav container" aria-label="Мобільна навігація" hidden>{items}<a href="/вступнику/">Вступнику</a><a href="/документи/">Документи</a><a href="/викладачу/">Викладачу</a><a href="/пошук/">Пошук на сайті</a></nav></header>'''
def footer():
    return f'''<footer class="footer"><div class="container footer-grid"><div class="footer-brand"><a class="brand" href="/"><img src="{LOGO}" width="54" height="48" alt=""><strong>ФКБАД</strong></a><p>{FULL_NAME}</p><div class="socials"><a href="https://www.facebook.com/FKBAD" target="_blank" rel="noopener noreferrer">Фейсбук ↗</a><a href="https://t.me/FKBAD_PNY" target="_blank" rel="noopener noreferrer">Телеграм ↗</a><a href="https://www.instagram.com/fkbad_" target="_blank" rel="noopener noreferrer">Інстаграм ↗</a></div></div><div><h3>Навчання</h3><a href="/вступнику/">Вступнику</a><a href="/спеціальності/">Спеціальності</a><a href="/студенту/">Студенту</a>{link(SCHEDULE,'Розклад занять')}</div><div><h3>Коледж</h3><a href="/про-коледж/">Про коледж</a><a href="/новини/">Новини</a><a href="/документи/">Документи</a><a href="/контакти/">Контакти</a></div><div><h3>Завітай до нас</h3><p>10029, м. Житомир<br>вул. Степана Бандери, 6</p><a href="tel:+380412472847">(0412) 47-28-47</a><a href="mailto:bkzt@ukr.net">bkzt@ukr.net</a></div></div><div class="container footer-signature" aria-hidden="true">Твори майбутнє.</div><div class="container footer-bottom"><span>© 2026 ФКБАД Поліського національного університету</span><span>Освіта, що створює майбутнє.</span></div></footer>'''
THEME_INIT = "(()=>{let t;try{t=localStorage.getItem('fkbad-theme')}catch{}document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'})()"

def shell(title_text,body,path='/',description='',article=False):
    # Replace this campus photo only in institutional content, never in news.
    # Keep the original campus photo and overlay card on the homepage.
    # The anniversary artwork is used only on the informational subpages.
    if not article and path != '/' and CAMPUS in body:
        content = BeautifulSoup(body, 'html.parser')
        for img in content.select(f'img[src="{CAMPUS}"]'):
            if img.find_parent(class_='news-card'):
                continue
            img['src'] = ANNIVERSARY
            img['width'], img['height'] = 2400, 1350
            img['alt'] = '80 років Фахового коледжу будівництва, архітектури та дизайну'
            img['class'] = img.get('class', []) + ['campus-anniversary']
            parent_link = img.find_parent('a')
            if parent_link and (parent_link.get('href') == CAMPUS or norm(parent_link.get('href','')) == norm(MANIFEST[47]['original_url'])):
                parent_link['href'] = ANNIVERSARY
        body = str(content)
    desc = description or 'Спеціальності, вступ, новини та студентське життя Фахового коледжу будівництва, архітектури та дизайну в Житомирі.'
    return f'''<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>{THEME_INIT}</script><title>{escape(title_text)} — ФКБАД</title><meta name="description" content="{escape(desc[:180],quote=True)}"><meta property="og:title" content="{escape(title_text,quote=True)} — ФКБАД"><meta property="og:description" content="{escape(desc[:180],quote=True)}"><meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:locale" content="uk_UA"><meta name="theme-color" content="#204ed8"><link rel="icon" href="{FAVICON}" type="image/webp"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/experience.css"><script src="/app.js" defer></script><script src="/experience.js" defer></script></head><body class="{'home-page' if path=='/' else 'inner-page'}{' is-article' if article else ''}">{header(path)}<main id="main">{body}</main>{footer()}<button class="back-top icon-button" aria-label="Повернутися нагору" type="button">{icon("arrow")}</button></body></html>'''
WRITTEN = []
def write(path,content):
    for asset in ['styles.css','experience.css','app.js','experience.js','schedule.css','schedule.js']:
        revision = hashlib.sha256((ROOT/'src'/asset).read_bytes()).hexdigest()[:12]
        content = content.replace(f'"/{asset}"', f'"/{asset}?v={revision}"')
    content = content.replace('width=device-width, initial-scale=1"', 'width=device-width, initial-scale=1, viewport-fit=cover"')
    relative = unquote(path).strip('/')
    dest = OUT / relative / 'index.html' if relative else OUT / 'index.html'
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text('\n'.join(line.rstrip() for line in content.splitlines()),encoding='utf-8')
    WRITTEN.append(path)
def news_card(p):
    img = featured(p)
    width, height = 640, 430
    if img:
        with Image.open(OUT / img.lstrip('/')) as photo_file:
            width, height = photo_file.size
    ratio = max(.7, min(1.9, width / height))
    visual = f'<img src="{img}" alt="{escape(title(p),quote=True)}" loading="lazy" width="{width}" height="{height}">' if img else f'<div class="news-placeholder">{icon("book")}<span>ФКБАД</span></div>'
    excerpt = re.sub(r'\s+', ' ', clean_text(p['content']['rendered'])).strip()
    return f'<article class="news-card" style="--photo-weight:{ratio:.3f};--photo-basis:{210 * ratio:.1f}px"><a href="{ROUTES[p["id"]]}" class="news-image">{visual}</a><div class="news-meta"><time datetime="{p["date"][:10]}">{date(p)}</time><span>Життя коледжу</span></div><h3><a href="{ROUTES[p["id"]]}">{escape(title(p))}</a></h3><p class="news-excerpt"><span>{escape(excerpt)}</span></p><a class="text-link" href="{ROUTES[p["id"]]}">Читати новину {icon("arrow")}</a></article>'
PROGRAMS = [
    ('будівництво','Будівництво та експлуатація будівель та споруд','Від креслення до реальної будівлі. Теорія, навчальні майстерні та практика на будівельних майданчиках.','Будівництво','БУДІВЕЛЬНИК'),
    ('проєктування','Проєктування будівель та інтер’єрів','Простір починається з ідеї. Знайомся з освітньою програмою та роботами студентів коледжу.','Проєктування','ПРОЄКТУВАЛЬНИК'),
    ('дизайн','Опорядження будівель і споруд та будівельний дизайн','Форма, матеріал, колір. Відкрий напрям, у якому поєднуються будівництво й творчість.','Дизайн','ДИЗАЙНЕР')]
def program_cards():
    return '<div class="program-grid">'+''.join(f'<a class="program-card program-{i}" href="/спеціальності/{slug}/"><div class="program-top"><span class="program-label">{short}</span>{icon("external")}</div><div class="program-art"><span class="program-code" aria-label="Код спеціальності G19">G19</span>{icon(["file","book","cap"][i])}</div><span class="eyebrow">Освітньо-професійна програма</span><h3>{name}</h3><p>{desc}</p><span class="program-bottom">Дізнатися про програму {icon("arrow")}</span></a>' for i,(slug,name,desc,short,_) in enumerate(PROGRAMS))+'</div>'
def section_heading(eyebrow,heading,url='',label='Дізнатися більше'):
    return f'<div class="section-heading"><div><p class="eyebrow">{eyebrow}</p><h2>{heading}</h2></div>'+ (link(url,label+icon('arrow'),'text-link') if url else '')+'</div>'
def home():
    return f'''<section class="hero container"><div class="hero-copy"><p class="eyebrow">Твій коледж у Житомирі</p><p class="institution">Фаховий коледж будівництва,<br>архітектури та дизайну<br><span class="institution-parent">Поліського національного університету</span></p><h1><span class="hero-word">Будуй</span><br><span class="hero-word future">майбутнє.</span></h1><p class="hero-subtitle">Почни з коледжу.</p><p class="hero-description">Від першого ескізу до справжніх змін.<br>Знайди свій напрям у будівництві, проєктуванні та дизайні.</p><div class="button-row">{button('/вступнику/','Як вступити')}{button('/спеціальності/','Обрати спеціальність',True)}</div></div><div class="hero-visual"><img class="hero-photo" src="{CAMPUS}" alt="Навчальний корпус ФКБАД у Житомирі, студенти біля входу" fetchpriority="high" width="800" height="850"><div class="photo-label"><span>Місце, де ідеї стають професією</span><small>{icon('pin')} Житомир · Степана Бандери, 6</small></div><a class="hero-note" href="/про-коледж/"><span>З 1945 року</span><strong>Створюємо.<br>Навчаємо. Зростаємо.</strong>{icon('external')}</a></div></section>
    <div class="container quick-links">{link(SCHEDULE,icon('calendar')+'<span><strong>Розклад занять</strong><small>Твій навчальний день</small></span>'+icon('external'))}{link('/вступнику/',icon('cap')+'<span><strong>Вступна кампанія 2026</strong><small>Правила, строки, документи</small></span>'+icon('arrow'))}{link('/документи/',icon('file')+'<span><strong>Документи коледжу</strong><small>Відкрито та зручно</small></span>'+icon('arrow'))}</div>
    <section class="section container">{section_heading('Навчання з перспективою','Знайди свою справу.','/спеціальності/','Усі освітні програми')}{program_cards()}<p class="program-footnote">Спеціальність G19 «Будівництво та цивільна інженерія»</p></section>
    <section class="news-section section"><div class="container">{section_heading('Події та люди','Коледж сьогодні','/новини/','Усі новини')}<div class="news-grid">{''.join(news_card(p) for p in POSTS[:3])}</div></div></section>
    <section class="section container"><div class="student-feature"><div><p class="eyebrow">Більше, ніж навчання</p><h2>Твій простір.<br>Твої можливості.</h2><p>Студентське самоврядування, творчість, спорт і підтримка. Усе, що допомагає знайти себе та відчути себе частиною коледжу.</p>{button('/студенту/','Студентське життя')}</div><div class="student-resources">{link(SCHEDULE,icon('calendar')+'Розклад занять'+icon('external'))}{link('/бібліотека/',icon('book')+'Бібліотека'+icon('arrow'))}{link('/студентське-самоврядування/',icon('cap')+'Студентське самоврядування'+icon('arrow'))}{link('/соціальне-забезпечення/',icon('file')+'Соціальна підтримка'+icon('arrow'))}</div></div></section>
    <section class="container"><div class="admission-banner"><div><p class="eyebrow">Твій наступний крок</p><h2>Почнемо твою історію?</h2><p>Ознайомся з правилами вступу або звернися до приймальної комісії.</p></div>{button('/вступнику/','Усе про вступ',True)}</div></section>
    <section class="section container contact-teaser">{section_heading('Завжди на зв’язку','Зустрінемось у коледжі.','/контакти/','Усі контакти')}<div><p>{icon('pin')} м. Житомир, вул. Степана Бандери, 6</p><a href="tel:+380412472847">{icon('phone')} (0412) 47-28-47</a><a href="mailto:bkzt@ukr.net">{icon('mail')} bkzt@ukr.net</a></div></section>'''

for filename in ['styles.css','app.js','experience.css','experience.js','schedule.css','schedule.js']:
    if (ROOT/'src'/filename).exists(): shutil.copy2(ROOT/'src'/filename,OUT/filename)
shutil.copy2(ROOT/'src/schedule-worker.js', OUT/'_worker.js')
(OUT/'_routes.json').write_text(json.dumps({'version':1,'include':['/api/schedule'],'exclude':[]}),encoding='utf-8')
write('/',shell(NAME,home()))
if '--preview' in sys.argv:
    print('Homepage ready');sys.exit(0)

def page_heading(t,desc='',parent=None):
    crumb = '<a href="/">Головна</a><span>/</span>'
    if parent: crumb += f'<a href="{parent[0]}">{parent[1]}</a><span>/</span>'
    return f'<div class="page-heading container"><nav class="breadcrumbs" aria-label="Навігаційний шлях">{crumb}<span aria-current="page">{escape(t)}</span></nav><h1>{escape(t)}</h1>'+ (f'<p class="page-lead">{escape(desc)}</p>' if desc else '')+'</div>'

def doc_link(label,url,category=''):
    url = local_url(url)
    if not url: return ''
    label = clean_text(label).replace('_',' ')
    # The exported student resource still points to the original Vseosvita page.
    # Keep that site as the data source, while every visible schedule link opens our UI.
    if 'РОЗКЛАД ЗАНЯТЬ' in label.upper() and 'school.vseosvita.ua' in url:
        url = SCHEDULE
        category = category or 'Розклад у кабінеті коледжу'
    if label.isupper(): label = label.capitalize()
    kind = 'Перейти до розділу'
    if 'drive.google.com' in url: kind = 'Гугл Диск · відкриється в новій вкладці'
    elif 'docs.google.com' in url: kind = 'Гугл Документи · відкриється в новій вкладці'
    elif 'youtu' in url: kind = 'Відео · відкриється в новій вкладці'
    elif url.startswith('http'): kind = 'Зовнішній ресурс · нова вкладка'
    elif url.startswith('/assets'): kind = 'Переглянути зображення'
    return link(url,icon('file')+f'<span><strong>{escape(label)}</strong><small>{escape(category or kind)}</small></span>'+icon('external' if url.startswith('http') else 'arrow'),'document-link')

def resource_groups(items):
    out = ''
    for item in items:
        children = item.get('children',[])
        if children:
            rows = ''.join(doc_link(c['label'],c['url']) for c in flatten(children))
            if item.get('url'): rows = doc_link(item['label'],item['url'])+rows
            if rows: out += f'<details class="resource-group"><summary>{escape(item["label"].capitalize())}{icon("chevron")}</summary><div>{rows}</div></details>'
        elif item.get('url'): out += doc_link(item['label'],item['url'])
    return out

def sanitize(raw, page_title=''):
    soup = BeautifulSoup(raw,'html.parser')
    for el in soup(['script','style','link','meta','noscript','form','input','button','svg','object','embed']): el.decompose()
    for iframe in soup.select('iframe'):
        src = local_url(iframe.get('src',''))
        if src:
            a = soup.new_tag('a',href=src,target='_blank',rel='noopener noreferrer')
            a['class'] = 'embedded-resource'
            a.string = 'Переглянути відео' if 'youtu' in src else 'Відкрити матеріал'
            iframe.replace_with(a)
        else: iframe.decompose()
    allowed = {'p','a','h1','h2','h3','h4','h5','h6','ul','ol','li','table','thead','tbody','tfoot','tr','th','td','blockquote','figure','figcaption','img','strong','b','em','i','u','s','br','hr','sup','sub','video','source','audio'}
    for el in list(soup.find_all(True)):
        if el.name not in allowed:
            el.unwrap();continue
        attrs = dict(el.attrs);el.attrs = {}
        if el.name=='h1': el.name='h2'
        if el.name=='a':
            url = local_url(attrs.get('href',''))
            if not url: el.unwrap();continue
            el['href']=url
            if url.startswith('http'):
                el['target']='_blank';el['rel']='noopener noreferrer'
        elif el.name=='img':
            url = asset(attrs.get('src') or attrs.get('data-src',''))
            if not url: el.decompose();continue
            el['src']=url;el['loading']='lazy';el['decoding']='async'
            el['alt']=clean_text(attrs.get('alt','')) or page_title
        elif el.name in ('td','th'):
            for attr in ['colspan','rowspan']:
                if str(attrs.get(attr,'')).isdigit(): el[attr]=attrs[attr]
        elif el.name in ('audio','video','source'):
            url=local_url(attrs.get('src',''))
            if url: el['src']=url
            if el.name!='source': el['controls']='';el['preload']='none'
    for a in list(soup.select('a')):
        if not a.get_text(strip=True) and not a.find('img'): a.decompose()
    for el in reversed(list(soup.find_all(['p','h2','h3','h4','h5','h6','figure']))):
        if not el.get_text(strip=True) and not el.find(['img','video','audio']): el.decompose()
    for table in list(soup.select('table')):
        wrapper = soup.new_tag('div');wrapper['class']='table-scroll';wrapper['tabindex']='0';wrapper['aria-label']='Таблиця, прокрутіть для перегляду';table.wrap(wrapper)
    # Strip invisible spacing left by the page builder while retaining original prose.
    return re.sub(r'(?:\s*<br\s*/?>){3,}','<br><br>',str(soup))

def editorial_content(content):
    """Group original prose and adjacent photos without changing their order or words."""
    soup = BeautifulSoup(content, 'html.parser')
    original_text = ''.join(soup.stripped_strings)
    original_images = [i.get('src') for i in soup.select('img')]
    for node in list(soup.contents):
        if not getattr(node, 'name', None) and str(node).strip():
            block = soup.new_tag('p')
            node.wrap(block)
    # Existing line breaks are natural paragraph boundaries in legacy posts.
    for paragraph in list(soup.find_all('p')):
        if paragraph.find(['img', 'video', 'audio']):
            continue
        if not paragraph.find(True) and len(paragraph.get_text()) > 900:
            sentences = re.split(r'(?<=[.!?…])\s+(?=[А-ЯІЇЄҐA-Z«])', paragraph.get_text())
            chunk = ''
            for sentence in sentences:
                chunk += (' ' if chunk else '') + sentence
                if len(chunk) >= 420:
                    block = soup.new_tag('p')
                    block.string = chunk
                    paragraph.insert_before(block)
                    chunk = ''
            if chunk:
                block = soup.new_tag('p')
                block.string = chunk
                paragraph.insert_before(block)
            paragraph.decompose()
            continue
        if paragraph.find('br'):
            fragments = re.split(r'(?:\s*<br\s*/?>\s*){2,}', paragraph.decode_contents())
            if len(fragments) > 1:
                for fragment in fragments:
                    block = soup.new_tag('p')
                    block.extend(list(BeautifulSoup(fragment, 'html.parser').contents))
                    paragraph.insert_before(block)
                paragraph.decompose()
    result = soup.new_tag('div', attrs={'class': 'editorial-flow'})
    current = None
    kind = None
    length = 0
    lead_used = False
    for node in list(soup.contents):
        if not getattr(node, 'name', None):
            if not str(node).strip():
                continue
            paragraph = soup.new_tag('p')
            paragraph.append(node.extract())
            node = paragraph
        media = (node.name in ('img', 'video', 'audio', 'figure') or
                 (node.find(['img', 'video', 'audio']) and not node.get_text(strip=True)))
        next_kind = 'media' if media else 'text'
        heading = node.name in ('h2', 'h3', 'h4', 'h5', 'h6')
        if current is None or next_kind != kind or (next_kind == 'text' and ((length > 1100 and node.name in ('p', 'ul', 'ol', 'blockquote')) or heading)):
            current = soup.new_tag('div', attrs={'class': 'editorial-gallery' if media else 'editorial-section'})
            result.append(current)
            kind = next_kind
            length = 0
        if not media and node.name == 'p' and not lead_used and len(node.get_text(strip=True)) > 80:
            if len(node.get_text(strip=True)) < 650:
                node['class'] = 'article-introduction'
            lead_used = True
        if media:
            frame = soup.new_tag('div', attrs={'class': 'editorial-photo'})
            frame.append(node.extract())
            current.append(frame)
        else:
            current.append(node.extract())
        length += len(node.get_text())
    # Fail the build if presentation ever drops or reorders text or photographs.
    assert re.sub(r'\s+', '', ''.join(result.stripped_strings)) == re.sub(r'\s+', '', original_text)
    assert [i.get('src') for i in result.select('img')] == original_images
    for gallery in result.select('.editorial-gallery'):
        gallery['class'].append('single-photo' if len(gallery.contents) == 1 else 'photo-grid')
    return str(result)


def sidebar(active=''):
    items=[('/вступнику/','Вступнику'),('/студенту/','Студенту'),('/спеціальності/','Спеціальності'),('/документи/','Документи'),('/про-коледж/','Про коледж'),('/контакти/','Контакти')]
    return '<aside class="page-sidebar"><p class="eyebrow">Корисні розділи</p>'+''.join(f'<a href="{u}"'+(' aria-current="page"' if u==active else '')+f'>{t}{icon("arrow")}</a>' for u,t in items)+f'<div class="sidebar-help"><h3>Потрібна допомога?</h3><p>Звернися до коледжу</p><a href="tel:+380412472847">(0412) 47-28-47</a><a href="mailto:bkzt@ukr.net">bkzt@ukr.net</a></div></aside>'

def admissions():
    items=menu('ВСТУПНИКУ')
    primary=f'''<div class="admission-intro"><div><p class="eyebrow">Вступна кампанія 2026</p><h2>Твоя професія<br>починається тут.</h2><p>Обери освітню програму, ознайомся з правилами прийому та підготуй документи. Приймальна комісія допоможе з наступним кроком.</p><div class="button-row">{button(RULES,'Правила прийому')}{button('/контакти/','Приймальна комісія',True)}</div></div><img src="{CAMPUS}" alt="Навчальний корпус коледжу" width="640" height="480"></div>'''
    steps=f'''<div class="steps"><div><span>1</span><h3>Обери напрям</h3><p>Ознайомся з освітніми програмами.</p><a class="text-link" href="/спеціальності/">Спеціальності {icon('arrow')}</a></div><div><span>2</span><h3>Перевір правила і строки</h3><p>Умови вступу та перелік документів — в офіційних матеріалах приймальної комісії.</p>{link(DATES,'Строки вступної кампанії '+icon('external'),'text-link')}</div><div><span>3</span><h3>Підготуйся до вступу</h3><p>Програми випробувань, зразки рисунків і підготовчі курси — нижче.</p><a class="text-link" href="#admission-documents">Матеріали для вступу {icon('arrow')}</a></div></div>'''
    return page_heading('Вступнику','Усе необхідне, щоб зробити перший крок до навчання.')+f'<div class="container page-content">{primary}{steps}<div class="content-columns"><section id="admission-documents"><h2 class="subheading">Документи та підготовка</h2><div class="resource-list">{resource_groups(items)}</div></section>{sidebar("/вступнику/")}</div></div>'

def students():
    bells=menu_find('РОЗКЛАД ДЗВІНКІВ')
    cards=[(SCHEDULE,'Розклад занять','І семестр 2026–2027 навчального року','calendar'),(bells.get('url','/студенту/'),'Розклад дзвінків','Початок і завершення навчальних пар','calendar'),('/дистанційне-навчання/','Дистанційне навчання','Матеріали та освітні ресурси','book'),('/бібліотека/','Бібліотека','Навчальна література й корисні матеріали','book')]
    tiles='<div class="resource-tiles">'+''.join(link(u,icon(i)+f'<h2>{t}</h2><p>{d}</p>'+icon('external' if u.startswith('http') else 'arrow'),'resource-tile') for u,t,d,i in cards)+'</div>'
    return page_heading('Студенту','Навчання, розклад і підтримка — усе потрібне в одному місці.')+f'<div class="container page-content">{tiles}<div class="content-columns"><section><h2 class="subheading">Навчальні ресурси</h2><div class="resource-list">{resource_groups(menu("СТУДЕНТУ"))}</div><h2 class="subheading spaced">Життя у коледжі</h2>'+''.join(doc_link(title(BY_ID[i]),ROUTES[i]) for i in [1133,1135,1136,1137,372,1615])+f'</section>{sidebar("/студенту/")}</div></div>'

def programs_page():
    return page_heading('Спеціальності','Знайди напрям, у якому твої ідеї стануть професією.')+f'<section class="container page-content"><div class="info-banner">{icon("cap")}<div><strong>G19 Будівництво та цивільна інженерія</strong><p>Освітньо-професійні програми коледжу для вступників 2026 року</p></div></div>{program_cards()}<div class="content-columns spaced"><section><h2 class="subheading">Дізнайся більше про навчання</h2>{doc_link("Освітньо-професійні програми",ROUTES[820])}{doc_link("Відділення будівництва та цивільної інженерії",ROUTES[9911])}{doc_link("Дипломне проєктування: проєктування та дизайн",ROUTES[9767])}{doc_link("Дипломне проєктування: будівництво",ROUTES[9812])}{doc_link("Перелік програм для вступу",MANIFEST[1882]["original_url"])}</section>{sidebar("/спеціальності/")}</div></section>'

def specialty(p):
    slug,name,desc,short,presentation=p
    original=menu_find(presentation)
    related=9911 if slug=='будівництво' else 9767
    content=''
    if slug=='будівництво':
        source=BeautifulSoup(BY_ID[9911]['content']['rendered'],'html.parser')
        paragraphs=[n for n in source.find_all('p') if len(n.get_text(strip=True))>120]
        content=''.join(f'<p>{escape(n.get_text(" ",strip=True))}</p>' for n in paragraphs[:3])
    return page_heading(name,desc,('/спеціальності/','Спеціальності'))+f'<div class="container page-content content-columns"><section><div class="info-banner">{icon("cap")}<div><strong>G19 Будівництво та цивільна інженерія</strong><p>Освітньо-професійна програма</p></div></div><div class="prose">{content}</div><h2 class="subheading">Програма та практична підготовка</h2>{doc_link("Презентація напряму «"+short+"»",original.get("url","/спеціальності/"))}{doc_link(title(BY_ID[related]),ROUTES[related])}{doc_link("Освітньо-професійні програми",ROUTES[820])}<div class="inline-cta"><h2>Готовий до наступного кроку?</h2><p>Переглянь умови вступу та звернися до приймальної комісії.</p>{button("/вступнику/","Як вступити")}</div></section>{sidebar("/спеціальності/")}</div>'

def about():
    return page_heading('Про коледж','Освіта, творчість і професійний досвід у центрі Житомира.')+f'''<div class="container page-content"><div class="about-intro"><img src="{CAMPUS}" alt="Фаховий коледж будівництва, архітектури та дизайну" width="800" height="560"><div><p class="eyebrow">Знайомся з ФКБАД</p><h2>Відбудовувати.<br>Створювати.<br>Рухатися вперед.</h2><p>Відокремлений структурний підрозділ «{FULL_NAME}» готує фахівців для будівельної галузі.</p><p>Історія закладу почалася 26 вересня 1945 року зі створення Житомирського будівельного технікуму. Сьогодні студентське містечко коледжу розташоване в центрі Житомира.</p>{link(ROUTES[1480],'Історія коледжу '+icon('arrow'),'text-link')}</div></div><div class="facts"><div><strong>1945</strong><span>рік заснування</span></div><div><strong>2</strong><span>навчально-лабораторні корпуси</span></div><div><strong>2</strong><span>студентські гуртожитки</span></div></div><div class="content-columns"><section><h2 class="subheading">Познайомся з коледжем ближче</h2>{resource_groups(menu('ПРО КОЛЕДЖ'))}</section>{sidebar('/про-коледж/')}</div></div>'''

def contacts():
    maps='https://www.google.com/maps/search/?api=1&query='+quote('ФКБАД Житомир Степана Бандери 6')
    return page_heading('Контакти','Маєш запитання про навчання чи вступ? Звертайся до нас.')+f'''<div class="container page-content"><div class="contact-layout"><section class="contact-details"><div><span class="contact-icon">{icon('pin')}</span><h2>Завітай до коледжу</h2><p>10029, Україна, м. Житомир<br>вул. Степана Бандери, 6</p>{link(maps,'Прокласти маршрут '+icon('external'),'text-link')}</div><div><span class="contact-icon">{icon('phone')}</span><h2>Зателефонуй</h2><a href="tel:+380412472847">(0412) 47-28-47</a><a href="tel:+380412422083">(0412) 42-20-83</a><a href="tel:+380412473004">(0412) 47-30-04</a></div><div><span class="contact-icon">{icon('mail')}</span><h2>Напиши нам</h2><a href="mailto:bkzt@ukr.net">bkzt@ukr.net</a></div></section><div class="location-photo"><img src="{CAMPUS}" alt="Вхід до навчального корпусу коледжу" width="800" height="850"><div>{icon('pin')} Степана Бандери, 6 · Житомир</div></div></div><div class="content-columns spaced"><section><h2 class="subheading">Приймальна комісія</h2><p class="page-lead">Контактна інформація для вступників</p>{doc_link('Контакти приймальної комісії',MANIFEST[1883]['original_url'])}{doc_link('Правила прийому на навчання у 2026 році',RULES)}{doc_link('Строки вступної кампанії',DATES)}</section><aside class="contact-social"><h2 class="subheading">Коледж у соціальних мережах</h2>{doc_link('Фейсбук','https://www.facebook.com/FKBAD')}{doc_link('Телеграм','https://t.me/FKBAD_PNY')}{doc_link('Інстаграм','https://www.instagram.com/fkbad_')}</aside></div></div>'''

DOCUMENTS=[]
seen_docs=set()
def add_doc(t,u,category):
    url=local_url(u)
    if not url or url in seen_docs or len(clean_text(t))<4:return
    if not any(k in url for k in ['drive.google.com','docs.google.com','.pdf','zakon.rada.gov.ua']):return
    seen_docs.add(url);DOCUMENTS.append({'title':clean_text(t),'url':url,'category':category})
for group in MENUS:
    for item in flatten(group.get('children',[])): add_doc(item['label'],item['url'],group['label'].capitalize())
for pid in [591,797,798,796,1079,820,8327,8535]:
    for a in BeautifulSoup(BY_ID[pid]['content']['rendered'],'html.parser').select('a[href]'):
        add_doc(a.get_text(' ',strip=True),a['href'],title(BY_ID[pid]))

def documents():
    options=''.join(f'<option value="{escape(c,quote=True)}">{escape(c)}</option>' for c in sorted({x['category'] for x in DOCUMENTS}))
    rows=''.join(f'<div class="document-row" data-category="{escape(d["category"],quote=True)}">{doc_link(d["title"],d["url"],d["category"])}</div>' for d in DOCUMENTS)
    return page_heading('Документи','Правила, положення та навчальні матеріали коледжу.')+f'<div class="container page-content"><form class="filter-bar" id="document-filter" role="search" autocomplete="off"><div class="search-field">{icon("search")}<label class="sr-only" for="document-query">Назва документа</label><input id="document-query" type="search" placeholder="Знайти документ…" autocomplete="off"></div><label class="select-field"><span class="sr-only">Розділ документів</span><select id="document-category"><option value="">Усі розділи</option>{options}</select></label></form><p class="results-status" id="document-status" aria-live="polite">Документів: {len(DOCUMENTS)}</p><div class="content-columns"><section><div class="document-catalog">{rows}</div><div class="empty-state" id="document-empty" hidden><h2>Документів не знайдено</h2><p>Спробуй іншу назву або обери всі розділи.</p><button class="button" id="reset-documents" type="button">Скинути фільтри</button></div></section>{sidebar("/документи/")}</div></div>'

SEARCH=[]
for p in PAGES + POSTS:
    if p['id'] in [308,625]: continue
    SEARCH.append({'title':title(p),'url':ROUTES[p['id']],'type':'Новина' if p.get('type')=='post' else 'Розділ','text':clean_text(p['content']['rendered'])[:2200], 'date':date(p),'iso':p['date'][:10],'image':featured(p) if p.get('type')=='post' else ''})
for d in DOCUMENTS:SEARCH.append({'title':d['title'],'url':d['url'],'type':'Документ','text':d['category']})
for t,u in [('Спеціальності','/спеціальності/'),('Документи','/документи/'),('Контакти','/контакти/'),('Розклад занять',SCHEDULE)]:SEARCH.append({'title':t,'url':u,'type':'Розділ','text':FULL_NAME})

def news_listing(page=1):
    size=12;total=(len(POSTS)+size-1)//size
    cards=''.join(news_card(p) for p in POSTS[(page-1)*size:page*size])
    years=''.join(f'<option value="{y}">{y}</option>' for y in sorted({p['date'][:4] for p in POSTS},reverse=True))
    def page_url(i):return '/новини/' if i==1 else f'/новини/сторінка/{i}/'
    pagination=''
    for n in sorted({1,total,*range(max(1,page-2),min(total,page+2)+1)}):
        pagination+=f'<a href="{page_url(n)}"'+(' aria-current="page"' if n==page else '')+f' aria-label="Сторінка {n}">{n}</a>'
    if page<total:pagination+=link(page_url(page+1),'Далі '+icon('arrow'),'next-page')
    return page_heading('Новини','Події, досягнення та щоденне життя нашої спільноти.')+f'<div class="container page-content"><form id="news-filter" class="filter-bar" role="search" autocomplete="off"><div class="search-field">{icon("search")}<label class="sr-only" for="news-query">Пошук новин</label><input id="news-query" type="search" placeholder="Пошук у новинах…" autocomplete="off"></div><label class="select-field"><span class="sr-only">Рік публікації</span><select id="news-year"><option value="">Усі роки</option>{years}</select></label><button class="button" type="submit">Знайти</button></form><p class="results-status" id="news-status" aria-live="polite">Сторінка {page} з {total}</p><div class="news-grid" id="news-results">{cards}</div><nav class="pagination" id="news-pagination" aria-label="Сторінки новин">{pagination}</nav></div>'

def search_page():
    return page_heading('Пошук','Знайди новину, розділ або потрібний документ.')+f'<div class="container page-content search-page"><form class="filter-bar" id="site-search" action="/пошук/" role="search" autocomplete="off"><div class="search-field">{icon("search")}<label class="sr-only" for="site-query">Що шукаємо?</label><input type="search" id="site-query" name="q" placeholder="Наприклад, розклад або вступ…" autocomplete="off" required></div><label class="select-field"><span class="sr-only">Тип матеріалу</span><select id="search-type" name="type"><option value="">Усі матеріали</option><option>Розділ</option><option>Новина</option><option>Документ</option></select></label><button class="button" type="submit">Знайти</button></form><p id="search-status" class="results-status" aria-live="polite">Введи назву або ключове слово.</p><div id="search-results"></div><noscript><p>Для пошуку ввімкни JavaScript у браузері. Або скористайся розділами нижче.</p></noscript><div class="search-shortcuts"><h2 class="subheading">Часто шукають</h2>{doc_link('Розклад занять',SCHEDULE)}{doc_link('Правила прийому на навчання',RULES)}{doc_link('Документи коледжу','/документи/')}</div></div>'

CUSTOM={'/вступнику/':('Вступнику',admissions),'/студенту/':('Студенту',students),'/спеціальності/':('Спеціальності',programs_page),'/про-коледж/':('Про коледж',about),'/контакти/':('Контакти',contacts),'/документи/':('Документи',documents),'/пошук/':('Пошук',search_page),SCHEDULE:('Розклад занять',lambda:(ROOT/'src/schedule.html').read_text(encoding='utf-8'))}
for path,(name,render) in CUSTOM.items():write(path,shell(name,render(),path))
for p in PROGRAMS:
    path='/спеціальності/'+p[0]+'/'
    write(path,shell(p[1],specialty(p),path,p[2]))
for n in range(1,(len(POSTS)+11)//12+1):
    path='/новини/' if n==1 else f'/новини/сторінка/{n}/'
    write(path,shell('Новини' if n==1 else f'Новини — сторінка {n}',news_listing(n),'/новини/'))
for p in PAGES:
    path=ROUTES[p['id']]
    if path in CUSTOM or path in ('/','/новини/'):continue
    t=title(p)
    content=sanitize(p['content']['rendered'],t)
    additional=''
    matching=menu(t)
    if p['id']==368:matching=menu('ОСВІТНІЙ ПРОЦЕС')
    if matching:additional=resource_groups(matching)
    if not clean_text(content) and not BeautifulSoup(content,'html.parser').find('img') and not additional:
        additional=f'<div class="empty-state"><h2>Матеріали розділу</h2><p>Інформацію можна уточнити в коледжі або знайти серед опублікованих документів.</p><div class="button-row">{button("/документи/","Переглянути документи")}{button("/контакти/","Звернутися до коледжу",True)}</div></div>'
    body=page_heading(t)+f'<div class="container page-content content-columns"><section><div class="prose">{content}</div><div class="resource-list">{additional}</div></section>{sidebar(path)}</div>'
    write(path,shell(t,body,path,clean_text(content)))
for p in POSTS:
    t=title(p);path=ROUTES[p['id']]
    content=sanitize(p['content']['rendered'],t)
    hero=featured(p)
    # Avoid duplicating a featured photograph already present in the article.
    image=f'<img class="article-hero" src="{hero}" alt="{escape(t,quote=True)}" width="1200" height="760">' if hero and hero not in content else ''
    others=[x for x in POSTS if x['id']!=p['id']][:3]
    body=page_heading(t,'',('/новини/','Новини'))+f'<div class="container article-container"><div class="article-meta"><time datetime="{p["date"][:10]}">{date(p)}</time><span>Життя коледжу</span><button type="button" class="share-button" data-share>Поділитися {icon("external")}</button><span class="share-status" aria-live="polite"></span></div>{image}<article class="prose article-prose">{editorial_content(content)}</article><a class="text-link article-back" href="/новини/">Усі новини {icon("arrow")}</a></div><section class="section news-section"><div class="container">{section_heading("Читайте також","Інші новини")}<div class="news-grid">'+''.join(news_card(x) for x in others)+'</div></div></section>'
    write(path,shell(t,body,path,clean_text(content),True))

# Preserve original important WordPress page paths with static forwarding pages.
for p in PAGES:
    old=unquote(urlparse(p['link']).path);new=ROUTES[p['id']]
    if old!=new and old not in WRITTEN:
        write(old,f'<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={new}"><title>Перехід — ФКБАД</title><link rel="canonical" href="{new}"></head><body><a href="{new}">Перейти до розділу</a></body></html>')

not_found=page_heading('Сторінку не знайдено','Можливо, посилання змінилося. Скористайся пошуком або повернися на головну.')+f'<div class="container page-content button-row">{button("/пошук/","Знайти на сайті")}{button("/","На головну",True)}</div>'
(OUT/'404.html').write_text(shell('Сторінку не знайдено',not_found),encoding='utf-8')
(OUT/'search-index.json').write_text(json.dumps(SEARCH,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'route-map.json').write_text(json.dumps({str(k):v for k,v in ROUTES.items()},ensure_ascii=False),encoding='utf-8')
(OUT/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n',encoding='utf-8')
print(f'Built {len(WRITTEN)} pages, {len(POSTS)} articles, {len(DOCUMENTS)} documents; {len(COPIED)} referenced images.')
