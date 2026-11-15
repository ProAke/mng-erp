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
      // Three.js โหลดภายในหน้า Office เท่านั้น ไม่พึ่ง CDN หรือ node_modules บน Passenger
      const vendorDir = path.join(__dirname, 'assets', 'vendor');
      for (const name of fs.readdirSync(vendorDir)) {
        this.emitFile({ type: 'asset', fileName: `assets/vendor/${name}`, source: fs.readFileSync(path.join(vendorDir, name)) });
      }
      // ลิงก์คู่มือจากหน้า Setting ต้องใช้ได้ทั้ง Express root และ static build
      this.emitFile({ type:'asset', fileName:'docs/TEXT-SPEED-MANNY.md', source:fs.readFileSync(path.join(__dirname, 'docs', 'TEXT-SPEED-MANNY.md')) });
    },
  }],
});
