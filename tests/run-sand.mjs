import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'

// Use Vite's existing TS bundler; keep the generated runner out of source control.
const outfile = 'node_modules/.tmp/sand.test.mjs'
await build({ entryPoints: ['tests/sand.test.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile })
const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
