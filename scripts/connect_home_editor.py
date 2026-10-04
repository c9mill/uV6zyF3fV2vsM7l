"""Expose the current home page as visual CMS fields, preserving its design."""
from pathlib import Path
from bs4 import BeautifulSoup
import json, yaml

root = Path(__file__).resolve().parents[1]
path = root / 'src/content/settings/home.json'
if not path.exists():
    page = BeautifulSoup((root / 'dist/index.html').read_text(encoding='utf-8'), 'html.parser')
    hero = page.select_one('.hero-centered')
    data = {
        'headline_lines': [item.get_text() for item in hero.select('.hero-word')],
        'college_name': hero.select_one('.hero-college-name').get_text(),
        'background': hero.select_one('.hero-background')['src'],
        'buttons': [{'label':a.get_text(' ',strip=True),'url':a['href']} for a in hero.select('.button-row a')],
        'quick_links': [{'title':a.strong.get_text(), 'subtitle':a.small.get_text() if a.small else '',
                         'url':a['href'], 'icon':icon} for a,icon in zip(page.select('.quick-links>a'), ['calendar','cap','file'])],
        'news_count':5,
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
config_path = root / 'src/admin/config.yml'
config = yaml.safe_load(config_path.read_text(encoding='utf-8'))
entry = {'name':'homepage','label':'Головна сторінка','file':'src/content/settings/home.json','format':'json',
         'editor':{'preview':True},'fields':[
             {'name':'headline_lines','label':'Рядки головного заголовка','widget':'list','field':{'name':'line','label':'Рядок','widget':'string'}},
             {'name':'college_name','label':'Повна назва коледжу','widget':'text'},
             {'name':'background','label':'Фонове фото','widget':'image'},
             {'name':'buttons','label':'Основні кнопки','widget':'list','collapsed':True,'summary':'{{label}}','fields':[
                 {'name':'label','label':'Напис на кнопці','widget':'string'}, {'name':'url','label':'Посилання','widget':'string'}]},
             {'name':'quick_links','label':'Швидкі посилання','widget':'list','collapsed':True,'summary':'{{title}}','fields':[
                 {'name':'title','label':'Назва','widget':'string'}, {'name':'subtitle','label':'Підпис','widget':'string','required':False},
                 {'name':'url','label':'Посилання','widget':'string'},
                 {'name':'icon','label':'Іконка','widget':'select','options':[{'label':'Календар','value':'calendar'},
                     {'label':'Навчання','value':'cap'},{'label':'Документ','value':'file'},{'label':'Книга','value':'book'}]}]},
             {'name':'news_count','label':'Кількість останніх новин','widget':'number','value_type':'int','min':1,'max':10,'default':5}
         ]}
settings = next(c for c in config['collections'] if c['name']=='settings')
settings['files'] = [entry] + [f for f in settings['files'] if f['name']!='homepage']
for item in settings['files']:
    if item['name']=='general': item['fields']=[f for f in item['fields'] if f['name']!='hero_description']
config_path.write_text(yaml.safe_dump(config,allow_unicode=True,sort_keys=False,width=120),encoding='utf-8')
print('Home page editor connected')
