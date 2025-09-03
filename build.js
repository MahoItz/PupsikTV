const fs = require('fs');
const path = require('path');

const jsFiles = [
  'src/utils.js',
  'src/api.js',
  'src/render.js',
  'src/main.js'
];

let jsBundle = '';
for (const file of jsFiles) {
  jsBundle += fs.readFileSync(path.resolve(__dirname, file), 'utf8') + '\n';
}

// very naive minification
jsBundle = jsBundle
  .replace(/\/\/[^\n]*\n/g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{};,:])\s*/g, '$1');

fs.mkdirSync(path.resolve(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.resolve(__dirname, 'dist/main.min.js'), jsBundle.trim());

let css = fs.readFileSync(path.resolve(__dirname, 'src/style.css'), 'utf8');
css = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{};:;,])\s*/g, '$1');
fs.writeFileSync(path.resolve(__dirname, 'dist/style.min.css'), css.trim());

console.log('Build complete');
