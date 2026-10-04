"""One-time migration of library records into fields matching the public page."""
from pathlib import Path
import ast, json, re, yaml, zipfile

root = Path(__file__).resolve().parents[1]
backup = root.parent / 'backups/2026-10-04-before-visual-cms.zip'
if not backup.exists():
    backup.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ['build.py', 'src/admin/config.yml', 'src/admin/index.html', 'src/content/library.json', 'src/content/navigation-source.json']:
            archive.write(root / name, name)

library_path = root / 'src/content/library.json'
data = json.loads(library_path.read_text(encoding='utf-8'))
source = (root / 'build.py').read_text(encoding='utf-8')
if 'stories' not in data:
    start = source.index('    portfolio_stories = [')
    end = source.index('    def portfolio_story_html', start)
    stories = ast.literal_eval(source[start:end].split('=', 1)[1].strip())
    start = source.index('    portfolio_decorations = {')
    end = source.index('    portfolio_stories', start)
    decorations = ast.literal_eval(source[start:end].split('=', 1)[1].strip())
    slides = {item['number']: item for item in data['portfolio_slides']}
    data['stories'] = []
    for title, text, numbers in stories:
        images = []
        seen = set()
        for number in numbers:
            for src in slides.get(number, {}).get('images', []):
                if Path(src).name in decorations or src in seen:
                    continue
                seen.add(src)
                images.append({'src': src, 'alt': 'Архівне фото бібліотеки коледжу: ' + title})
        data['stories'].append({'title': title, 'text': text, 'images': images})
    for key in ('arrivals', 'exhibition'):
        section = data['pages'][key]
        records, current = [], []
        for block in section['blocks']:
            starts = len(block) < 45 and re.match(r'^\s*[\d(]', block) and '[Текст]' not in block
            if starts:
                if current: records.append(current)
                current = [block]
            elif current:
                current.append(block)
        if current: records.append(current)
        books = []
        for record in records:
            citation = next((part for part in record if '[Текст]' in part), '')
            if not citation: continue
            cover = section['images'][len(books)] if len(books) < len(section['images']) else {}
            books.append({'code': record[0], 'title': citation.split('[Текст]')[0].strip(),
                          'citation': citation, 'description': ' '.join(x for x in record[1:] if x != citation),
                          'cover': cover.get('src', ''), 'alt': cover.get('alt', '')})
        section['books'] = books
        section.pop('blocks', None)
        section.pop('images', None)
    data['intro'] = {
        'title': 'Головна сторінка бібліотеки',
        'lead': 'Книги, нові надходження, події та документи бібліотеки - в одному просторі.',
        'heading': 'Простір для навчання, пошуку й відкриттів',
        'description': 'Бібліотека ВСП «Фаховий коледж будівництва, архітектури та дизайну Поліського національного університету» поєднує абонемент, читальну залу та електронні інформаційні ресурси. Вона допомагає студентам і викладачам знаходити навчальну, фахову та художню літературу, готує тематичні добірки й підтримує культурне життя коледжу.',
        'about_description': 'Люди, книжки й події, які творили її історію. Архівні світлини та відомості взято з презентації 2017 року; цифри й персональні дані описують саме той час.'}
    for item in data['documents']:
        item['section'] = 'arrivals' if '2026' in item['title'] else 'rules'
    for title, url in data.pop('word_documents', {}).items():
        data['documents'].append({'title': title, 'url': url, 'section': 'rules'})
    data.pop('portfolio_slides', None)
    data.pop('portfolio', None)
    library_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def field(name, label, widget='string', **kwargs):
    return dict(name=name, label=label, widget=widget, **kwargs)

photos = field('images', 'Фотографії', 'list', required=False, collapsed=True, summary='{{alt}}', fields=[
    field('src', 'Фото', 'image'), field('alt', 'Опис фото', required=False)])
files = field('files', 'Документи й посилання', 'list', required=False, collapsed=True, summary='{{label}}', fields=[
    field('label', 'Назва'), field('url', 'Файл або посилання', 'file')])
