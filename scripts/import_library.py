"""Snapshot the public college library Google Site and its public PDFs."""
from __future__ import annotations

import hashlib
import json
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / 'src' / 'assets' / 'library'
DATA_FILE = ROOT / 'src' / 'content' / 'library.json'
BASE = 'https://sites.google.com/view/biblka/'
PAGES = {
    'home': '',
    'news': 'бібліотека-інформує',
    'exhibition': 'віртуальна-виставка',
    'arrivals': 'нові-надходження',
    'periodicals': 'періодичні-видання',
    'rules': 'нормативна-база',
    'events': 'заходи-в-бібліотеці',
}
FILES = {
    'Правила користування електронною читальною залою': ('1eX1MxqPpjJ9_V06VNPzC6HvqSbolrhRd', 'reading-room-rules.pdf'),
    'Витяг з протоколу': ('1N7OV0nrtF0AWDOVBK_NbZzNFopyYsqii', 'library-minutes-extract.pdf'),
    'Результати вибору підручників для 10 класу': ('13FQeVl3A0bzbBnoLwEO53W7o6BaxX75i', 'textbook-selection-results.pdf'),
    'Список нових надходжень літератури 2026': ('1Y2SLat8sS4F8AC_WqPwRGmr_pzf-UB4F', 'new-books-2026.pdf'),
}
DOCS = {
    'Положення про бібліотеку': '1GLZauRWW1N6EAO3imYhGcxwLQiTa_h2i',
    'Правила користування бібліотекою': '1jRMJPdkMCu-jlKMbU9fP7zEc_74PhqB7',
}
PORTFOLIO_ID = '16QKDpGZ9EcEy9f6HGpQLxlPc-kuPqK71'


def import_portfolio(session: requests.Session) -> list[dict]:
    """Extract the public slide deck as readable text plus optimized local photos."""
    response = session.get(f'https://drive.google.com/uc?export=download&id={PORTFOLIO_ID}', timeout=120)
    response.raise_for_status()
    if not response.content.startswith(b'PK'):
        return []
    from io import BytesIO
    deck = zipfile.ZipFile(BytesIO(response.content))
    media_dir = ASSET_DIR / 'portfolio'
    media_dir.mkdir(parents=True, exist_ok=True)
    ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
          'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'rel': 'http://schemas.openxmlformats.org/package/2006/relationships'}
    slides = sorted((name for name in deck.namelist()
                     if re.fullmatch(r'ppt/slides/slide\d+\.xml', name)),
                   key=lambda name: int(re.search(r'slide(\d+)', name).group(1)))
    saved: dict[str, str] = {}
    result = []
    for slide_name in slides:
        number = int(re.search(r'slide(\d+)', slide_name).group(1))
        root = ET.fromstring(deck.read(slide_name))
        text = ' '.join(' '.join((node.text or '').split()) for node in root.findall('.//a:t', ns)).strip()
        images = []
        rel_name = f'ppt/slides/_rels/slide{number}.xml.rels'
        if rel_name in deck.namelist():
            rels = {node.attrib['Id']: node.attrib['Target'] for node in ET.fromstring(deck.read(rel_name))
                    if node.attrib.get('Type', '').endswith('/image')}
            for blip in root.findall('.//a:blip', ns):
                target = rels.get(blip.attrib.get(f'{{{ns["r"]}}}embed', ''))
                if not target:
                    continue
                media_name = posixpath.normpath(posixpath.join('ppt/slides', target))
                if media_name not in saved:
                    from PIL import Image
                    from io import BytesIO
                    try:
                        photo = Image.open(BytesIO(deck.read(media_name)))
                        if photo.width > 1600:
                            height = round(photo.height * 1600 / photo.width)
                            photo = photo.resize((1600, height), Image.Resampling.LANCZOS)
                        filename = hashlib.sha1(media_name.encode()).hexdigest()[:14] + '.jpg'
                        photo.convert('RGB').save(media_dir / filename, 'JPEG', quality=80, optimize=True)
                        saved[media_name] = '/assets/library/portfolio/' + filename
                    except (OSError, KeyError):
                        continue
                if media_name in saved:
                    images.append(saved[media_name])
        result.append({'number': number, 'text': text, 'images': list(dict.fromkeys(images))})
    deck.close()
    return result


def local_image(session: requests.Session, url: str, page: str) -> str | None:
    try:
        response = session.get(url, timeout=40)
        response.raise_for_status()
        if not response.headers.get('Content-Type', '').startswith('image/'):
            return None
        suffix = '.jpg' if 'jpeg' in response.headers.get('Content-Type', '') else '.png'
        name = hashlib.sha1((page + url).encode()).hexdigest()[:14] + suffix
        target = ASSET_DIR / 'images' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(response.content)
        return '/assets/library/images/' + name
    except requests.RequestException:
        return None


def main() -> None:
    session = requests.Session()
    session.headers['User-Agent'] = 'Mozilla/5.0 (compatible; FKBADLibraryImport/1.0)'
    pages: dict[str, dict] = {}
    images_seen: set[str] = set()
    for key, slug in PAGES.items():
        url = urljoin(BASE, quote(slug))
        response = session.get(url, timeout=40)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        content = soup.select('div.tyJCtd')
        blocks = []
        pictures = []
        for area in content:
            for paragraph in area.select('p'):
                text = ' '.join(paragraph.get_text(' ', strip=True).split())
                if text:
                    blocks.append(text)
            for image in area.select('img'):
                source = image.get('src') or image.get('data-src') or ''
                if not source or source in images_seen:
                    continue
                images_seen.add(source)
                local = local_image(session, source, key)
                if local:
                    pictures.append({'src': local, 'alt': image.get('alt', '').strip()})
        links = []
        for link in soup.select('div.tyJCtd a[href]'):
            href = link.get('href', '')
            if href.startswith('https://drive.google.com/file/d/'):
                links.append({'label': ' '.join(link.get_text(' ', strip=True).split()), 'url': href})
        pages[key] = {'title': soup.title.get_text(' ', strip=True) if soup.title else '',
                      'blocks': blocks, 'images': pictures, 'files': links}

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    documents = []
    for label, (file_id, filename) in FILES.items():
        url = f'https://drive.google.com/uc?export=download&id={file_id}'
        response = session.get(url, timeout=90)
        response.raise_for_status()
        if not response.content.startswith(b'%PDF'):
            continue
        target = ASSET_DIR / filename
        target.write_bytes(response.content)
        documents.append({'title': label, 'url': '/assets/library/' + target.name})
    # Remove artifacts from an earlier naming pass of this same importer.
    for stale_name in ('.pdf', '10.pdf', '2026.pdf'):
        (ASSET_DIR / stale_name).unlink(missing_ok=True)

    portfolio_slides = import_portfolio(session)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps({'source': BASE.rstrip('/'), 'pages': pages,
                                     'documents': documents, 'word_documents': DOCS,
                                     'portfolio': 'https://drive.google.com/file/d/16QKDpGZ9EcEy9f6HGpQLxlPc-kuPqK71/preview',
                                     'portfolio_slides': portfolio_slides},
                                    ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Saved {len(pages)} sections, {sum(len(p['blocks']) for p in pages.values())} text blocks, "
          f"{sum(len(p['images']) for p in pages.values())} images, {len(documents)} PDFs and "
          f"{len(portfolio_slides)} portfolio slides.")


if __name__ == '__main__':
    main()
