"""Generate the college website from the supplied content export."""
# Keep generated output deterministic for content-only deployments.
from pathlib import Path
from urllib.parse import urlparse, unquote, quote
from html import escape, unescape
from datetime import datetime
import hashlib, json, os, re, shutil, sys
from bs4 import BeautifulSoup
from PIL import Image, ImageOps
import markdown
import yaml

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / 'src/content'
LEGACY_EXPORT = Path(os.environ.get('FKBAD_LEGACY_EXPORT', ROOT.parent / 'fkbad_migrator/fkbad_export_lean'))
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
# Generated HTML is replaced on every build so removed or unpublished CMS
# entries cannot survive in the deployment as stale pages.
for generated_page in OUT.rglob('index.html'):
    generated_page.unlink()
(OUT / 'assets').mkdir(exist_ok=True)
GOOGLE_VERIFICATION = ROOT / 'src/google6addcaa4704e2621.html'
if GOOGLE_VERIFICATION.is_file():
    shutil.copy2(GOOGLE_VERIFICATION, OUT / GOOGLE_VERIFICATION.name)

def read_frontmatter(path):
    text = path.read_text(encoding='utf-8')
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n?(.*)$', text, re.S)
    if not match:
        return {}, text
    return yaml.safe_load(match.group(1)) or {}, match.group(2)

def canonical_date(value):
    """Normalize dates written by Decap or imported content to ISO-8601."""
    raw = str(value or '').strip()
    try:
        return datetime.fromisoformat(raw).isoformat(timespec='minutes')
    except ValueError:
        for pattern in ('%d.%m.%YT%H:%M', '%d.%m.%Y %H:%M', '%d.%m.%Y'):
            try:
                return datetime.strptime(raw, pattern).isoformat(timespec='minutes')
            except ValueError:
                pass
    return '2000-01-01T00:00'

def cms_record(path, kind):
    data, body = read_frontmatter(path)
    if not data.get('published', True):
        return None
    date_value = canonical_date(data.get('date'))
    slug = str(data.get('slug') or re.sub(r'^\d{4}-\d{2}-\d{2}-', '', path.stem)).strip('/')
    if kind == 'post':
        route = str(data.get('route') or f'/{date_value[:4]}/{date_value[5:7]}/{date_value[8:10]}/{slug}/')
    else:
        route = str(data.get('route') or f'/{slug}/')
    route = '/' + route.strip('/') + '/' if route.strip('/') else '/'
    legacy_id = data.get('legacy_id')
    entry_id = int(legacy_id) if str(legacy_id or '').isdigit() else -int(hashlib.sha1(str(path).encode()).hexdigest()[:10], 16)
    rendered_body = markdown.markdown(body, extensions=['extra', 'sane_lists']) if body.strip() else ''
    return {
        'id': entry_id,
        'date': date_value,
        'slug': slug,
        'status': 'publish',
        'type': kind,
        'link': str(data.get('legacy_url') or route),
        'route': route,
        'title': {'rendered': str(data.get('title') or slug.replace('-', ' ').capitalize())},
        'content': {'rendered': rendered_body, 'protected': False},
        'excerpt': {'rendered': str(data.get('excerpt') or ''), 'protected': False},
        'featured_image': str(data.get('featured_image') or ''),
        'category': str(data.get('category') or 'Життя коледжу'),
        '_cms': True,
    }

def cms_collection(name, kind):
    folder = CONTENT / name
    if not folder.is_dir():
        return []
    entries = [cms_record(path, kind) for path in folder.rglob('*.md')]
    return [entry for entry in entries if entry]

def legacy_read(name):
    return json.loads((LEGACY_EXPORT / name).read_text(encoding='utf-8'))

PAGES = cms_collection('pages', 'page')
POSTS = cms_collection('news', 'post')
if not PAGES:
    PAGES = legacy_read('backend/pages.json')
if not POSTS:
    POSTS = legacy_read('backend/posts.json')
POSTS = sorted(POSTS, key=lambda x:x['date'], reverse=True)
MEDIA = {x['id']:x for x in legacy_read('backend/media.json')} if (LEGACY_EXPORT/'backend/media.json').is_file() else {}
MANIFEST = legacy_read('media_manifest.json') if (LEGACY_EXPORT/'media_manifest.json').is_file() else []
NAVIGATION = json.loads((ROOT/'src/navigation.json').read_text(encoding='utf-8'))
MENU_SOURCE = CONTENT / 'navigation-source.json'
MENUS = json.loads(MENU_SOURCE.read_text(encoding='utf-8')) if MENU_SOURCE.is_file() else NAVIGATION
BY_ID = {p['id']:p for p in PAGES + POSTS}
NAME = 'Фаховий коледж будівництва, архітектури та дизайну'
FULL_NAME = NAME + ' Поліського національного університету'
ABBR = 'ВСП ФКБАД Поліського університету'
FULL_DISPLAY = f'ВСП «{FULL_NAME}»'
SETTINGS_FILE = CONTENT / 'settings/site.json'
SITE_SETTINGS = json.loads(SETTINGS_FILE.read_text(encoding='utf-8')) if SETTINGS_FILE.is_file() else {}
PHONE_PRIMARY = SITE_SETTINGS.get('phone_primary', '(0412) 47-28-47')
PHONE_SECONDARY = SITE_SETTINGS.get('phone_secondary', '(0412) 42-20-83')
PHONE_THIRD = SITE_SETTINGS.get('phone_third', '(0412) 47-30-04')
EMAIL = SITE_SETTINGS.get('email', 'bkzt@ukr.net')
ADDRESS = SITE_SETTINGS.get('address', '10029, Україна, м. Житомир\nвул. Степана Бандери, 6')
FACEBOOK = SITE_SETTINGS.get('facebook', 'https://www.facebook.com/FKBAD')
TELEGRAM = SITE_SETTINGS.get('telegram', 'https://t.me/FKBAD_PNY')
INSTAGRAM = SITE_SETTINGS.get('instagram', 'https://www.instagram.com/fkbad_')
HERO_DESCRIPTION = SITE_SETTINGS.get('hero_description', 'Від першого ескізу до справжніх змін. Знайди свій напрям у будівництві, проєктуванні та дизайні.')
FOOTER_SIGNATURE = SITE_SETTINGS.get('footer_signature', 'Твори майбутнє')
FOOTER_SLOGAN = SITE_SETTINGS.get('footer_slogan', 'Освіта, що створює майбутнє.')

def phone_href(number):
    return '+' + re.sub(r'\D', '', number) if number.strip().startswith('+') else '+38' + re.sub(r'\D', '', number)

MONTHS = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня']
ROUTES = {308:'/',625:'/',307:'/новини/',592:'/про-коледж/',593:'/вступнику/',594:'/студенту/'}
for p in PAGES + POSTS:
    ROUTES.setdefault(p['id'], p.get('route') or unquote(urlparse(p['link']).path))
URLS = {unquote(urlparse(p['link']).path).rstrip('/') or '/':ROUTES[p['id']] for p in PAGES + POSTS}
# Keep legacy links to the former empty duplicate pointed at the canonical page.
URLS['/навчально-матеріальна-база'] = '/навчально-матеріальна-база-2/'
URLS['/головна'] = '/'

def clean_text(html):
    s = BeautifulSoup(html, 'html.parser')
    for t in s(['style','script']): t.decompose()
    return re.sub(r'\s+', ' ', s.get_text(' ', strip=True)).strip()

def strip_heading_periods(html):
    """Remove full stops from visible h1-h3 text without touching attributes."""
    def clean(match):
        fragment = match.group(0)
        return re.sub(r'(?<=>)([^<]*)(?=<)', lambda text: text.group(1).replace('.', ''), fragment)
    return re.sub(r'<h([1-3])\b[^>]*>.*?</h\1>', clean, html, flags=re.I | re.S)

_COLLEGE_ALIASES = {
    ABBR: ABBR,
    FULL_DISPLAY: FULL_DISPLAY,
    f'ВСП "{FULL_NAME}"': FULL_DISPLAY,
    f'ВСП “{FULL_NAME}”': FULL_DISPLAY,
    f'Відокремлений структурний підрозділ «{FULL_NAME}»': FULL_DISPLAY,
    f'Відокремлений структурний підрозділ "{FULL_NAME}"': FULL_DISPLAY,
    f'Відокремлений структурний підрозділ “{FULL_NAME}”': FULL_DISPLAY,
    f'ФКБАД Поліського національного університету': ABBR,
    f'ФКБАД Поліського університету': ABBR,
    FULL_NAME: FULL_DISPLAY,
    NAME: FULL_DISPLAY,
    'Фахового коледжу будівництва, архітектури та дизайну': FULL_DISPLAY,
    'Фахового коледжу': FULL_DISPLAY,
    'ФКБАД ПНУ': ABBR,
    'ФКБАД': ABBR,
}
_COLLEGE_NAMES_RE = re.compile('|'.join(re.escape(x) for x in sorted(_COLLEGE_ALIASES, key=len, reverse=True)))
def normalize_name_text(text):
    return _COLLEGE_NAMES_RE.sub(lambda match: _COLLEGE_ALIASES[match.group(0)], text)
