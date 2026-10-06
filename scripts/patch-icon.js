import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateIcon() {
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = [];

  for (const s of sizes) {
    const pad = Math.round(s * 0.1);
    const innerSize = s - pad * 2;
    
    const logoResized = await sharp('public/brand/symbol-green.svg')
      .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();

    const tile = await sharp({
      create: {
        width: s,
        height: s,
        channels: 4,
        background: '#FFFFFF'
      }
    })
    .composite([{ input: logoResized, top: pad, left: pad }])
    .png()
    .toBuffer();

    pngBuffers.push(tile);
  }

  const numImages = sizes.length;
  const headerSize = 6 + 16 * numImages;
  const icoHeader = Buffer.alloc(headerSize);

  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(numImages, 4);

  let currentOffset = headerSize;
  for (let i = 0; i < numImages; i++) {
    const s = sizes[i];
    const len = pngBuffers[i].length;
    const entryOffset = 6 + i * 16;

    icoHeader.writeUInt8(s === 256 ? 0 : s, entryOffset + 0);
    icoHeader.writeUInt8(s === 256 ? 0 : s, entryOffset + 1);
    icoHeader.writeUInt8(0, entryOffset + 2);
    icoHeader.writeUInt8(0, entryOffset + 3);
    icoHeader.writeUInt16LE(1, entryOffset + 4);
    icoHeader.writeUInt16LE(32, entryOffset + 6);
    icoHeader.writeUInt32LE(len, entryOffset + 8);
    icoHeader.writeUInt32LE(currentOffset, entryOffset + 12);

    currentOffset += len;
  }

  const finalIco = Buffer.concat([icoHeader, ...pngBuffers]);
  fs.writeFileSync('public/icon.ico', finalIco);
  console.log('✔ Icon multi-size gerado em public/icon.ico!');
}

async function main() {
  await generateIcon();
}

main().catch(console.error);
