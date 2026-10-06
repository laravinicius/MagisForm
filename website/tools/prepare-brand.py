"""Finaliza o conceito A aprovado e prepara fontes locais e arquivos da marca."""
from pathlib import Path
import re
import urllib.request
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'assets/fonts'
BRAND = ROOT / 'assets/brand'
BRAND.mkdir(parents=True, exist_ok=True)
url = 'https://raw.githubusercontent.com/google/fonts/main/ofl/vollkorn/'
if not (FONTS / 'vollkorn.ttf').exists():
    urllib.request.urlretrieve(url + 'Vollkorn%5Bwght%5D.ttf', FONTS / 'vollkorn.ttf')
    urllib.request.urlretrieve(url + 'OFL.txt', FONTS / 'vollkorn-OFL.txt')

source = ROOT / 'brand/concepts/a-manipulacao-symbol-v2.svg'
symbol = source.read_text(encoding='utf-8')
horizontal = (ROOT / 'brand/concepts/a-manipulacao-horizontal-v2.svg').read_text(encoding='utf-8')
NS = {'s': 'http://www.w3.org/2000/svg'}
root = ET.fromstring(horizontal)
name_width_delta = float(root.attrib['viewBox'].split()[2]) - 771
paths = ''.join(f'<path d="{p.attrib["d"]}"/>' for p in root.findall('.//s:g[@id="wordmark"]/s:path', NS))
symbol_group = ''.join(ET.tostring(child, encoding='unicode').replace('ns0:', '').replace(':ns0', '') for child in ET.fromstring(symbol).find('s:g', NS))

def svg(body, vb, color, title='MagisForm'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-labelledby="title"><title id="title">{title}</title><g fill="{color}">{body}</g></svg>\n'

for suffix, color in [('green', '#173E35'), ('black', '#17201D'), ('white', '#FFFFFF')]:
    (BRAND / f'symbol-{suffix}.svg').write_text(svg(symbol_group, '0 0 256 256', color), encoding='utf-8')
    body = f'<g transform="scale(.5)">{symbol_group}</g><g transform="translate(-140 -55)">{paths}</g>'
    (BRAND / f'logo-horizontal-{suffix}.svg').write_text(svg(body, f'0 0 {630 + name_width_delta:g} 144', color), encoding='utf-8')
    # O nome fica centralizado sob o símbolo; transformações mantêm os contornos originais.
    body = f'<g transform="translate({102 + name_width_delta / 2:g} 0)">{symbol_group}</g><g transform="translate(-285 160)">{paths}</g>'
    (BRAND / f'logo-stacked-{suffix}.svg').write_text(svg(body, f'0 0 {460 + name_width_delta:g} 350', color), encoding='utf-8')
    (BRAND / f'wordmark-{suffix}.svg').write_text(svg(f'<g transform="translate(-275 -85)">{paths}</g>', f'0 0 {490 + name_width_delta:g} 90', color), encoding='utf-8')

for stem in ['atkinson-hyperlegible-next', 'vollkorn']:
    from fontTools.ttLib import TTFont
    font = TTFont(FONTS / f'{stem}.ttf')
    font.flavor = 'woff'
    font.save(FONTS / f'{stem}.woff')
print('Identidade A e fontes locais preparadas.')
