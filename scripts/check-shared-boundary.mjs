import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = [
  { path: path.resolve('shared'), label: 'shared/', forbidden: /(?:from\s*|import\s*\()\s*['"](?:node:|electron(?:\/|['"]))/ },
  { path: path.resolve('core'), label: 'core/', forbidden: /(?:from\s*|import\s*\()\s*['"](?:electron(?:\/|['"])|react(?:\/|['"])|react-dom(?:\/|['"]))/ },
];
const errors = [];

async function inspect(directory, root) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file, root);
    else if (/\.tsx?$/.test(entry.name)) {
      const content = await readFile(file, 'utf8');
      if (root.forbidden.test(content)) errors.push(path.relative(process.cwd(), file));
    }
  }
}

for (const root of roots) await inspect(root.path, root);
if (errors.length) {
  console.error(`Imports proibidos nas fronteiras core/shared: ${errors.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Fronteiras core/shared: sem imports Electron/browser e sem imports Node/Electron em shared/.');
}