def normalize_college_names(html):
    return re.sub(r'(?<=>)([^<]*)(?=<)', lambda text: normalize_name_text(text.group(1)), html)

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
    if url.startswith('/assets/'):
        return url if (OUT / url.lstrip('/')).is_file() else ''
    if url.startswith('/uploads/'):
        source = ROOT / 'src' / url.lstrip('/')
        target = OUT / url.lstrip('/')
        if source.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            return url
        return url if target.is_file() else ''
    # Decap can store an uploaded image as a bare filename in a markdown
    # entry. Resolve it from the CMS media folder (or the entry folder) and
    # publish it under /uploads so it works from every page depth.
    if not url.startswith(('http://', 'https://', '/')):
        for source in (ROOT / 'src' / 'uploads' / url, CONTENT / 'news' / url):
            if source.is_file():
                target = OUT / 'uploads' / source.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                return '/uploads/' + quote(source.name)
    m = ASSETS.get(norm(url))
    if not m: return ''
    source = LEGACY_EXPORT / m['local_file']
    if m['local_file'] in COPIED: return COPIED[m['local_file']]
    name = hashlib.sha1(m['local_file'].encode()).hexdigest()[:16]
    existing = OUT / 'assets' / (name+'.webp')
    if existing.exists():
        result='/assets/'+existing.name
        COPIED[m['local_file']]=result
        return result
    if not source.is_file(): return ''
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
    if p.get('featured_image'):
        return asset(p['featured_image']) or p['featured_image']
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
    if parsed.hostname in ('fkbad.com.ua', 'www.fkbad.com.ua'):
        path = unquote(parsed.path).rstrip('/') or '/'
        if path in URLS: return URLS[path]+('#'+parsed.fragment if parsed.fragment else '')
        media = asset(u)
        if media: return media
    if u.startswith('http://'): u = 'https://'+u[7:]
    return u
def icon(name):
    paths = {'arrow':'<path d="M5 12h14m-6-6 6 6-6 6"/>','external':'<path d="M7 17 17 7M7 7h10v10"/>','search':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>','menu':'<path d="M4 7h16M4 12h16M4 17h16"/>','close':'<path d="m6 6 12 12M6 18 18 6"/>','book':'<path d="M3 5c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2ZM12 7v14"/>','calendar':'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3"/>','file':'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 13h8m-8 4h6"/>','pin':'<path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>','phone':'<path d="M5 3H3c-1 10 8 19 18 18v-5l-5-2-2 3-7-7 3-2-2-5Z"/>','mail':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>','cap':'<path d="m2 9 10-5 10 5-10 5ZM6 11v6c4 3 8 3 12 0v-6m4-2v8"/>','chevron':'<path d="m8 10 4 4 4-4"/>','leader':'<path d="M7 8.5 9.5 11 12 6l2.5 5L17 8.5l1 7H6l1-7Z"/><path d="M7 19h10"/>','design':'<circle cx="12" cy="12" r="8"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><path d="M8.5 15c2 1.8 5 1.8 7 0"/>','build':'<path d="M4 21V9l8-5 8 5v12M8 21v-7h8v7M3 21h18"/>','edit':'<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.5 7.5 3 3"/>','shield':'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>','music':'<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>','users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>','camera':'<path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/>','sport':'<circle cx="12" cy="12" r="9"/><path d="m8 4 2 4-3 3-5-1m20 0-5 1-3-3 2-4m-8 16 1-5h6l1 5m-9-9 2 4m8-4-2 4"/>','heart':'<path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>','home':'<path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z"/>'}
    paths.update({
        'drafting':'<path d="M3 21V3l18 18H3Z"/><path d="M8 16v-5l5 5H8ZM3 8h2M3 13h2M8 21v-2M13 21v-2"/>',
        'palette':'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.6-3.2 1.8 1.8 0 0 1 1.4-2.9h1.3A3.7 3.7 0 0 0 21 11c0-4.5-4-8-9-8Z"/><circle cx="7.5" cy="9" r="1"/><circle cx="11" cy="6.5" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="6.5" cy="14" r="1"/>'
    })
    return f'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths.get(name,paths["arrow"])}</svg>'
def link(u,label,cls=''):
    u = local_url(u)
    if not u: return ''
    external = u.startswith('https:')
    return f'<a href="{escape(u,quote=True)}" class="{cls}"'+(' target="_blank" rel="noopener noreferrer"' if external else '')+f'>{label}</a>'
def button(u,label,secondary=False): return link(u,escape(label)+icon('arrow'),'button'+(' secondary' if secondary else ''))
def date(p):
    raw = str(p.get('date') or '').strip()
    # Decap's datetime widget uses DD.MM.YYYYTHH:mm, while imported
    # content and the API use ISO-8601. Accept both representations.
    d = None
    for parser in (datetime.fromisoformat,):
        try:
            d = parser(raw)
            break
        except ValueError:
            pass
    if d is None:
        for pattern in ('%d.%m.%YT%H:%M', '%d.%m.%Y %H:%M', '%d.%m.%Y'):
            try:
                d = datetime.strptime(raw, pattern)
                break
            except ValueError:
                pass
    if d is None:
        d = datetime.now()
    return f'{d.day} {MONTHS[d.month-1]} {d.year}'
def iso_date(p):
    """Return a valid ISO date for HTML datetime attributes and search data."""
    raw = str(p.get('date') or '').strip()
    for pattern in ('%d.%m.%YT%H:%M', '%d.%m.%Y %H:%M', '%d.%m.%Y'):
        try:
            return datetime.strptime(raw, pattern).date().isoformat()
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(raw).date().isoformat()
    except ValueError:
        return datetime.now().date().isoformat()
def menu(label): return next((x for x in MENUS if x['label'].upper()==label.upper()),{'children':[]})['children']
def flatten(items):
    for item in items:
        if item.get('url'): yield item
        yield from flatten(item.get('children',[]))
def menu_find(needle): return next((x for x in flatten(MENUS) if needle.lower() in x['label'].lower()),{})
SCHEDULE = '/розклад/'
RULES = menu_find('ПРАВИЛА ПРИЙОМУ НА НАВЧАННЯ У 2026').get('url','/вступнику/')
DATES = menu_find('Строки вступної кампанії').get('url','/вступнику/')
shutil.copytree(ROOT/'src/assets', OUT/'assets', dirs_exist_ok=True)
CAMPUS = '/assets/campus.webp'
ANNIVERSARY_SOURCE = ROOT/'src/assets/campus-80.jpg'
ANNIVERSARY = '/assets/campus-80-' + hashlib.sha256(ANNIVERSARY_SOURCE.read_bytes()).hexdigest()[:12] + '.jpg'
shutil.copy2(ANNIVERSARY_SOURCE, OUT/ANNIVERSARY.lstrip('/'))
LOGO = '/assets/site-logo.webp'
ADMISSION_PROGRAMS = '/assets/admission-programs.webp'
ADMISSION_CONTACTS = '/assets/admission-contacts.webp'
FAVICON = '/favicon.webp'
COUNCIL_HERO = '/assets/student-council-hero.webp'
COUNCIL_LOGO = '/assets/student-council-logo.svg'
for council_asset in (COUNCIL_HERO, COUNCIL_LOGO):
    shutil.copy2(ROOT/'src'/council_asset.lstrip('/'), OUT/council_asset.lstrip('/'))
(OUT/'assets/fonts').mkdir(exist_ok=True)
for font_asset in ('council-numerals.woff2', 'SixCaps-OFL.txt', 'FONT-NOTICE.txt'):
    shutil.copy2(ROOT/'src/assets/fonts'/font_asset, OUT/'assets/fonts'/font_asset)
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

def navigation_label(label):
    text = label.lower()
    abbreviations = ('ВСП', 'ФКБАД', 'ПНУ', 'БЦІ', 'ОПП', 'БЕБС', 'ОБСБД', 'КП', 'ЄДЕБО', 'ЗНО', 'НМТ', 'ДПА', 'НАЗЯВО', 'ІІ', 'ІІІ', 'IV', 'VI', 'VII', 'VIII', 'IX')
    for abbreviation in abbreviations:
        text = re.sub(r'(?<!\w)' + re.escape(abbreviation.lower()) + r'(?!\w)', abbreviation, text)
    return text[:1].upper() + text[1:]

def full_navigation(items, active='', prefix=''):
    overview = {'ОСВІТНІЙ ПРОЦЕС':'https://learn.fkbad.com.ua/','ПРО КОЛЕДЖ':'/про-коледж/','ВСТУПНИКУ':'/вступнику/','СТУДЕНТУ':'/студенту/','БІБЛІОТЕКА':'/бібліотека/','ВИХОВНА РОБОТА':'/виховна-робота/','НОВИНИ':'/новини/'}
    result = ''
    for index, item in enumerate(items):
        node_id = prefix + str(index)
        label = item['label']
        display_label = navigation_label(label)
        url = overview.get(label.upper(), item.get('url'))
        if url in ('#', 'http://2'): url = None
        children = item.get('children', [])
        if children:
            intro = link(url, 'Освітній портал' if label.upper() == 'ОСВІТНІЙ ПРОЦЕС' else 'Огляд розділу') if url else ''
            result += '<details id="menu-'+node_id+'" class="navigation-group"><summary>'+escape(display_label)+'</summary><div class="navigation-children">'+intro+full_navigation(children, active, node_id+'-')+'</div></details>'
        elif url:
            result += link(url, escape(display_label), 'navigation-link')
        else:
            result += '<div id="menu-'+node_id+'" class="navigation-unavailable"><span>'+escape(display_label)+'</span><small>Матеріал поки недоступний на вихідному сайті</small></div>'
    return result

