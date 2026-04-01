const fs = require('fs');

function updateVersion() {
  const packageJsonPath = 'package.json';
  const serverJsPath = 'server.js';

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  const newVersion = currentVersion.split('.').map((part, index) => index === 2 ? parseInt(part) + 1 : part).join('.');

  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Updated package.json version to ${newVersion}`);

  let serverJs = fs.readFileSync(serverJsPath, 'utf8');
  serverJs = serverJs.replace(/const APP_VERSION = '.*';/, `const APP_VERSION = '${newVersion}';`);
  fs.writeFileSync(serverJsPath, serverJs);
  console.log(`Updated server.js APP_VERSION to ${newVersion}`);
}

updateVersion();
