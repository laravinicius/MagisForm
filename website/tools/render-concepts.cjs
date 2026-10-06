// Renderiza arquivos vetoriais locais sem controlar um navegador.
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = path.resolve(__dirname, '../brand/concepts');
(async () => {
  await sharp(path.join(base, 'concepts.svg')).png().toFile(path.join(base, 'concepts.png'));
  for (const key of ['a-manipulacao', 'b-frasco', 'c-composicao']) {
    const file = path.join(base, `${key}-symbol-v2.svg`);
    for (const size of [16, 24, 32, 512]) {
      await sharp(file).resize(size, size).png().toFile(path.join(base, `${key}-${size}.png`));
    }
  }
  const tiles = [];
  for (const [i, key] of ['a-manipulacao', 'b-frasco', 'c-composicao'].entries()) {
    const raw = await fs.readFile(path.join(base, `${key}-symbol-v2.svg`), 'utf8');
    for (const [j, color] of ['#17201D', '#FFFFFF'].entries()) {
      const input = await sharp(Buffer.from(raw.replaceAll('#17201D', color))).resize(120, 120).png().toBuffer();
      tiles.push({input, left: i * 240 + 60, top: j * 200 + 40});
    }
  }
  const background = Buffer.from('<svg width="720" height="400" xmlns="http://www.w3.org/2000/svg"><path fill="white" d="M0 0H720V200H0Z"/><path fill="#173E35" d="M0 200H720V400H0Z"/></svg>');
  await sharp(background).composite(tiles).png().toFile(path.join(base, 'background-tests.png'));
  console.log('Prancha e escalas renderizadas em', base);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
