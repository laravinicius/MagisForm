"""Verifica referências locais e estrutura básica antes da inspeção no navegador."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links, self.refs = set(), [], []
        self.h1 = 0
    def handle_starttag(self, tag, items):
        attrs = dict(items)
        if tag == 'h1': self.h1 += 1
        if 'id' in attrs:
            if attrs['id'] in self.ids: errors.append(f'ID duplicado: {attrs["id"]}')
            self.ids.add(attrs['id'])
        for key in ['src','href']:
            if attrs.get(key): self.refs.append(attrs[key])
        if attrs.get('srcset'):
            self.refs.extend(item.strip().split()[0] for item in attrs['srcset'].split(','))
        if tag == 'img' and ('width' not in attrs or 'height' not in attrs or 'alt' not in attrs):
            errors.append('Imagem sem dimensões reservadas ou atributo alt.')

page = Page()
page.feed((ROOT/'index.html').read_text(encoding='utf-8'))
if page.h1 != 1: errors.append('A página precisa de exatamente um h1.')
for ref in page.refs:
    url = urlsplit(ref)
    if url.scheme or url.netloc: continue
    if url.path and not (ROOT/unquote(url.path)).is_file(): errors.append(f'Arquivo ausente: {url.path}')
    if not url.path and url.fragment not in page.ids: errors.append(f'Âncora ausente: {url.fragment}')
css = ROOT/'assets/css/style.css'
for ref in re.findall(r'url\([\"\']?([^\)\"\']+)',css.read_text(encoding='utf-8')):
    if not (css.parent/ref).is_file(): errors.append(f'Arquivo CSS ausente: {ref}')
print(f'{len(page.refs)} referências HTML verificadas; fontes e recursos CSS verificados.')
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print('Estrutura e arquivos locais: OK.')
