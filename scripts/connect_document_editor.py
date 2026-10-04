"""One-time import of the existing catalog, so CMS edits and deletions are authoritative."""
from pathlib import Path
from bs4 import BeautifulSoup
import hashlib, json, subprocess

root = Path(__file__).resolve().parents[1]
folder = root / 'src/content/documents'
folder.mkdir(exist_ok=True)
if list(folder.glob('*.json')):
    print('Document catalog already connected')
else:
    content = subprocess.run(['git','show','HEAD:dist/документи/index.html'],cwd=root,
                             capture_output=True,check=True).stdout.decode('utf-8')
    page = BeautifulSoup(content,'html.parser')
    rows = page.select('.document-row')
    if not rows: raise ValueError('Existing catalog is empty; refusing to migrate')
    for row in rows:
        link = row.select_one('a[href]')
        record = {'title':link.strong.get_text(' ',strip=True),'category':row['data-category'],
                  'url':link['href'],'published':True}
        name = hashlib.sha256(link['href'].encode()).hexdigest()[:16]
        (folder/(name+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Document records connected:',len(rows))