books = field('books', 'Книги', 'list', required=False, collapsed=True, summary='{{title}}', fields=[
    field('title', 'Назва книги'), field('cover', 'Обкладинка', 'image', required=False),
    field('alt', 'Опис обкладинки', required=False), field('code', 'Бібліотечний індекс', required=False),
    field('citation', 'Бібліографічний опис', 'text', required=False),
    field('description', 'Про книгу', 'text', required=False)])
names = {'home': 'Про бібліотеку', 'news': 'Бібліотека інформує', 'exhibition': 'Віртуальна виставка',
         'arrivals': 'Нові надходження', 'periodicals': 'Періодичні видання', 'rules': 'Нормативна база', 'events': 'Заходи'}
sections = []
for key, label in names.items():
    fields = [field('title', 'Назва розділу'), field('description', 'Опис розділу', 'text', required=False)]
    if key in ('arrivals', 'exhibition'):
        fields.append(books)
    elif key != 'home':
        fields += [field('blocks', 'Видання' if key == 'periodicals' else 'Текст', 'list', required=False,
                         field=field('item', 'Назва' if key == 'periodicals' else 'Абзац', 'text')), photos]
    fields.append(files)
    sections.append(field(key, label, 'object', collapsed=True, fields=fields))
library_fields = [
    field('intro', 'Заголовок і опис бібліотеки', 'object', fields=[
        field('title', 'Заголовок сторінки'), field('lead', 'Короткий опис', 'text'),
        field('heading', 'Вітальний заголовок'), field('description', 'Вітальний текст', 'text'),
        field('about_description', 'Опис історії бібліотеки', 'text', required=False)]),
    field('stories', 'Історія бібліотеки: текст і фото', 'list', collapsed=True, summary='{{title}}', required=False,
          fields=[field('title', 'Заголовок'), field('text', 'Текст', 'text'), photos]),
    field('pages', 'Розділи бібліотеки', 'object', fields=sections),
    field('documents', 'Документи бібліотеки', 'list', required=False, collapsed=True, summary='{{title}}', fields=[
        field('title', 'Назва документа'), field('url', 'Файл або посилання', 'file'),
        field('section', 'Показати в розділі', 'select', default='rules',
              options=[{'label': label, 'value': key} for key, label in names.items()])])]

config_path = root / 'src/admin/config.yml'
config = yaml.safe_load(config_path.read_text(encoding='utf-8'))
config['backend']['site_domain'] = 'fkbad.site'
config['backend']['base_url'] = 'https://fkbad.site'
config['local_backend'] = True
for collection in config['collections']:
    if collection['name'] == 'library':
        collection['files'][0]['fields'] = library_fields
        collection['files'][0]['editor'] = {'preview': True}
    if collection['name'] in ('news', 'pages'):
        if collection['name'] == 'pages':
            collection['create'] = True
        for f in collection['fields']:
            if f.get('name') == 'body':
                f['widget'] = 'visual'
                f['hint'] = 'Редагуй текст і таблиці як у звичайному текстовому редакторі. Фото можна додати нижче.'
                for old in ('modes', 'buttons', 'editor_components'): f.pop(old, None)
            if f.get('name') in ('legacy_id', 'route'): f['required'] = False
            if f.get('name') == 'content_blocks':
                f['label'] = 'Додаткові фото, галереї та матеріали'
                f['summary'] = '{{value}}{{caption}}{{label}}'
                f['collapsed'] = True
        body = next(f for f in collection['fields'] if f['name'] == 'body')
        collection['fields'].remove(body)
        block_index = next(i for i, f in enumerate(collection['fields']) if f['name'] == 'content_blocks')
        collection['fields'].insert(block_index, body)
config_path.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False, width=120), encoding='utf-8')
print('Visual library fields prepared:', len(data['stories']), 'stories;',
      len(data['pages']['arrivals']['books']), 'new books;', len(data['pages']['exhibition']['books']), 'exhibition books')