def header(active=''):
    nav = [('/про-коледж/','Про коледж'),('/спеціальності/','Спеціальності'),('/студенту/','Студенту'),(SCHEDULE,'Розклад'),('/новини/','Новини'),('/контакти/','Контакти')]
    items = ''.join(f'<a href="{u}"'+(' aria-current="page"' if active==u else '')+f'>{t}</a>' for u,t in nav)
    desktop = items
    student_link = next(x+'</a>' for x in items.split('</a>') if 'href="/студенту/"' in x)
    desktop = desktop.replace(student_link, f'<div class="nav-group">{student_link}<button class="nav-expand" aria-label="Навчальні ресурси" aria-expanded="false" aria-controls="study-menu">{icon("chevron")}</button><div class="nav-dropdown" id="study-menu" inert><span class="eyebrow">Для твоїх планів</span><a href="/вступнику/">Вступнику {icon("arrow")}</a><a href="/бібліотека/">Бібліотека {icon("book")}</a><a href="/документи/">Документи {icon("file")}</a>{link(SCHEDULE,"Розклад занять "+icon("calendar"))}</div></div>')
    search = f'''<form class="header-search" action="/пошук/" method="get" role="search" aria-label="Пошук на сайті" autocomplete="off"><button type="submit" aria-label="Знайти">{icon("search")}</button><input type="search" name="q" aria-label="Пошуковий запит" placeholder="Пошук на сайті" required autocomplete="off"></form>'''
    return f'''<a class="skip-link" href="#main">Перейти до вмісту</a>
    <header class="site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="{ABBR} — головна"><img src="{LOGO}" alt="" width="96" height="72"><span><strong>{ABBR}</strong></span></a>
    <nav class="desktop-nav" aria-label="Головна навігація">{desktop}</nav>{search}<div class="header-actions"><button class="icon-button theme-toggle" type="button" aria-label="Увімкнути темну тему" aria-pressed="false" title="Увімкнути темну тему"><svg class="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><svg class="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg></button><a class="button compact" href="/вступнику/">Вступнику {icon('external')}</a><button class="icon-button menu-toggle" aria-expanded="false" aria-controls="mobile-nav" aria-label="Відкрити меню"><span></span><span></span></button></div></div>
    <nav id="mobile-nav" class="mobile-nav container" aria-label="Головна навігація" hidden>{search}<div class="navigation-tree">{full_navigation(NAVIGATION,active)}<div class="navigation-shortcuts"><a href="/спеціальності/">Спеціальності</a><a href="/розклад/">Розклад занять</a><a href="/контакти/">Контакти</a><a href="/документи/">Документи</a><a href="/викладачу/">Викладачу</a><a href="/пошук/">Пошук на сайті</a></div></div></nav></header>'''
PARTNERS = (
    ('https://mon.gov.ua/', 'Міністерство освіти і науки України', '/assets/partners/mon.png'),
    ('https://nmc.zt.ua/', 'Науково-методичний центр Житомирської міської ради', '/assets/partners/nmc.png'),
    ('https://zt-rada.gov.ua/', 'Житомирська міська рада', '/assets/partners/city.png'),
    ('https://zt.gov.ua/', 'Житомирська обласна рада', '/assets/partners/region.ico'),
    ('https://polissiauniver.edu.ua/', 'Поліський національний університет', '/assets/partners/university.png'),
    ('https://sqe.gov.ua/organ/upravlinnya-sqe-zhytomyr/', 'Управління Державної служби якості освіти у Житомирській області', '/assets/partners/sqe.ico'),
    ('https://www.instagram.com/kraymuz_zt/', 'Житомирський обласний краєзнавчий музей', '/assets/partners/museum.svg'),
)

def footer():
    socials = ''.join(link(url, label+' ↗') for url,label in [(FACEBOOK,'Фейсбук'),(TELEGRAM,'Телеграм'),(INSTAGRAM,'Інстаграм')] if url)
    address = escape(ADDRESS).replace('\n', '<br>')
    partner_cards = ''.join(f'<a class="footer-partner" href="{url}" target="_blank" rel="noopener noreferrer"><img src="{logo}" alt="" loading="lazy"><span>{escape(name)}</span><span class="footer-partner-arrow" aria-hidden="true">↗</span></a>' for url,name,logo in PARTNERS)
    return f'''<footer class="footer"><div class="container footer-partners"><div class="footer-partners-heading"><p class="eyebrow">Партнери та ресурси</p><h2>Працюємо разом</h2></div><div class="footer-partners-grid">{partner_cards}</div></div><div class="container footer-grid"><div class="footer-brand"><a class="brand" href="/"><img src="{LOGO}" width="54" height="48" alt=""><strong>{ABBR}</strong></a><p>{FULL_DISPLAY}</p><div class="socials">{socials}</div></div><div><h3>Навчання</h3><a href="/вступнику/">Вступнику</a><a href="/спеціальності/">Спеціальності</a><a href="/студенту/">Студенту</a>{link(SCHEDULE,'Розклад занять')}</div><div><h3>Коледж</h3><a href="/про-коледж/">Про коледж</a><a href="/новини/">Новини</a><a href="/документи/">Документи</a><a href="/контакти/">Контакти</a></div><div><h3>Завітай до нас</h3><p>{address}</p><a href="tel:{phone_href(PHONE_PRIMARY)}">{escape(PHONE_PRIMARY)}</a><a href="mailto:{escape(EMAIL, quote=True)}">{escape(EMAIL)}</a></div></div><div class="container footer-signature" aria-hidden="true">{escape(FOOTER_SIGNATURE)}</div><div class="container footer-bottom"><span>© 2026 {ABBR}</span><a href="/admin/" aria-label="Відкрити редактор сайту">uV6zyF3fV2vsM7l</a><span>{escape(FOOTER_SLOGAN)}</span></div></footer>'''
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
            img['alt'] = f'80 років {FULL_DISPLAY}'
            img['class'] = img.get('class', []) + ['campus-anniversary']
            parent_link = img.find_parent('a')
            if parent_link and parent_link.get('href') == CAMPUS:
                parent_link['href'] = ANNIVERSARY
        body = str(content)
    body = normalize_college_names(strip_heading_periods(body))
    contact_replacements = {
        'tel:+380412472847': f'tel:{phone_href(PHONE_PRIMARY)}',
        '(0412) 47-28-47': PHONE_PRIMARY,
        'tel:+380412422083': f'tel:{phone_href(PHONE_SECONDARY)}',
        '(0412) 42-20-83': PHONE_SECONDARY,
        'tel:+380412473004': f'tel:{phone_href(PHONE_THIRD)}',
        '(0412) 47-30-04': PHONE_THIRD,
        'mailto:bkzt@ukr.net': f'mailto:{escape(EMAIL, quote=True)}',
        'bkzt@ukr.net': escape(EMAIL),
        'https://www.facebook.com/FKBAD': FACEBOOK,
        'https://t.me/FKBAD_PNY': TELEGRAM,
        'https://www.instagram.com/fkbad_': INSTAGRAM,
    }
    for original, replacement in contact_replacements.items():
        body = body.replace(original, replacement)
    title_text = normalize_name_text(title_text)
    desc = normalize_name_text(description or f'{FULL_DISPLAY} у Житомирі: спеціальності, вступ, новини та студентське життя.')
    body_classes = ('home-page' if path=='/' else 'inner-page') + (' is-article' if article else '') + (' core-page' if not article and path != '/новини/' else '') + (' social-support-page' if path == '/соціальне-забезпечення/' else '')
    return f'''<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>{THEME_INIT}</script><title>{escape(title_text)} — {ABBR}</title><meta name="description" content="{escape(desc[:180],quote=True)}"><meta property="og:title" content="{escape(title_text,quote=True)} — {ABBR}"><meta property="og:description" content="{escape(desc[:180],quote=True)}"><meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:locale" content="uk_UA"><meta name="theme-color" content="#204ed8"><meta name="application-name" content="FKBAD"><meta name="apple-mobile-web-app-title" content="FKBAD"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png"><link rel="icon" href="{FAVICON}" type="image/webp"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/experience.css"><link rel="stylesheet" href="/motion.css"><script src="/app.js" defer></script><script src="/experience.js" defer></script><script src="/vendor/lenis.min.js" defer></script><script src="/motion.js" defer></script></head><body class="{body_classes}"><div class="cosmic-backdrop" aria-hidden="true"><div class="cosmic-nebula"></div><div class="cosmic-dust"></div><div class="cosmic-glints"></div></div>{header(path)}<main id="main">{body}</main>{footer()}<button class="back-top icon-button" aria-label="Повернутися нагору" type="button">{icon("arrow")}</button></body></html>'''
