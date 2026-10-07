import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
function yaml(path) {
  const document = parseDocument(read(path), { uniqueKeys: true })
  assert.equal(document.errors.length, 0, `${path}: ${document.errors.join('; ')}`)
  return document.toJS()
}

const pkg = JSON.parse(read('package.json'))
assert.equal(pkg.scripts['e2e:system'], 'pwsh -NoProfile -File ./scripts/run-e2e.ps1')
assert.equal(pkg.scripts.e2e, 'playwright test')
const workflow = yaml('.github/workflows/system-regression.yml')
const job = workflow.jobs['e2e-and-performance']
assert.equal(job['runs-on'], 'ubuntu-latest')
assert.ok(job.steps.some((step) => step.run === 'npm run e2e:system'))
assert.ok(job.steps.some((step) => step.run === 'npm run validate:ci'))
assert.ok(job.steps.some((step) => step.with?.submodules === 'recursive'))
assert.ok(job.steps.some((step) => step.with?.['node-version'] === '22' && step.with?.cache === 'npm'))
assert.ok(job.steps.some((step) => step.run === 'npx playwright install --with-deps chromium'))
assert.ok(job.steps.every((step) => !step['continue-on-error'] && !step.if))
assert.ok(!job['continue-on-error'])

const compose = yaml('compose.e2e.yml')
for (const service of ['mysql', 'redis', 'mailpit', 'backend', 'frontend', 'k6']) {
  assert.ok(compose.services[service], `Missing real system service: ${service}`)
}
assert.equal(compose.services.backend.build.context, './backend')
assert.equal(compose.services.frontend.build.context, './frontend')
const runner = read('scripts/run-e2e.ps1')
assert.ok(!/\b(powershell|cmd\.exe|taskkill)\b|[A-Z]:\\|dockerDesktopLinuxEngine/i.test(runner))
assert.ok(runner.includes('if ($LASTEXITCODE -ne 0)'))
assert.ok(runner.includes('Invoke-Checked "npm" @("run", "e2e")'))
assert.ok(runner.includes('"run", "--rm", "k6", "run", "/scripts/chat-api.k6.js"'))
assert.ok(runner.includes('} finally {'))
console.log(`Validated npm scripts, Ubuntu workflow and real Compose E2E services in ${fileURLToPath(root)}`)
