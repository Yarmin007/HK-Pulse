const fs = require('fs');
const path = require('path');

// CONFIG: Add folders or files to skip here to save tokens
const EXCLUDE = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.vercel', 
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store'
]);

const EXCLUDE_EXT = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico', '.pdf', '.mp4', '.zip']);

const OUTPUT_FILE = 'project_context.txt';

function readDir(dir, result = '') {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      if (!EXCLUDE.has(file)) {
        result = readDir(filePath, result);
      }
    } else {
      if (!EXCLUDE.has(file) && !EXCLUDE_EXT.has(path.extname(file))) {
        const content = fs.readFileSync(filePath, 'utf8');
        result += `\n--- FILE: ${filePath} ---\n${content}\n`;
      }
    }
  });
  return result;
}

console.log('Generating text file... 🚀');
const finalContext = readDir('.');
fs.writeFileSync(OUTPUT_FILE, finalContext);
console.log(`Done! Created: ${OUTPUT_FILE}`);