WRITTEN = []
PAGE_PALETTES = {}
def write(path,content,standalone=False):
    # Give each internal route its own stable palette; preserve the two bespoke pages.
    if path != '/' and 'council-page-heading' not in content and '<html lang="uk"' in content:
        palette_groups = [
            (('новин',), 345), (('вступ', 'приймаль', 'абітур'), 24),
            (('психолог',), 278), (('бібліот', 'літератур'), 38),
            (('розклад',), 188), (('контакт', 'реквізит'), 170),
            (('спорт', 'здоров'), 142), (('волонтер', 'благодій'), 12),
            (('дизайн',), 315), (('архітект', 'проєкт'), 205),
            (('будів',), 28), (('студент', 'гуртожит'), 155),
            (('виклада', 'педагог', 'методич'), 250),
            (('документ', 'положен', 'наказ', 'публіч', 'прозор', 'акредита'), 220),
            (('освіт', 'навчаль', 'дистанц'), 195),
            (('істор', 'музе', 'коледж'), 32), (('пошук',), 265),
        ]
        title_match = re.search(r'<title>(.*?)</title>', content)
        label = unquote(path).lower()
        # Every route, including individual articles, gets a distinct hue.
        if ' is-article' in content:
            hue = 345
        else:
            hue = next((h for words,h in palette_groups if any(w in label for w in words)), None)
            if hue is None:
                label = unescape(title_match.group(1)).split(' — ')[0].lower() if title_match else label
                hue = next((h for words,h in palette_groups if any(w in label for w in words)), int(hashlib.sha256(path.encode()).hexdigest()[:4],16) % 360)
        seed = int(hashlib.sha256(path.encode()).hexdigest()[:8],16)
        hue = round((hue + (seed % 36000) / 100) % 360, 2)
        while hue in PAGE_PALETTES and PAGE_PALETTES[hue] != path:
            hue = round((hue + .17) % 360, 2)
        PAGE_PALETTES[hue] = path
        companion = round((hue + 35 + seed % 55) % 360, 2)
        content = content.replace('<html lang="uk"', f'<html lang="uk" data-page-palette="{hue}" style="--page-hue:{hue};--page-companion:{companion}"', 1)
        # A navigation strip links to real content headings, never invented sections.
        page = BeautifulSoup(content, 'html.parser')
        main = page.select_one('main')
        page_heading = page.select_one('.page-heading')
        if main and page_heading:
            headings = [h for h in main.select('h2,h3')
                        if h.get_text(strip=True) and not h.find_parent(['aside','table','details'])
                        and not h.find_parent(class_=re.compile(r'news-card|program-card|resource-tile|page-sidebar|empty-state|schedule|map-consent'))]
            if len(headings) >= 2:
                nav = page.new_tag('nav', attrs={'class':'section-explorer container','aria-label':'На цій сторінці'})
                for index,h in enumerate(headings[:24],1):
                    anchor = h.get('id') or f'page-section-{index}'
                    while not h.get('id') and page.find(id=anchor):
                        anchor += '-section'
                    h['id'] = anchor
                    link_tag = page.new_tag('a',href='#'+anchor)
                    link_tag.string = h.get_text(' ',strip=True)
                    nav.append(link_tag)
                page_heading.insert_after(nav)
                content = str(page)
    for asset in ['styles.css','experience.css','app.js','experience.js','schedule.css','schedule.js','motion.css','motion.js','vendor/lenis.min.js','cosmos.svg']:
        revision = hashlib.sha256((ROOT/'src'/asset).read_bytes()).hexdigest()[:12]
        content = content.replace(f'"/{asset}"', f'"/{asset}?v={revision}"')
    content = content.replace('width=device-width, initial-scale=1"', 'width=device-width, initial-scale=1, viewport-fit=cover"')
    relative = unquote(path).strip('/')
    dest = OUT / relative if standalone else OUT / relative / 'index.html' if relative else OUT / 'index.html'
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text('\n'.join(line.rstrip() for line in content.splitlines()),encoding='utf-8')
    if not standalone: WRITTEN.append(path)
def news_card(p):
    img = featured(p)
    width, height = 640, 430
    if img:
        try:
            with Image.open(OUT / img.lstrip('/')) as photo_file:
                width, height = photo_file.size
        except (OSError, ValueError):
            pass
    ratio = max(.7, min(1.9, width / height))
    visual = f'<img src="{img}" alt="{escape(title(p),quote=True)}" loading="lazy" width="{width}" height="{height}">' if img else f'<div class="news-placeholder">{icon("book")}<span>{ABBR}</span></div>'
    excerpt = clean_text(p.get('excerpt', {}).get('rendered', '')) or clean_text(p['content']['rendered'])
    excerpt = re.sub(r'\s+', ' ', excerpt).strip()
    category = p.get('category', 'Життя коледжу')
    return f'<article class="news-card" style="--photo-weight:{ratio:.3f};--photo-basis:{210 * ratio:.1f}px"><a href="{ROUTES[p["id"]]}" class="news-image">{visual}</a><div class="news-meta"><time datetime="{iso_date(p)}">{date(p)}</time><span>{escape(category)}</span></div><h3><a href="{ROUTES[p["id"]]}">{escape(title(p))}</a></h3><p class="news-excerpt"><span>{escape(excerpt)}</span></p><a class="text-link" href="{ROUTES[p["id"]]}">Читати новину {icon("arrow")}</a></article>'
PROGRAMS = [
    ('будівництво','Будівництво та експлуатація будівель та споруд','Від креслення до реальної будівлі. Теорія, навчальні майстерні та практика на будівельних майданчиках.','Будівництво','БУДІВЕЛЬНИК'),
    ('проєктування','Проєктування будівель та інтер’єрів','Простір починається з ідеї. Знайомся з освітньою програмою та роботами студентів коледжу.','Проєктування','ПРОЄКТУВАЛЬНИК'),
    ('дизайн','Опорядження будівель і споруд та будівельний дизайн','Форма, матеріал, колір. Відкрий напрям, у якому поєднуються будівництво й творчість.','Дизайн','ДИЗАЙНЕР')]
def program_cards():
    return '<div class="program-grid">'+''.join(f'<a class="program-card program-{i}" href="/спеціальності/{slug}/"><div class="program-top"><span class="program-label">{short}</span>{icon("external")}</div><div class="program-art"><span class="program-code" aria-label="Код спеціальності G19">G19</span>{icon(["build","drafting","palette"][i])}</div><span class="eyebrow">Освітньо-професійна програма</span><h3>{name}</h3><p>{desc}</p><span class="program-bottom">Дізнатися про програму {icon("arrow")}</span></a>' for i,(slug,name,desc,short,_) in enumerate(PROGRAMS))+'</div>'
def section_heading(eyebrow,heading,url='',label='Дізнатися більше'):
    return f'<div class="section-heading"><div><p class="eyebrow">{eyebrow}</p><h2>{heading}</h2></div>'+ (link(url,label+icon('arrow'),'text-link') if url else '')+'</div>'
def home_legacy():
    return f'''<section class="hero container"><div class="hero-copy"><p class="eyebrow">Твій коледж у Житомирі</p><p class="institution">Фаховий коледж будівництва,<br>архітектури та дизайну<br><span class="institution-parent">Поліського національного університету</span></p><h1><span class="hero-word">Будуй</span><br><span class="hero-word future">Майбутнє.</span></h1><p class="hero-subtitle">Почни з коледжу.</p><p class="hero-description">{escape(HERO_DESCRIPTION)}</p><div class="button-row">{button('/вступнику/','Як вступити')}{button('/спеціальності/','Обрати спеціальність',True)}</div></div><div class="hero-visual"><img class="hero-photo" src="{CAMPUS}" alt="Навчальний корпус {ABBR} у Житомирі, студенти біля входу" fetchpriority="high" width="800" height="850"><div class="photo-label"><span>Місце, де ідеї стають професією</span><small>{icon('pin')} Житомир · Степана Бандери, 6</small></div><a class="hero-note" href="/про-коледж/"><span>З 1945 року</span><strong>Створюємо.<br>Навчаємо. Зростаємо.</strong>{icon('external')}</a></div></section>
    <div class="container quick-links">{link(SCHEDULE,icon('calendar')+'<span><strong>Розклад занять</strong><small>Твій навчальний день</small></span>'+icon('external'))}{link('/вступнику/',icon('cap')+'<span><strong>Вступна кампанія 2026</strong><small>Правила, строки, документи</small></span>'+icon('arrow'))}{link('/документи/',icon('file')+'<span><strong>Документи коледжу</strong><small>Відкрито та зручно</small></span>'+icon('arrow'))}</div>
    <section class="section container">{section_heading('Навчання з перспективою','Знайди свою справу.','/спеціальності/','Усі освітні програми')}{program_cards()}<p class="program-footnote">Спеціальність G19 «Будівництво та цивільна інженерія»</p></section>
    <section class="news-section section"><div class="container">{section_heading('Події та люди','Коледж сьогодні','/новини/','Усі новини')}<div class="news-grid">{''.join(news_card(p) for p in POSTS[:3])}</div></div></section>
    <section class="section container"><div class="student-feature"><div><p class="eyebrow">Більше, ніж навчання</p><h2>Твій простір<br>твої можливості</h2><p>Студентське самоврядування, творчість, спорт і підтримка. Усе, що допомагає знайти себе та відчути себе частиною коледжу.</p>{button('/студенту/','Студентське життя')}</div><div class="student-resources">{link(SCHEDULE,icon('calendar')+'Розклад занять'+icon('external'))}{link('/бібліотека/',icon('book')+'Бібліотека'+icon('arrow'))}{link('/студентське-самоврядування/',icon('cap')+'Студентське самоврядування'+icon('arrow'))}{link('/соціальне-забезпечення/',icon('file')+'Соціальна підтримка'+icon('arrow'))}</div></div></section>
    <section class="container future-invitation"><a class="future-banner" href="/вступнику/"><span class="future-art" aria-hidden="true"></span><span class="future-star future-star-large" aria-hidden="true"></span><span class="future-star future-star-small" aria-hidden="true"></span><div class="future-copy"><h2>Почнемо твоє майбутнє?</h2><p>Твоє майбутнє починається з одного рішення.</p></div><span class="future-arrow" aria-hidden="true">{icon('arrow')}</span></a></section>
    <section class="section container contact-teaser">{section_heading('Завжди на зв’язку','Зустрінемось у коледжі.','/контакти/','Усі контакти')}<div><p>{icon('pin')} {escape(ADDRESS).replace(chr(10), ', ')}</p><a href="tel:{phone_href(PHONE_PRIMARY)}">{icon('phone')} {escape(PHONE_PRIMARY)}</a><a href="mailto:{escape(EMAIL, quote=True)}">{icon('mail')} {escape(EMAIL)}</a></div></section>'''

def home():
    body = home_legacy()
    body = body.replace('Фаховий коледж будівництва,<br>архітектури та дизайну<br><span class="institution-parent">Поліського національного університету</span>', 'ВСП «Фаховий коледж будівництва, архітектури та дизайну Поліського національного університету»')
    body = body.replace('<h1><span class="hero-word">Будуй</span><br><span class="hero-word future">Майбутнє.</span></h1><p class="hero-subtitle">Почни з коледжу.</p>', '<h1><span class="hero-word">Будуй</span><br><span class="hero-word future">майбутнє</span><br><span class="hero-word together">разом з нами</span></h1>')
    return body

