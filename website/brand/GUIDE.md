# MagisForm — guia curto de identidade

## Conceito escolhido

**A — Manipulação**, escolhido pelo usuário durante a revisão. O almofariz recebe o pistilo e sua abertura sugere o M: uma associação com o trabalho de manipulação, em uma forma simples. O nome é sempre **MagisForm**.

## Arquivos

Em `assets/brand/`, as famílias `logo-horizontal-*`, `logo-stacked-*`, `symbol-*` e `wordmark-*` estão disponíveis em verde, preto e branco. Os logotipos usam contornos vetoriais, sem texto dependente de fonte, raster ou filtros. O favicon é o símbolo branco em um campo verde; existem SVG, ICO, PNG 32, ícone Apple 180 e ícones 192/512.

Use a composição horizontal no cabeçalho e no rodapé. Use o símbolo sozinho em espaços pequenos. A versão vertical é indicada para capas e peças com área quadrada.

## Paleta e tipografia

- Verde: `#173E35`; creme: `#FFFDF8`; fundo: `#F4F1E9`.
- Coral: `#D95C4F`; apoio: `#DCE8E1`.
- Texto: `#17201D`; secundário: `#5F6965`.
- Texto sobre coral: `#101814` (contraste 4,81:1).
- Títulos: Vollkorn 400–600; corpo: Atkinson Hyperlegible Next 400–700.
- Logotipo: contornos de Atkinson Hyperlegible Next, peso 650. Licença SIL OFL preservada.

## Aplicação

Preserve uma área livre equivalente a 1/8 da largura do símbolo em todos os lados. Para a composição horizontal, use no mínimo 180 px de largura. Para o símbolo, mínimo de 16 px, preferindo 24 px ou mais quando houver espaço. O nome permanece separado do símbolo no favicon.

Use verde ou preto sobre fundos claros. Use branco sobre verde escuro. Preserve proporções; não incline, estique, adicione sombras ou gradientes. Não coloque o símbolo sobre detalhes que prejudiquem sua silhueta.

## Validação

Os símbolos passaram por duas rodadas de inspeção e pela auditoria `svg_audit.py` da skill logo-design. A versão A tem 16 pontos de ancoragem e recebeu 100/100 na heurística do auditor; a pontuação não substitui inspeção visual. Foram examinados tamanhos 16, 24, 32 e 512 px e aplicações monocromáticas em fundos claros e escuros.

O auditor sinaliza os ângulos naturais da letra M na fonte do logotipo. Eles foram preservados como característica tipográfica; não há falhas estruturais. O arquivo final horizontal tem geometria vetorial e coordenadas arredondadas.

Referência de processo: https://github.com/kaankiziltug/logo-design-skill. Os desenhos da biblioteca foram usados apenas para estudo.
