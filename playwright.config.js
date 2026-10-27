// 冒煙測試設定：直接用 file:// 開頁面，不需要架伺服器
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60000,
  retries: 0,
  reporter: [['list']],
  use: { browserName: 'chromium', headless: true }
});
