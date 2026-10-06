import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputDir = path.resolve('src/assets');
const outputDir = path.resolve('public');

const files = fs.readdirSync(inputDir).filter(f => /\.(jpe?g|png)$/i.test(f));

for (const file of files) {
  const inputPath = path.join(inputDir, file);
  const name = path.parse(file).name;
  const outputPath = path.join(outputDir, `${name}.webp`);

  await sharp(inputPath)
    .webp({ quality: 85 })
    .toFile(outputPath);

  console.log(`Compressed: ${file} -> ${name}.webp`);
}

console.log('Done!');