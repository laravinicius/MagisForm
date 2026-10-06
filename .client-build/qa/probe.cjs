const fs = require('node:fs');
const path = require('node:path');
const { extractFile } = require('@electron/asar');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const output = path.resolve(pkg.build.directories.output.replace('${version}', pkg.version));
const packed = JSON.parse(extractFile(path.join(output, 'win-unpacked/resources/app.asar'), 'package.json').toString());
console.log(JSON.stringify({ name: packed.name, version: packed.version, executable: path.join(output, 'win-unpacked/MagisForm.exe'), installer: path.join(output, `MagisForm-Setup-${pkg.version}.exe`) }, null, 2));
