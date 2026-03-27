const fs = require('fs');
const css = fs.readFileSync('public/css/viewer.css', 'utf8');
console.log(css.match(/#qp-views-container\.show-textures/g));
console.log(css.match(/#qp-views-container.*show-textures.*\{[^}]*\}/g));
