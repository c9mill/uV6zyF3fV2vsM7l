"""Vendor pinned public editor dependencies; the admin needs no external editor account."""
from pathlib import Path
import io, json, tarfile, urllib.request

target = Path(__file__).resolve().parents[1] / 'src/admin/vendor'
target.mkdir(parents=True, exist_ok=True)

def package(name, version=None):
    metadata = json.load(urllib.request.urlopen('https://registry.npmjs.org/' + name, timeout=30))
    if version is None:
        version = metadata['dist-tags']['latest']
    entry = metadata['versions'][version]
    archive = tarfile.open(fileobj=io.BytesIO(urllib.request.urlopen(entry['dist']['tarball'], timeout=60).read()), mode='r:gz')
    print(name, version)
    return archive

tiny = package('tinymce', '8.9.2')
for member in tiny.getmembers():
    rel = member.name.removeprefix('package/')
    keep = (rel in ('tinymce.min.js', 'license.txt', 'LICENSE.TXT', 'license.md')
            or rel.startswith(('icons/default/', 'models/dom/', 'themes/silver/', 'skins/ui/oxide/', 'skins/content/default/'))
            or any(rel.startswith('plugins/' + name + '/') for name in ('lists', 'link', 'table')))
    runtime = rel.endswith('.min.js') or rel.endswith('.min.css') or 'license' in rel.lower()
    if not keep or not member.isfile() or not runtime: continue
    out = target / 'tinymce' / rel
    if not out.resolve().is_relative_to(target.resolve()): raise ValueError('Invalid package path')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(tiny.extractfile(member).read())
for name, version, source, dest in [('marked','15.0.12','package/lib/marked.umd.js','marked.js'),
                                     ('dompurify','3.4.16','package/dist/purify.min.js','purify.js')]:
    archive = package(name, version)
    (target / dest).write_bytes(archive.extractfile(source).read())
    for member in archive.getmembers():
        if member.isfile() and member.name.split('/')[-1].lower() in ('license', 'license.txt', 'license.md'):
            (target / (name + '-LICENSE.txt')).write_bytes(archive.extractfile(member).read())
try:
    archive = package('tinymce-i18n', '26.9.28')
    language = archive.extractfile('package/langs8/uk.js').read()
    (target / 'tinymce/langs').mkdir(exist_ok=True)
    (target / 'tinymce/langs/uk.js').write_bytes(language)
except Exception:
    print('Ukrainian language pack unavailable; toolbar uses custom Ukrainian labels.')
