const fs = require('fs');

function updateCache(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  content = content.replace(/\?v=(\d+)/g, (match, p1) => {
    return `?v=${parseInt(p1) + 1}`;
  });
  fs.writeFileSync(filepath, content);
  console.log('Updated cache version in ' + filepath);
}

updateCache('public/viewer.html');
updateCache('public/admin/tagger.html');