for filename in ['styles.css','app.js','experience.css','experience.js','schedule.css','schedule.js','motion.css','motion.js','vendor/lenis.min.js','cosmos.svg','manifest.webmanifest','offline.html','icons/icon-192.png','icons/icon-512.png']:
    if (ROOT/'src'/filename).exists():
        (OUT/filename).parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ROOT/'src'/filename,OUT/filename)
for static_dir in ('admin', 'uploads'):
    source_dir = ROOT / 'src' / static_dir
    if source_dir.is_dir():
        shutil.copytree(source_dir, OUT / static_dir, dirs_exist_ok=True)
shutil.copy2(ROOT/'src/vendor/lenis-LICENSE.txt',OUT/'vendor/lenis-LICENSE.txt')
shutil.copy2(ROOT/'src/schedule-worker.js', OUT/'_worker.js')
# Fill the service worker's version and precache only the app shell and stable,
# versioned assets. Pages and the live schedule remain network-first/fresh.
PWA_VERSION = hashlib.sha256((ROOT/'src/sw.js').read_bytes()).hexdigest()[:12]
def asset_url(filename):
    revision = hashlib.sha256((ROOT/'src'/filename).read_bytes()).hexdigest()[:12]
    return f'/{filename}?v={revision}'
pwa_precache = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']
pwa_precache += [asset_url(name) for name in ['styles.css','experience.css','app.js','experience.js','motion.css','motion.js','vendor/lenis.min.js','cosmos.svg']]
service_worker = (ROOT/'src/sw.js').read_text(encoding='utf-8')
service_worker = service_worker.replace('__PWA_VERSION__', PWA_VERSION).replace('__PWA_PRECACHE__', json.dumps(pwa_precache, ensure_ascii=False))
(OUT/'sw.js').write_text(service_worker, encoding='utf-8')
(OUT/'_routes.json').write_text(json.dumps({'version':1,'include':['/api/schedule','/api/auth','/api/callback'],'exclude':[]}),encoding='utf-8')
write('/',shell(ABBR,home()))
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
    return '<aside class="page-sidebar"><p class="eyebrow">Корисні розділи</p>'+''.join(f'<a href="{u}"'+(' aria-current="page"' if u==active else '')+f'>{t}{icon("arrow")}</a>' for u,t in items)+f'<div class="sidebar-help"><h3>Потрібна допомога?</h3><p>Звернися до коледжу</p><a href="tel:{phone_href(PHONE_PRIMARY)}">{escape(PHONE_PRIMARY)}</a><a href="mailto:{escape(EMAIL, quote=True)}">{escape(EMAIL)}</a></div></aside>'

def admissions():
    items=menu('ВСТУПНИКУ')
    primary=f'''<div class="admission-intro"><div><p class="eyebrow">Вступна кампанія 2026</p><h2>Твоя професія<br>починається тут.</h2><p>Обери освітню програму, ознайомся з правилами прийому та підготуй документи. Приймальна комісія допоможе з наступним кроком.</p><div class="button-row">{button(RULES,'Правила прийому')}{button('/контакти/','Приймальна комісія',True)}</div></div><img src="{CAMPUS}" alt="Навчальний корпус коледжу" width="640" height="480"></div>'''
    steps=f'''<div class="steps"><div><span>1</span><h3>Обери напрям</h3><p>Ознайомся з освітніми програмами.</p><a class="text-link" href="/спеціальності/">Спеціальності {icon('arrow')}</a></div><div><span>2</span><h3>Перевір правила і строки</h3><p>Умови вступу та перелік документів — в офіційних матеріалах приймальної комісії.</p>{link(DATES,'Строки вступної кампанії '+icon('external'),'text-link')}</div><div><span>3</span><h3>Підготуйся до вступу</h3><p>Програми випробувань, зразки рисунків і підготовчі курси — нижче.</p><a class="text-link" href="#admission-documents">Матеріали для вступу {icon('arrow')}</a></div></div>'''
    return page_heading('Вступнику','Усе необхідне, щоб зробити перший крок до навчання.')+f'<div class="container page-content">{primary}{steps}<div class="content-columns"><section id="admission-documents"><h2 class="subheading">Документи та підготовка</h2><div class="resource-list">{resource_groups(items)}</div></section>{sidebar("/вступнику/")}</div></div>'

def students():
    bells=menu_find('РОЗКЛАД ДЗВІНКІВ')
    cards=[(SCHEDULE,'Розклад занять','І семестр 2026–2027 навчального року','calendar'),(bells.get('url','/студенту/'),'Розклад дзвінків','Початок і завершення навчальних пар','calendar'),('/дистанційне-навчання/','Дистанційне навчання','Матеріали та освітні ресурси','book'),('/бібліотека/','Бібліотека','Навчальна література й корисні матеріали','book')]
    tiles='<div class="resource-tiles">'+''.join(link(u,icon(i)+f'<h2>{t}</h2><p>{d}</p>'+icon('external' if u.startswith('http') else 'arrow'),'resource-tile') for u,t,d,i in cards)+'</div>'
    life_links = [doc_link('Студентське самоврядування', '/студентське-самоврядування/')]
    life_links += [doc_link(title(BY_ID[i]), ROUTES[i]) for i in [1135, 1136, 1137, 372, 1615]]
    return page_heading('Студенту','Навчання, розклад і підтримка — усе потрібне в одному місці.')+f'<div class="container page-content">{tiles}<div class="content-columns"><section><h2 class="subheading">Навчальні ресурси</h2><div class="resource-list">{resource_groups(menu("СТУДЕНТУ"))}</div><h2 class="subheading spaced">Життя у коледжі</h2>'+''.join(life_links)+f'</section>{sidebar("/студенту/")}</div></div>'

def programs_page():
    return page_heading('Спеціальності','Знайди напрям, у якому твої ідеї стануть професією.')+f'<section class="container page-content"><div class="info-banner">{icon("cap")}<div><strong>G19 Будівництво та цивільна інженерія</strong><p>Освітньо-професійні програми коледжу для вступників 2026 року</p></div></div>{program_cards()}<div class="content-columns spaced"><section><h2 class="subheading">Дізнайся більше про навчання</h2>{doc_link("Освітньо-професійні програми",ROUTES[820])}{doc_link("Відділення будівництва та цивільної інженерії",ROUTES[9911])}{doc_link("Дипломне проєктування: проєктування та дизайн",ROUTES[9767])}{doc_link("Дипломне проєктування: будівництво",ROUTES[9812])}{doc_link("Перелік програм для вступу",ADMISSION_PROGRAMS)}</section>{sidebar("/спеціальності/")}</div></section>'

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
    material_target = ROUTES.get(814, '/навчально-матеріальна-база-2/') + '#material-base-gallery'
    return page_heading('Про коледж','Освіта, творчість і професійний досвід у центрі Житомира.')+f'''<div class="container page-content"><div class="about-intro"><img src="{CAMPUS}" alt="{FULL_DISPLAY}" width="800" height="560"><div><p class="eyebrow">Знайомся з {ABBR}</p><h2>Відбудовувати.<br>Створювати.<br>Рухатися вперед.</h2><p>{FULL_DISPLAY} готує фахівців для будівельної галузі.</p><p>Історія закладу почалася 26 вересня 1945 року зі створення Житомирського будівельного технікуму. Сьогодні студентське містечко коледжу розташоване в центрі Житомира.</p>{link(ROUTES[1480],'Історія коледжу '+icon('arrow'),'text-link')}</div></div><div class="facts"><div>{link(ROUTES[1480],'<strong class="display-number">1945</strong>','fact-number-link')}<span>рік заснування</span></div><div>{link(material_target,'<strong class="display-number">2</strong>','fact-number-link')}<span>навчально-лабораторні корпуси</span></div><div>{link(material_target,'<strong class="display-number">2</strong>','fact-number-link')}<span>студентські гуртожитки</span></div></div><div class="content-columns"><section><h2 class="subheading">Познайомся з коледжем ближче</h2>{resource_groups(menu('ПРО КОЛЕДЖ'))}</section>{sidebar('/про-коледж/')}</div></div>'''

def contacts():
    maps='https://www.google.com/maps/search/?api=1&query='+quote('ФКБАД Житомир Степана Бандери 6')
    panorama='https://www.google.com/maps/embed?pb=!4v1!6m8!1m7!1s45HCKK93GS4wM5-t3xUAlQ!2m2!1d28.6623673!2d50.2626345!3f153.51!4f6.3869310165970035!5f0.7820865974627469'
    return page_heading('Контакти','Маєш запитання про навчання чи вступ? Звертайся до нас.')+f'''<div class="container page-content"><div class="contact-layout"><section class="contact-details"><div><span class="contact-icon">{icon('pin')}</span><h2>Завітай до коледжу</h2><p>10029, Україна, м. Житомир<br>вул. Степана Бандери, 6</p>{link(maps,'Прокласти маршрут '+icon('external'),'text-link')}</div><div><span class="contact-icon">{icon('phone')}</span><h2>Зателефонуй</h2><a href="tel:+380412472847">(0412) 47-28-47</a><a href="tel:+380412422083">(0412) 42-20-83</a><a href="tel:+380412473004">(0412) 47-30-04</a></div><div><span class="contact-icon">{icon('mail')}</span><h2>Напиши нам</h2><a href="mailto:bkzt@ukr.net">bkzt@ukr.net</a><p class="form-privacy-note">Надсилай лише дані, потрібні для відповіді.</p></div></section><div class="location-photo panorama-frame map-consent" data-map-src="{escape(panorama,quote=True)}"><div class="map-consent-panel"><span class="contact-icon">{icon('pin')}</span><h2>Панорама Google Maps</h2><p>Панорама завантажується із серверів Google і може використовувати cookies та отримати технічні дані про пристрій. Вона не завантажиться без твого вибору.</p><button class="button" type="button" data-load-map>Завантажити панораму</button><a href="/політика-cookie/">Докладніше про cookies</a></div></div></div><div class="content-columns spaced"><section><h2 class="subheading">Приймальна комісія</h2><p class="page-lead">Контактна інформація для вступників</p>{doc_link('Контакти приймальної комісії',ADMISSION_CONTACTS)}{doc_link('Правила прийому на навчання у 2026 році',RULES)}{doc_link('Строки вступної кампанії',DATES)}</section><aside class="contact-social"><h2 class="subheading">Коледж у соціальних мережах</h2>{doc_link('Фейсбук','https://www.facebook.com/FKBAD')}{doc_link('Телеграм','https://t.me/FKBAD_PNY')}{doc_link('Інстаграм','https://www.instagram.com/fkbad_')}</aside></div></div>'''

