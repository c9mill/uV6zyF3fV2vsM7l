"""Bring existing designed pages into the CMS without flattening their layouts."""
from pathlib import Path
from bs4 import BeautifulSoup
import re, yaml

root = Path(__file__).resolve().parents[1]
routes = ['про-коледж', 'студенту', 'вступнику', 'документи', 'контакти', 'спеціальності']
components = {'programs':'.program-grid', 'documents':'.document-catalog', 'resources':'.resource-group',
              'sidebar':'.page-sidebar', 'status':'.results-status', 'filters':'.filter-bar'}
files = list((root / 'src/content/pages').glob('*.md'))
for route in routes:
    match_path = None
    metadata = {}
    for path in files:
        text = path.read_text(encoding='utf-8')
        match = re.match(r'^---\s*\n(.*?)\n---', text, re.S)
        info = yaml.safe_load(match.group(1)) or {}
        if info.get('route', '').strip('/') == route:
            match_path, metadata = path, info
            break
    if metadata.get('visual_layout'): continue
    page = BeautifulSoup((root / 'dist' / route / 'index.html').read_text(encoding='utf-8'), 'html.parser')
    main = page.main
    metadata['title'] = main.h1.get_text(' ', strip=True)
    metadata['route'] = '/' + route + '/'
    metadata['published'] = True
    metadata['visual_layout'] = True
    for old in main.select('.section-explorer'): old.decompose()
    for name, selector in components.items():
        for index, node in enumerate(main.select(selector)):
            wrapper = page.new_tag('div', attrs={'data-cms-component':name + '-' + str(index), 'class':'cms-component'})
            node.wrap(wrapper)
    match_path = match_path or root / 'src/content/pages' / ('cms-' + route + '.md')
    match_path.write_text('---\n' + yaml.safe_dump(metadata, allow_unicode=True, sort_keys=False).strip() + '\n---\n'
                          + main.decode_contents() + '\n', encoding='utf-8')
config_path = root / 'src/admin/config.yml'
config = yaml.safe_load(config_path.read_text(encoding='utf-8'))
fields = next(c for c in config['collections'] if c['name'] == 'pages')['fields']
if not any(f['name'] == 'visual_layout' for f in fields):
    fields.append({'name':'visual_layout','widget':'hidden','required':False})
config_path.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False, width=120), encoding='utf-8')
print('Designed page editors connected:', len(routes))
