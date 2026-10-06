"""Gera conceitos vetoriais originais; não depende de dados do aplicativo."""
from pathlib import Path
import html
import re
import urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'assets' / 'fonts'
CONCEPTS = ROOT / 'brand' / 'concepts'
FONTS.mkdir(parents=True, exist_ok=True)
CONCEPTS.mkdir(parents=True, exist_ok=True)
source = 'https://raw.githubusercontent.com/google/fonts/main/ofl/atkinsonhyperlegiblenext/'
font_path = FONTS / 'atkinson-hyperlegible-next.ttf'
if not font_path.exists():
    urllib.request.urlretrieve(source + 'AtkinsonHyperlegibleNext%5Bwght%5D.ttf', font_path)
    urllib.request.urlretrieve(source + 'OFL.txt', FONTS / 'atkinson-OFL.txt')
font = instantiateVariableFont(TTFont(font_path), {'wght': 650}, inplace=False)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 70 / font['head'].unitsPerEm

def wordmark():
    paths, cursor = [], 285
    for char in 'MagisForm':
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, 153)))
        commands = re.sub(r'-?\d+\.\d+', lambda match: f'{float(match.group()):.2f}'.rstrip('0').rstrip('.'), pen.getCommands())
        paths.append(f'<path d="{commands}"/>')
        cursor += glyphs[name].width * scale - .25
    return ''.join(paths), round(cursor + 28)

symbols = {
    'a-manipulacao': '<path d="M32 116H72V148L128 204L184 148V116H224V156C224 208 184 232 128 232C72 232 32 208 32 156Z"/><path d="M126 100L190 36A16 16 0 0 1 214 60L150 124Z"/>',
    'b-frasco': '<path fill-rule="evenodd" d="M96 24H160V64L184 88Q208 112 208 136V208Q208 232 184 232H72Q48 232 48 208V136Q48 112 72 88L96 64ZM104 104V200H128V160H154V140H128V124H160V104Z"/>',
    'c-composicao': ''.join(f'<path transform="rotate({angle} 128 128)" d="M64 32H112V88H88V112H32V64A32 32 0 0 1 64 32Z"/>' for angle in (0,90,180,270)),
}
names = {'a-manipulacao': 'Manipulação', 'b-frasco': 'Fórmula', 'c-composicao': 'Composição'}
word, width = wordmark()
for key, art in symbols.items():
    if key == 'a-manipulacao':
        art = f'<g transform="translate(0 -4)">{art}</g>'
    title = html.escape(f'MagisForm — conceito {names[key]}')
    for suffix, body, canvas in [('symbol', art, '0 0 256 256'), ('horizontal', f'<g id="symbol">{art}</g><g id="wordmark">{word}</g>', f'0 0 {width} 256')]:
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{canvas}" role="img" aria-labelledby="title"><title id="title">{title}</title><g fill="#17201D">{body}</g></svg>\n'
        (CONCEPTS / f'{key}-{suffix}-v2.svg').write_text(svg, encoding='utf-8')
print(f'Conceitos e logotipos gerados em {CONCEPTS}')
