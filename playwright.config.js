const { defineConfig } = require('@playwrigh./e2e_tests');

module.exports = defineConfig({
  testDir: './e2e_tests',
  testMatch: /.*\.e2e\.test\.js/,
  use: {
    baseURL: 'http://localhost:5021',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:5021',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
