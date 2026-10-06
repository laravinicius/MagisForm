"""Monta a prancha com a ferramenta da skill; renderização local feita por Sharp."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = Path(os.environ['TEMP']) / 'magisformula-logo-design-skill' / 'skills' / 'logo-design' / 'scripts'
sys.path.insert(0, str(SKILL))
import concept_sheet

concept_sheet.render_png.render = lambda *args, **kwargs: None
files = [ROOT / 'brand/concepts' / f'{name}-symbol-v2.svg' for name in ['a-manipulacao', 'b-frasco', 'c-composicao']]
lockups = [ROOT / 'brand/concepts' / f'{name}-horizontal-v2.svg' for name in ['a-manipulacao', 'b-frasco', 'c-composicao']]
output = ROOT / 'brand/concepts/concepts.png'
sys.argv = ['concept_sheet.py', *map(str, files), '--lockups', *map(str, lockups), '--names', 'Manipulação', 'Fórmula', 'Composição', '--notes', 'Um almofariz em M e um pistilo: precisão na manipulação.', 'Um F em espaço negativo no frasco: a fórmula em primeiro plano.', 'Quatro ingredientes se encaixam: organização que dá forma à fórmula.', '--title', 'MagisForm — conceitos de logo', '--subtitle', 'Escolha uma direção. Formas monocromáticas e leitura em tamanhos reais.', '--recommend', '1', '-o', str(output)]
concept_sheet.main()
svg = output.with_suffix('.svg')
svg.write_text(svg.read_text(encoding='utf-8').replace('RECOMMENDED', 'RECOMENDADO'), encoding='utf-8')
