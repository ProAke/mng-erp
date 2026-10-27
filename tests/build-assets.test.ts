import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')

describe('Vanilla SPA production build', () => {
  it('includes every classic script referenced by the generated HTML', () => {
    const build = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, encoding:'utf8', timeout:30000 })
    expect(build.status, build.stderr).toBe(0)
    const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8')
    const paths = [...html.matchAll(/<script\s+src="(assets\/js\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1])
    expect(paths.length).toBeGreaterThanOrEqual(7)
    for (const asset of paths) {
      expect(fs.existsSync(path.join(root, 'dist', asset)), asset).toBe(true)
      expect(fs.readFileSync(path.join(root, 'dist', asset), 'utf8')).toBe(fs.readFileSync(path.join(root, asset), 'utf8'))
    }
  }, 40000)
})
