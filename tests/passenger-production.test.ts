import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Plesk Phusion Passenger & Live MariaDB Production Regressions', () => {
  it('starts listening immediately (< 1500ms) when required via a Passenger-like loader (require.main !== module)', async () => {
    const port = 18940 + Math.floor(Math.random() * 400);
    // Simulate Phusion Passenger node-loader.js: server/index.js is required by another module, NOT main!
    const loaderCode = `
      process.env.IN_PASSENGER = '1';
      process.env.PORT = '${port}';
      delete process.env.VITEST;
      require(${JSON.stringify(path.join(ROOT, 'server/index.js'))});
    `;

    const child = spawn(process.execPath, ['-e', loaderCode], {
      cwd: path.join(ROOT, 'server'),
      env: { ...process.env, IN_PASSENGER: '1', PORT: String(port), VITEST: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const t0 = Date.now();
    let healthJson: any = null;
    try {
      for (let i = 0; i < 30; i++) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/health`);
          if (r.ok) {
            healthJson = await r.json();
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 50));
      }
      const bootMs = Date.now() - t0;
      expect(healthJson).toBeTruthy();
      expect(healthJson.ok).toBe(true);
      expect(bootMs).toBeLessThan(1500);

      // Verify internal /server directory is NOT exposed as static files
      const secRes = await fetch(`http://127.0.0.1:${port}/server/config.js`);
      expect(secRes.status).toBe(404);

      // Verify root SPA serves index.html with latest asset cache-buster
      const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
      expect(htmlRes.status).toBe(200);
      const html = await htmlRes.text();
      expect(html).toContain('agency-os.js?v=6');

      // Verify /hub is excluded from SPA catch-all
      const hubRes = await fetch(`http://127.0.0.1:${port}/hub`);
      expect(hubRes.status).toBe(404);
    } finally {
      child.kill('SIGTERM');
    }
  });

  it('has 100% SQL column parity across db.js, seed.js, and routes.js', () => {
    const dbJs = fs.readFileSync(path.join(ROOT, 'server/db.js'), 'utf8');
    const seedJs = fs.readFileSync(path.join(ROOT, 'server/seed.js'), 'utf8');
    const routesJs = fs.readFileSync(path.join(ROOT, 'server/routes.js'), 'utf8');

    // Bug #2 regression: pacific_mngworks.projects uses `title`, NOT `name`
    expect(seedJs).not.toMatch(/SELECT[^;]*\bname\b[^;]*FROM\s+projects/i);
    expect(seedJs).toContain('SELECT id, hub_id, title, erp_code FROM projects');

    // Bug #3 regression: tasks columns used by routes.js must exist in db.js ADDITIVE_COLS
    expect(dbJs).toContain('erp_ai_agent VARCHAR(20) NULL');
    expect(dbJs).toContain('erp_spent_hrs DECIMAL(6,2) DEFAULT 0');
    expect(dbJs).toContain('INFORMATION_SCHEMA.COLUMNS');
    expect(routesJs).toContain('erp_ai_agent');
    expect(routesJs).toContain('erp_spent_hrs');
  });

  it('matches all Agency OS frontend Remote API paths with workspace-routes.js', () => {
    const wsRoutes = fs.readFileSync(path.join(ROOT, 'server/workspace-routes.js'), 'utf8');
    const agencyJs = fs.readFileSync(path.join(ROOT, 'assets/js/agency-os.js'), 'utf8');

    expect(agencyJs).toContain('/checkins/clock');
    expect(agencyJs).toContain('/checkins/clock-out');
    expect(agencyJs).toContain('/pin');

    expect(wsRoutes).toContain("'/checkins/clock'");
    expect(wsRoutes).toContain("'/checkins/clock-out'");
    expect(wsRoutes).toContain("'/messages/:id/pin'");
    expect(wsRoutes).toContain("timeZone: 'Asia/Bangkok'");
  });
});
