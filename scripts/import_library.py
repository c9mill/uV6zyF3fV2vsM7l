"""Snapshot the public college library Google Site and its public PDFs."""
from __future__ import annotations

import hashlib
import json
import re
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

    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps({'source': BASE.rstrip('/'), 'pages': pages,
                                     'documents': documents, 'word_documents': DOCS,
                                     'portfolio': 'https://drive.google.com/file/d/16QKDpGZ9EcEy9f6HGpQLxlPc-kuPqK71/preview'},
                                    ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Saved {len(pages)} sections, {sum(len(p['blocks']) for p in pages.values())} text blocks, "
          f"{sum(len(p['images']) for p in pages.values())} images and {len(documents)} PDFs.")


if __name__ == '__main__':
    main()
