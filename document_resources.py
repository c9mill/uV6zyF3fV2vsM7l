"""Shared, accessible inline readers for document links across all CMS pages."""
import re
from urllib.parse import urlparse, parse_qs, unquote
from bs4 import BeautifulSoup


DRIVE_ICON = '''<svg class="icon resource-drive-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0F9D58" d="M8 2h8L4 23 0 16z"/><path fill="#F4B400" d="M8 2h8l8 14h-8z"/><path fill="#4285F4" d="M4 23l4-7h16l-4 7z"/></svg>'''
FILE_ICON = '''<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M14 3H6v18h14V9zM14 3v6h6M8 13h8m-8 4h6"/></svg>'''
CHEVRON = '''<svg class="icon nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'''


def google_preview(url):
    parsed = urlparse(url)
    if parsed.hostname == 'drive.google.com':
        match = re.search(r'/file/d/([\w-]+)', parsed.path)
        file_id = match.group(1) if match else parse_qs(parsed.query).get('id', [''])[0]
        if re.fullmatch(r'[\w-]+', file_id):
            return f'https://drive.google.com/file/d/{file_id}/preview'
    if parsed.hostname == 'docs.google.com':
        match = re.match(r'/(document|spreadsheets|presentation|drawings)/(?:u/\d+/)?d/([\w-]+)', parsed.path)
        if match:
            kind, file_id = match.groups()
            mode = 'embed' if kind == 'presentation' else 'preview'
            return f'https://docs.google.com/{kind}/d/{file_id}/{mode}'
    return ''


def enhance_document_resources(page, resolve_url):
    main = page.find('main')
    if not main:
        return
    # Existing library readers retain their layout and use the same Drive mark.
    for reader in main.select('.library-document'):
        frame = reader.find('iframe')
        summary = reader.find('summary', recursive=False)
        if frame and summary and google_preview(frame.get('src') or frame.get('data-deferred-src', '')):
            old_icon = summary.find('svg')
            if old_icon:
                old_icon.replace_with(BeautifulSoup(DRIVE_ICON, 'html.parser'))

    for anchor in list(main.select('a[href]')):
        if not anchor.parent or anchor.find_parent(['nav', 'summary']) or anchor.find_parent(class_='library-document'):
            continue
        if anchor.find('img') or anchor.find_parent(class_='document-reader'):
            continue
        url = resolve_url(anchor['href'])
        if not url:
            continue
        parsed = urlparse(url)
        if parsed.scheme not in ('', 'http', 'https'):
            continue
        google = parsed.hostname in ('drive.google.com', 'docs.google.com')
        preview = google_preview(url)
        suffix = unquote(parsed.path).lower()
        image = bool(re.search(r'\.(?:png|jpe?g|webp|gif|avif|svg)$', suffix))
        pdf = suffix.endswith('.pdf')
        card = 'document-link' in anchor.get('class', [])
        if not (card or preview or image or pdf):
            continue
        strong = anchor.find('strong')
        label = strong.get_text(' ', strip=True) if strong else anchor.get_text(' ', strip=True)
        if not label:
            continue
        if anchor.parent.name == 'p' and (preview or image or pdf):
            anchor.parent.name = 'div'
        if image:
            figure = page.new_tag('figure', attrs={'class': 'document-image'})
            caption = page.new_tag('figcaption')
            caption.string = label
            picture = page.new_tag('img', src=url, alt=label, loading='lazy', decoding='async')
            figure.extend([caption, picture])
            anchor.replace_with(figure)
        elif preview or pdf:
            reader = page.new_tag('details', attrs={'class': 'document-reader'})
            summary = page.new_tag('summary', attrs={'class': 'document-link'})
            summary.append(BeautifulSoup(DRIVE_ICON if google else FILE_ICON, 'html.parser'))
            title = page.new_tag('strong')
            title.string = label
            summary.append(title)
            summary.append(BeautifulSoup(CHEVRON, 'html.parser'))
            body = page.new_tag('div', attrs={'class': 'document-reader-body', 'data-lenis-prevent': ''})
            frame = page.new_tag('iframe', title=label, loading='lazy', attrs={'data-deferred-src': preview or url.split('#')[0] + '#view=FitH'})
            body.append(frame)
            # A usable fallback remains available if a remote owner restricts preview.
            fallback = page.new_tag('a', href=url, attrs={'class': 'document-reader-source'})
            if pdf and not google:
                fallback['download'] = ''
                fallback.string = 'Завантажити документ'
            else:
                fallback['target'] = '_blank'
                fallback['rel'] = 'noopener noreferrer'
                fallback.string = 'Відкрити оригінал'
            body.append(fallback)
            reader.extend([summary, body])
            anchor.replace_with(reader)
        elif card:
            for description in anchor.select('small'):
                description.decompose()
            if google:
                old_icon = anchor.find('svg')
                if old_icon:
                    old_icon.replace_with(BeautifulSoup(DRIVE_ICON, 'html.parser'))