DOCUMENTS=[]
seen_docs=set()
def add_doc(t,u,category):
    url=local_url(u)
    if not url or url in seen_docs or len(clean_text(t))<4:return
    if not (url.startswith('/uploads/') or any(k in url for k in ['drive.google.com','docs.google.com','.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','zakon.rada.gov.ua'])):return
    seen_docs.add(url);DOCUMENTS.append({'title':clean_text(t),'url':url,'category':category})
for group in MENUS:
    for item in flatten(group.get('children',[])): add_doc(item['label'],item['url'],group['label'].capitalize())
for pid in [591,797,798,796,1079,820,8327,8535]:
    for a in BeautifulSoup(BY_ID[pid]['content']['rendered'],'html.parser').select('a[href]'):
        add_doc(a.get_text(' ',strip=True),a['href'],title(BY_ID[pid]))
for document_file in (CONTENT/'documents').rglob('*.json'):
    document_data = json.loads(document_file.read_text(encoding='utf-8'))
    if document_data.get('published', True):
        add_doc(document_data.get('title', ''), document_data.get('file') or document_data.get('url', ''), document_data.get('category', 'Документи коледжу'))

def documents():
    rows=''.join(f'<div class="document-row" data-category="{escape(d["category"],quote=True)}">{doc_link(d["title"],d["url"],d["category"])}</div>' for d in DOCUMENTS)
    return page_heading('Документи','Правила, положення та навчальні матеріали коледжу.')+f'<div class="container page-content"><form class="filter-bar" id="document-filter" role="search" autocomplete="off"><div class="search-field">{icon("search")}<label class="sr-only" for="document-query">Назва документа</label><input id="document-query" type="search" placeholder="Знайти документ…" autocomplete="off"></div></form><p class="results-status" id="document-status" aria-live="polite">Документів: {len(DOCUMENTS)}</p><div class="content-columns"><section><div class="document-catalog">{rows}</div><div class="empty-state" id="document-empty" hidden><h2>Документів не знайдено</h2><p>Спробуй іншу назву.</p></div></section>{sidebar("/документи/")}</div></div>'

SEARCH=[]
for p in PAGES + POSTS:
    if p['id'] in [308,625]: continue
    SEARCH.append({'title':normalize_name_text(title(p)),'url':ROUTES[p['id']],'type':'Новина' if p.get('type')=='post' else 'Розділ','text':normalize_name_text(clean_text(p['content']['rendered'])[:2200]), 'date':date(p),'iso':iso_date(p),'image':featured(p) if p.get('type')=='post' else ''})
for d in DOCUMENTS:SEARCH.append({'title':d['title'],'url':d['url'],'type':'Документ','text':d['category']})
for t,u in [('Спеціальності','/спеціальності/'),('Документи','/документи/'),('Контакти','/контакти/'),('Розклад занять',SCHEDULE)]:SEARCH.append({'title':t,'url':u,'type':'Розділ','text':FULL_DISPLAY})

def news_listing(page=1):
    size=12;total=(len(POSTS)+size-1)//size
    cards=''.join(news_card(p) for p in POSTS[(page-1)*size:page*size])
    def page_url(i):return '/новини/' if i==1 else f'/новини/сторінка/{i}/'
    pagination=''
    for n in sorted({1,total,*range(max(1,page-2),min(total,page+2)+1)}):
        pagination+=f'<a href="{page_url(n)}"'+(' aria-current="page"' if n==page else '')+f' aria-label="Сторінка {n}">{n}</a>'
    if page<total:pagination+=link(page_url(page+1),'Далі '+icon('arrow'),'next-page')
    return page_heading('Новини','Події, досягнення та щоденне життя нашої спільноти.')+f'<div class="container page-content"><form id="news-filter" class="filter-bar" role="search" autocomplete="off"><div class="search-field">{icon("search")}<label class="sr-only" for="news-query">Пошук новин</label><input id="news-query" type="search" placeholder="Пошук у новинах…" autocomplete="off"></div></form><p class="results-status" id="news-status" aria-live="polite">Сторінка {page} з {total}</p><div class="news-grid" id="news-results">{cards}</div><nav class="pagination" id="news-pagination" aria-label="Сторінки новин">{pagination}</nav></div>'

def search_page():
    return page_heading('Пошук','Знайди новину, розділ або потрібний документ.')+f'<div class="container page-content search-page"><form class="filter-bar" id="site-search" action="/пошук/" role="search" autocomplete="off"><div class="search-field">{icon("search")}<label class="sr-only" for="site-query">Що шукаємо?</label><input type="search" id="site-query" name="q" placeholder="Наприклад, розклад або вступ…" autocomplete="off" required></div><button class="button" type="submit">Знайти</button></form><p id="search-status" class="results-status" aria-live="polite">Введи назву або ключове слово.</p><div id="search-results"></div><noscript><p>Для пошуку ввімкни JavaScript у браузері. Або скористайся розділами нижче.</p></noscript><div class="search-shortcuts"><h2 class="subheading">Часто шукають</h2>{doc_link('Розклад занять',SCHEDULE)}{doc_link('Правила прийому на навчання',RULES)}{doc_link('Документи коледжу','/документи/')}</div></div>'

def legal_page(title_text, lead, content):
    return page_heading(title_text,lead)+f'<div class="container page-content legal-page"><article class="prose legal-policy"><p class="legal-updated"><strong>Чинна редакція:</strong> 12 вересня 2026 року</p>{content}</article></div>'

def privacy_policy():
    return legal_page('Політика конфіденційності','Як сайт використовує та захищає мінімально необхідні дані',f'''
    <h2>Хто відповідає за дані</h2><p>Володільцем персональних даних є <a href="https://registry.edbo.gov.ua/university/229/entrant" target="_blank" rel="noopener noreferrer">Поліський національний університет</a> (код ЄДРПОУ 00493681), юридична адреса: 10008, Україна, м. Житомир, бульвар Старий, 7. Роботу цього сайту він організовує через {FULL_DISPLAY}, адреса підрозділу: 10029, Україна, м. Житомир, вул. Степана Бандери, 6. Запити щодо приватності на сайті: <a href="mailto:bkzt@ukr.net">bkzt@ukr.net</a>, телефон <a href="tel:+380412472847">(0412) 47-28-47</a>.</p>
    <h2>Що обробляється</h2><ul><li><strong>Технічні дані:</strong> IP-адреса, час і адреса запиту, тип браузера та пристрою, службові дані безпеки. Їх може обробляти хостинг Cloudflare для доставки сайту, захисту від атак і технічної діагностики.</li><li><strong>Налаштування на пристрої:</strong> тема оформлення, останній вибір групи або викладача та кеш розкладу. Ці дані зберігаються локально у браузері й не створюють облікового запису.</li><li><strong>Пошук:</strong> запити обробляються у браузері за локальним індексом сайту. Після оновлення сайту нові пошукові запити зберігаються у фрагменті URL, який не передається серверу під час HTTP-запиту.</li><li><strong>Звернення:</strong> сайт не має форми надсилання персональних даних. Якщо ви самостійно телефонуєте або пишете електронною поштою, коледж обробляє лише дані, потрібні для відповіді та виконання законних повноважень.</li></ul>
    <h2>Мета і правові підстави</h2><p>Дані використовуються для надання сторінок і розкладу, збереження обраних налаштувань, безпеки, відповіді на звернення та виконання завдань закладу освіти. Обробка здійснюється лише за наявності підстави, передбаченої законом: виконання повноважень і юридичних обов’язків, необхідність надати запитану функцію, захист мережі або згода користувача, коли вона потрібна.</p>
    <h2>Кому можуть передаватися дані</h2><p><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare</a> обробляє технічний мережевий трафік як постачальник хостингу й захисту. Google отримує дані лише після свідомого запуску Google Maps або Google Translate; застосовується <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">політика Google</a>. Розклад завантажується з сервісу «Всеосвіта» через серверний запит сайту; сервіс отримує параметр вибраної групи або викладача, а не введені користувачем ПІБ чи контактні дані. Деякі архівні відео зберігаються на попередньому домені коледжу fkbad.com.ua і запитуються лише після запуску відтворення. Переходи на зовнішні сайти регулюються політиками відповідних власників.</p>
    <h2>Форми та згода</h2><p>Наявні форми пошуку й фільтри не запитують ім’я, контакти або інші ідентифікаційні дані та не надсилають їх коледжу, тому окремий прапорець згоди в них не використовується. На сторінці контактів перед надсиланням електронного листа показано повідомлення про мінімізацію даних і посилання на цю політику. До запуску майбутньої форми звернення чи вступу в ній мають бути окремо зазначені мета, склад даних, строк зберігання та правова підстава, а згода — запитана незаздалегідь позначеним прапорцем лише тоді, коли саме згода є належною підставою.</p>
    <h2>Строк зберігання і захист</h2><p>Сайт не веде окремої бази відвідувачів. Локальні налаштування зберігаються до очищення даних браузера. Технічні журнали зберігаються постачальником інфраструктури лише в межах його налаштувань, договору та потреб безпеки. Доступ до даних звернень надається лише працівникам, яким він потрібен для відповіді або виконання обов’язків.</p>
    <h2>Ваші права</h2><p>Ви можете запитати, чи обробляються ваші дані, отримати доступ до них, вимагати виправлення або видалення незаконно чи неточно оброблених даних, заперечити проти обробки та звернутися до Уповноваженого Верховної Ради України з прав людини або до суду. Детальні права визначені <a href="https://zakon.rada.gov.ua/go/2297-17" target="_blank" rel="noopener noreferrer">Законом України «Про захист персональних даних»</a>.</p>
    <h2>Дані дітей</h2><p>Сайт призначений також для вступників і студентів, але не просить дітей створювати облікові записи або надсилати персональні дані через сайт. Не надсилайте чутливі дані електронною поштою без необхідності. Питання щодо даних неповнолітнього може подати його законний представник.</p>
    <h2>Зміни політики</h2><p>Нова редакція публікується на цій сторінці із зазначенням дати. Якщо спосіб збору даних суттєво зміниться, інформацію буде оновлено до запуску такої обробки.</p>''')

