import lighthouse from 'lighthouse'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
await mkdir(`${root}/qa-results`, { recursive: true })
const results = []
const label = process.argv.find(value => value.startsWith('--label='))?.slice(8) || ''
assert.ok(!label || /^[a-z0-9-]+$/.test(label), 'Use a simple filename label')
const mobileOnly = process.argv.includes('--mobile-only')
const cases = [
  { page: 'ringkasan', hash: '#/', device: 'desktop' },
  { page: 'antrean', hash: '#/antrean', device: 'desktop' },
  { page: 'ringkasan', hash: '#/', device: 'mobile' },
  { page: 'antrean', hash: '#/antrean', device: 'mobile' },
].filter(test => !mobileOnly || test.device === 'mobile')
for (const [index, test] of cases.entries()) {
  const port = 9223 + index
  const mobile = test.device === 'mobile'
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: [`--remote-debugging-port=${port}`] })
  try {
    const result = await lighthouse(`http://127.0.0.1:4173/${test.hash}`, {
      port, output: ['json', 'html'], logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'],
      formFactor: test.device, screenEmulation: { mobile, width: mobile ? 390 : 1440, height: mobile ? 844 : 1050, deviceScaleFactor: 1, disabled: false },
      throttling: mobile ? { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 } : { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
      disableStorageReset: false,
    })
    const stem = `lighthouse-${test.page}-${test.device}${label ? `-${label}` : ''}`
    await writeFile(`${root}/qa-results/${stem}.json`, result.report[0]); await writeFile(`${root}/qa-results/${stem}.html`, result.report[1])
    const finalUrl = result.lhr.finalDisplayedUrl || result.lhr.finalUrl
    assert.equal(new URL(finalUrl).hash, test.hash)
    const entry = { ...test, finalUrl, lighthouse_version: result.lhr.lighthouseVersion,
      categories: Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)])),
      fcp_ms: result.lhr.audits['first-contentful-paint'].numericValue, lcp_ms: result.lhr.audits['largest-contentful-paint'].numericValue,
      tbt_ms: result.lhr.audits['total-blocking-time'].numericValue, cls: result.lhr.audits['cumulative-layout-shift'].numericValue,
      warnings: result.lhr.runWarnings,
      failing_audits: Object.values(result.lhr.audits).filter(a => a.score !== null && a.score < 1 && a.details?.items?.length).map(a => ({ id: a.id, score: a.score, title: a.title })),
    }
    results.push(entry); console.log(JSON.stringify(entry))
  } finally { await browser.close() }
}
await writeFile(`${root}/qa-results/performance-${label || 'results'}.json`, JSON.stringify({ data: 'actual synthetic ML export, 3000 claims', runs_per_case: 1, results }, null, 2))
console.log(`Lighthouse complete: ${cases.length} scenarios; label=${label || 'results'}. All measured results retained.`)
