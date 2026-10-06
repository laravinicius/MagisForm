# MagisForm — website comercial

Landing page estática em português para apresentar o software desktop a farmácias de manipulação. HTML, CSS e JavaScript sem etapa de build. Este projeto funciona independentemente da aplicação desktop.

## Abrir localmente

Na raiz do repositório, execute:

```powershell
python -m http.server 5174 --bind 127.0.0.1 --directory website
```

Abra http://127.0.0.1:5174/. O servidor fica acessível somente neste computador. Também é possível usar outro servidor de arquivos estáticos apontado para esta pasta.

## Organização

- `index.html`: conteúdo, SEO, FAQ nativo e estrutura acessível.
- `assets/css/style.css`: paleta, fontes, responsividade e movimento reduzido.
- `assets/js/config.js`: número comercial e mensagens do WhatsApp.
- `assets/js/main.js`: links comerciais, menu móvel e galeria em diálogo nativo.
- `assets/brand/`: logo A aprovada, variantes vetoriais e favicons.
- `assets/fonts/`: fontes locais, originais e licenças SIL OFL.
- `assets/images/`: mockups em WebP/AVIF e imagem de compartilhamento.
- `brand/`: briefing, três conceitos, apresentação final e guia de identidade.
- `tools/`: geração opcional das imagens, preparação de marca e verificações de arquivos.

## Contato comercial

O destino definido é `5541991942228`, correspondente a **(41) 99194-2228**. Edite `assets/js/config.js` para trocar número ou mensagens. O número deve conter somente dígitos, incluindo `55` e DDD. O clique abre o WhatsApp em outra aba; o visitante decide se envia a mensagem.

Sem uma configuração válida, os links levam à seção de contato e aparece “Canal comercial em configuração”. Sem JavaScript, o conteúdo, a navegação e o FAQ continuam disponíveis; existe um link direto de contato na seção final. Se trocar o número, atualize também esse único fallback dentro de `<noscript>` no HTML.

## Conteúdo e imagens

As três prévias são ilustrações baseadas nos módulos de painel inicial, cadastro e fórmulas confirmadas. Usam exclusivamente dados sintéticos, com a identidade MagisForm. Não são capturas de uma versão instalada com essa marca; não há conexão com IPC, API ou banco de dados. Seus valores não são estatísticas comerciais.

O site apresenta o produto como aplicativo desktop para Windows que depende de conexão ao banco de dados da operação. A contratação é sob consulta. Não há preços, depoimentos ou serviços de implantação/suporte prometidos.

As fontes Vollkorn e Atkinson Hyperlegible Next vieram do repositório oficial Google Fonts. Os arquivos WOFF são derivados sem alteração do desenho; as licenças ficam ao lado dos arquivos. Nenhuma fonte ou imagem é carregada de terceiros durante a visita.

## Verificação

Na raiz do repositório:

```powershell
node --check website/assets/js/config.js
node --check website/assets/js/main.js
python website/tools/verify-site.py
git diff --check
```

Inspecione também o navegador em 375, 768, 1024 e 1440 px. Verifique menu, âncoras, FAQ com teclado, abertura/fechamento das prévias, Escape, foco restaurado e links de WhatsApp. O diálogo nativo possui tratamento explícito de Tab e Shift+Tab para manter o foco dentro da prévia enquanto ela está aberta. A folha CSS respeita `prefers-reduced-motion` e nenhum conteúdo depende de animação.

As ferramentas de geração são opcionais: exigem Python com fontTools/Pillow e Node com Sharp, disponíveis no ambiente usado para preparar os arquivos. Não são necessárias para servir ou editar o site. O renderizador Node utiliza o Sharp já instalado na raiz do repositório.

## Publicação futura

Ainda não houve publicação. Hospede o HTML e os arquivos em `assets/` em um serviço de arquivos estáticos. Não é necessário publicar `tools/`, `brand/`, os originais TTF ou `assets/images/sources/`.

Quando o domínio for definido, transforme `og:image` e `twitter:image` em URLs HTTPS absolutas da imagem `assets/images/social-card.png`; adicione `canonical` e `og:url` com a URL final. Confirme o número comercial e repita as verificações no endereço publicado. O site não instala cookies, rastreadores ou formulários de coleta.