def terms_policy():
    return legal_page('Умови користування','Правила використання офіційного інформаційного сайту',f'''
    <h2>Призначення сайту</h2><p>Сайт надає інформацію про {FULL_DISPLAY}, вступ, освітні програми, документи, новини, контакти та розклад. Використовуючи сайт, ви погоджуєтеся з цими умовами та чинним законодавством України.</p>
    <h2>Офіційність інформації</h2><p>Ми прагнемо підтримувати матеріали актуальними, однак сайт не замінює оригінали нормативних актів, наказів, договорів і документів із підписом. У разі розбіжностей перевагу має офіційний документ або інформація, надана уповноваженим працівником коледжу. Розклад імпортується із «Всеосвіти» й може змінюватися після публікації.</p>
    <h2>Допустиме використання</h2><p>Заборонено втручатися в роботу сайту, обходити засоби захисту, створювати надмірне автоматизоване навантаження, поширювати шкідливий код або використовувати матеріали з порушенням прав інших осіб. Звичайне переглядання, цитування з посиланням та використання відкритих матеріалів для законних освітніх цілей дозволене, якщо інше не зазначено біля матеріалу.</p>
    <h2>Інтелектуальні права</h2><p>Тексти, дизайн і власні матеріали сайту охороняються законодавством. Права на матеріали третіх осіб, логотипи, карти, документи та фотографії належать відповідним правовласникам. Публікація матеріалу не означає передачу виключних прав.</p>
    <h2>Зовнішні сервіси</h2><p>Посилання на «Всеосвіту», Google, соціальні мережі та інші ресурси надані для зручності. Їхній вміст, доступність і правила контролюють відповідні власники. Перед передачею даних зовнішньому сервісу ознайомтеся з його умовами та політикою приватності.</p>
    <h2>Відповідальність</h2><p>Коледж не обмежує права, які не можуть бути обмежені законом. У межах, дозволених законодавством, коледж не відповідає за тимчасову недоступність, помилки сторонніх сервісів або рішення, прийняті лише на підставі неофіційної чи застарілої копії інформації. Про помилку можна повідомити на <a href="mailto:bkzt@ukr.net">bkzt@ukr.net</a>.</p>
    <h2>Застосовне право</h2><p>До цих умов застосовується законодавство України. Спори спочатку пропонується вирішувати шляхом звернення до коледжу, а якщо це неможливо — у порядку, визначеному законом.</p>''')

def cookie_policy():
    return legal_page('Політика cookies','Які дані сайт зберігає на пристрої та коли потрібна згода',f'''
    <h2>Чи потрібен банер згоди</h2><p>Сайт не використовує рекламні cookies, профілювання або власну клієнтську аналітику. Тому загальний банер «прийняти всі cookies» зараз не потрібен. Необхідні та запитані користувачем налаштування працюють без такого банера. Сторонній вміст Google Maps не завантажується до натискання кнопки, а Google Translate запускається лише після вибору англійської мови.</p>
    <h2>Локальні дані сайту</h2><div class="table-scroll"><table><thead><tr><th>Назва</th><th>Тип</th><th>Призначення</th><th>Строк</th></tr></thead><tbody><tr><td><code>fkbad-theme</code></td><td>localStorage</td><td>Запам’ятовує світлу або темну тему</td><td>До очищення браузера</td></tr><tr><td><code>fkbad.schedule.selection.v3</code></td><td>localStorage</td><td>Запам’ятовує режим і вибрану групу або викладача</td><td>До очищення браузера</td></tr><tr><td><code>fkbad.schedule.data.v3</code></td><td>localStorage</td><td>Зберігає останній отриманий розклад для швидкого повторного відкриття</td><td>До очищення браузера</td></tr><tr><td>Кеш PWA</td><td>Cache Storage</td><td>Дозволяє швидше відкривати основні файли та офлайн-сторінку</td><td>До оновлення версії або очищення браузера</td></tr></tbody></table></div>
    <h2>Сторонні сервіси</h2><ul><li><strong>Google Translate:</strong> після вибору ENG завантажує скрипт Google і може встановити cookie <code>googtrans</code> для обраної мови.</li><li><strong>Google Maps:</strong> панорама завантажується лише після натискання відповідної кнопки; Google може встановлювати власні cookies і отримувати IP-адресу, дані браузера та адресу сайту. Докладніше — у <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">політиці Google</a>.</li><li><strong>Cloudflare:</strong> забезпечує доставку та безпеку сайту, обробляє мережеві дані й технічні журнали відповідно до <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">політики Cloudflare</a>. Під час перевірки сайт не повертав заголовок <code>Set-Cookie</code> і не містив Cloudflare Web Analytics beacon.</li></ul>
    <h2>Керування даними</h2><p>Ви можете видалити локальні налаштування сайту нижче або через налаштування браузера. Після очищення тема й вибір розкладу повернуться до стандартних значень.</p><button class="button" type="button" data-clear-site-data>Очистити локальні дані</button><p class="legal-action-status" data-clear-status aria-live="polite"></p>
    <h2>Якщо функції зміняться</h2><p>Перед додаванням аналітики, реклами чи інших необов’язкових технологій сайт має отримувати попередню, конкретну й поінформовану згоду там, де цього вимагає застосовне право, та однаково просто дозволяти відмову. Для відвідувачів, на яких поширюється право ЄС, правила зберігання інформації на пристрої визначаються, зокрема, <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058" target="_blank" rel="noopener noreferrer">статтею 5(3) Директиви 2002/58/ЄС</a>.</p>''')

def refund_policy():
    return legal_page('Політика платежів і повернення коштів','Правила для платежів, пов’язаних із коледжем',f'''
    <h2>На сайті немає оплат</h2><p>Цей сайт не продає товари чи цифровий контент, не укладає платні договори онлайн, не приймає банківські картки та не обробляє платежі. Через це повернення коштів за покупку на сайті не застосовується.</p>
    <h2>Платежі поза сайтом</h2><p>Якщо оплата за навчання, проживання, документи або інші послуги здійснюється за окремим договором чи офіційними реквізитами, умови повернення визначаються відповідним договором, характером платежу та законодавством України. Ця сторінка не змінює і не обмежує права платника або споживача, встановлені законом.</p>
    <h2>Як подати запит</h2><p>Для ідентифікації платежу та належної процедури зверніться до коледжу за телефоном <a href="tel:+380412472847">(0412) 47-28-47</a> або електронною поштою <a href="mailto:bkzt@ukr.net">bkzt@ukr.net</a>. Не надсилайте повний номер банківської картки, CVV-код, пароль або одноразовий код. Коледж повідомить перелік лише тих документів, які необхідні для конкретного звернення.</p>
    <h2>Законодавчі гарантії</h2><p>Якщо до конкретного платежу застосовуються правила захисту прав споживачів або інші обов’язкові норми, вони мають перевагу над будь-яким положенням цієї політики. Дивіться <a href="https://zakon.rada.gov.ua/go/1023-12" target="_blank" rel="noopener noreferrer">Закон України «Про захист прав споживачів»</a>.</p>''')

COUNCIL = [
    ('Голова студентського самоврядування', [('Гуральська Анастасія', 'ІІІ-9/11-40А')], 'leader'),
    ('Заступник голови студентського самоврядування відділення «Проєктування та дизайн»', [('Гуральська Анастасія', 'ІІІ-9/11-40А')], 'design'),
    ('Заступник голови студентського самоврядування відділення «Будівництво та цивільна інженерія»', [('Антонюк Артем', 'ІІІ-9/11-131')], 'build'),
    ('Секретар студентського самоврядування', [('Фіалковська Марія', 'ІІ-9-16ОД')], 'edit'),
    ('Сектор військово-патріотичного виховання в коледжі', [('Грибук Ігор', 'ІІІ-9/11-132'), ('Лапінський Вадим', 'ІІ-11-26С')], 'shield'),
    ('Сектор культмасової роботи та дозвілля студентів і гурткової роботи', [('Башинський Назарій', 'І-9-134'), ('Сьомак Анастасія', 'ІІІ-9/11-15ОД'), ('Степура Анастасія', 'ІІ-9/11-17ОД')], 'music'),
    ('Сектор роботи з молодіжними громадськими організаціями', [('Бугаревич Поліна', 'ІІІ-9/11-14ОД')], 'users'),
    ('Робота зі ЗМІ, фоторепортаж, статті та публікації', [('Олійник Марія', 'IІІ-9/11-41А'), ('Самолюк Антоніна', 'І-9-18ОД/2П')], 'camera'),
    ('Сектор спорту та здоров’я', [], 'sport'),
    ('Сектор волонтерської роботи', [('Свінцицький Павло', 'ІІ-9/11-133'), ], 'heart'),
    ('Голова студентського самоврядування гуртожитку № 1, сектор роботи зі студпрофкомом', [('Міщенко Валерія', 'ІІ-9-16ОД')], 'home'),
]

