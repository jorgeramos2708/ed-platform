const { readFileSync, writeFileSync } = require('node:fs');
const p = JSON.parse(readFileSync('package.json', 'utf8'));
p.scripts.test = 'node --test';
writeFileSync('package.json', JSON.stringify(p, null, 2));
console.log('package.json corregido');
