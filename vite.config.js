/* คงสคริปต์ Vanilla JS แบบ global ไว้ตามลำดับใน index.html ระหว่าง Vite build */
const fs = require('fs');
const path = require('path');
const { defineConfig } = require('vite');

module.exports = defineConfig({
  plugins: [{
    name: 'copy-vanilla-client-scripts',
    apply: 'build',
    generateBundle() {
      const sourceDir = path.join(__dirname, 'assets', 'js');
      for (const name of fs.readdirSync(sourceDir)) {
        if (!name.endsWith('.js')) continue;
        this.emitFile({ type: 'asset', fileName: `assets/js/${name}`, source: fs.readFileSync(path.join(sourceDir, name)) });
      }
    },
  }],
});