def council_members(members):
    return '<ul class="council-members">'+''.join(f'<li><strong>{escape(name)}</strong><span>{escape(group)}</span></li>' for name,group in members)+'</ul>'

def council_board():
    desktop_rows=''.join(f'''<tr class="council-tone-{(index%6)+1}">
      <td><span class="council-number">{index:02}</span></td>
      <td><span class="council-role-icon">{icon(role_icon)}</span><strong class="council-role">{escape(role)}</strong></td>
      <td>{council_members(members)}</td>
    </tr>''' for index,(role,members,role_icon) in enumerate(COUNCIL,1))
    mobile_tabs=''.join(f'''<button class="council-tab council-tone-{(index%6)+1}" id="council-tab-{index}" type="button" role="tab" aria-selected="false" aria-controls="council-panel-{index}" data-council-tab="council-panel-{index}">
      <span class="council-role-icon">{icon(role_icon)}</span><span class="council-tab-copy"><small>{index:02}</small><strong>{escape(role)}</strong></span>{icon('arrow')}
    </button>''' for index,(role,members,role_icon) in enumerate(COUNCIL,1))
    mobile_panels=''.join(f'''<section class="council-panel council-tone-{(index%6)+1}" id="council-panel-{index}" role="tabpanel" aria-labelledby="council-tab-{index}" hidden>
      <div class="council-panel-mark"><span class="council-role-icon">{icon(role_icon)}</span><span>{index:02}</span></div>
      <p class="eyebrow">Напрям студентського самоврядування</p><h4>{escape(role)}</h4>{council_members(members)}
    </section>''' for index,(role,members,role_icon) in enumerate(COUNCIL,1))
    return f'''<div class="council-board">
      <div class="council-board-heading"><div class="council-board-title"><img src="{COUNCIL_LOGO}" alt="Логотип студентського самоврядування" width="82" height="81"><div><p class="eyebrow">Команда студентів</p><h3>Склад студентського самоврядування</h3></div></div></div>
      <div class="council-desktop"><table class="council-table"><thead><tr><th scope="col">№</th><th scope="col">Посада та обов’язки</th><th scope="col">Студенти та групи</th></tr></thead><tbody>{desktop_rows}</tbody></table></div>
      <div class="council-mobile" data-council>
        <div class="council-mobile-list"><p class="council-mobile-hint">Обери напрям, щоб переглянути склад</p><div class="council-tabs" role="tablist" aria-label="Склад студентського самоврядування">{mobile_tabs}</div></div>
        <div class="council-mobile-detail" hidden><button class="council-back" type="button" data-council-back>{icon('arrow')}<span>Усі напрями</span></button>{mobile_panels}</div>
      </div>
    </div>'''

def student_government():
    intro=f'''<section class="council-intro">
      <figure class="council-intro-media"><img src="{COUNCIL_HERO}" alt="Події та команда студентського самоврядування коледжу" width="2200" height="1556"></figure>
      <div class="council-intro-copy"><div><p class="eyebrow">Твій голос у коледжі</p><h2>Ідеї студентів<br>стають діями</h2><p>Студентське самоврядування представляє інтереси студентів, підтримує ініціативи та створює події, які об’єднують коледж.</p></div><div class="council-stats"><div><strong class="display-number">11</strong><span>напрямів роботи</span></div><div><strong class="display-number">13</strong><span>студентів у команді</span></div><div><strong class="display-number">1</strong><span>голова студентського самоврядування</span></div></div></div>
    </section>'''
    activity=f'''<section class="council-activity"><div class="council-section-heading"><p class="eyebrow">Що робить студентське самоврядування</p><h2>Від ідеї до результату</h2></div><div class="council-activity-grid">
      <article class="council-activity-card"><span>{icon('users')}</span><h3>Представляємо</h3><p>Допомагаємо студентам бути почутими та долучатися до рішень у коледжі.</p></article>
      <article class="council-activity-card"><span>{icon('music')}</span><h3>Організовуємо</h3><p>Створюємо зустрічі, культурні, спортивні й волонтерські події.</p></article>
      <article class="council-activity-card"><span>{icon('heart')}</span><h3>Підтримуємо</h3><p>Перетворюємо студентські ініціативи на спільні проєкти та корисні зміни.</p></article>
    </div></section>'''
    cta=f'''<section class="council-cta"><span>{icon('edit')}</span><div><p class="eyebrow">Є ідея</p><h2>Запропонуй наступну</h2><p>Розкажи про ініціативу представнику свого напряму або звернися до коледжу.</p></div><div class="button-row">{button('/контакти/','Зв’язатися')}{button('/новини/','Події студентів',True)}</div></section>'''
    heading=page_heading('Студентське самоврядування','Ініціативи, представництво та студентське життя коледжу').replace('page-heading container','page-heading container council-page-heading',1)
    return heading+f'<div class="container page-content council-page">{intro}{council_board()}{activity}{cta}</div>'

CUSTOM={'/вступнику/':('Вступнику',admissions),'/студенту/':('Студенту',students),'/спеціальності/':('Спеціальності',programs_page),'/про-коледж/':('Про коледж',about),'/контакти/':('Контакти',contacts),'/документи/':('Документи',documents),'/пошук/':('Пошук',search_page),'/студентське-самоврядування/':('Студентське самоврядування',student_government),'/політика-конфіденційності/':('Політика конфіденційності',privacy_policy),'/умови-користування/':('Умови користування',terms_policy),'/політика-cookie/':('Політика cookies',cookie_policy),'/повернення-коштів/':('Політика платежів і повернення коштів',refund_policy),SCHEDULE:('Розклад занять',lambda:(ROOT/'src/schedule.html').read_text(encoding='utf-8'))}
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
    if p['id'] == 814:
        content_soup = BeautifulSoup(content, 'html.parser')
        material_images = content_soup.select('img')
        if material_images:
            material_images[-1]['id'] = 'material-base-gallery'
        content = str(content_soup)
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
    body=page_heading(t,'',('/новини/','Новини'))+f'<div class="container article-container"><div class="article-meta"><time datetime="{iso_date(p)}">{date(p)}</time><span>{escape(p.get("category", "Життя коледжу"))}</span><button type="button" class="share-button" data-share>Поділитися {icon("external")}</button><span class="share-status" aria-live="polite"></span></div>{image}<article class="prose article-prose">{editorial_content(content)}</article><a class="text-link article-back" href="/новини/">Усі новини {icon("arrow")}</a></div><section class="section news-section"><div class="container">{section_heading("Читайте також","Інші новини")}<div class="news-grid">'+''.join(news_card(x) for x in others)+'</div></div></section>'
    write(path,shell(t,body,path,clean_text(content),True))

# Preserve important legacy page paths with static forwarding pages.
for p in PAGES:
    old=unquote(urlparse(p['link']).path);new=ROUTES[p['id']]
    if old!=new and old not in WRITTEN:
        write(old,f'<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={new}"><title>Перехід — {ABBR}</title><link rel="canonical" href="{new}"></head><body><a href="{new}">Перейти до розділу</a></body></html>')
# The former unsuffixed page was empty; forward it to the populated canonical route.
write('/навчально-матеріальна-база/', '<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/навчально-матеріальна-база-2/"><link rel="canonical" href="/навчально-матеріальна-база-2/"></head><body><a href="/навчально-матеріальна-база-2/">Перейти до навчально-матеріальної бази</a></body></html>')

not_found=page_heading('Сторінку не знайдено','Можливо, посилання змінилося. Скористайся пошуком або повернися на головну.')+f'<div class="container page-content button-row">{button("/пошук/","Знайти на сайті")}{button("/","На головну",True)}</div>'
write('/404.html',shell('Сторінку не знайдено',not_found,'/404.html'),standalone=True)
# Include the actual menu labels, including groups with no standalone page.
def index_navigation(items, parents=(), prefix=''):
    overview = {'ОСВІТНІЙ ПРОЦЕС':'https://learn.fkbad.com.ua/','ПРО КОЛЕДЖ':'/про-коледж/','ВСТУПНИКУ':'/вступнику/','СТУДЕНТУ':'/студенту/','БІБЛІОТЕКА':'/бібліотека/','ВИХОВНА РОБОТА':'/виховна-робота/','НОВИНИ':'/новини/'}
    for index, item in enumerate(items):
        node_id = prefix + str(index)
        label = navigation_label(item['label'])
        url = overview.get(item['label'].upper(), item.get('url'))
        unavailable = url in (None, '#', 'http://2')
        target = '/#menu-' + node_id if unavailable else local_url(url)
        context = ' · '.join((*parents, label))
        if unavailable and not item.get('children'):
            context += ' · Матеріал поки недоступний на вихідному сайті'
        SEARCH.append({'title':label,'url':target,'type':'Розділ','text':context})
        index_navigation(item.get('children', []), (*parents, label), node_id+'-')
index_navigation(NAVIGATION)

(OUT/'search-index.json').write_text(json.dumps(SEARCH,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(OUT/'route-map.json').write_text(json.dumps({str(k):v for k,v in ROUTES.items()},ensure_ascii=False),encoding='utf-8')
(OUT/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n',encoding='utf-8')
print(f'Built {len(WRITTEN)} pages, {len(POSTS)} articles, {len(DOCUMENTS)} documents; {len(COPIED)} referenced images.')
