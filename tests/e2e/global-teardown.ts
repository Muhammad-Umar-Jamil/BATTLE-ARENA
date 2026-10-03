import { execFileSync } from 'node:child_process'

export default function globalTeardown() {
  if (process.env.E2E_CLEANUP !== 'true') return
  execFileSync('node', ['scripts/cleanup-e2e.mjs'], { stdio: 'inherit', cwd: process.cwd() })
}
