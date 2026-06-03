const fs = require('fs');
const path = require('path');

// Minimal valid PNG (1x1 blue pixel) as placeholder
// Real icons should be designed properly later
const sizes = [16, 48, 128];
const dir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });

// Minimal valid PNG — a 1x1 pixel blue image
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
  'base64'
);

for (const size of sizes) {
  fs.writeFileSync(path.join(dir, `icon${size}.png`), png);
}
console.log('Placeholder icons generated: icon16.png, icon48.png, icon128.png');
