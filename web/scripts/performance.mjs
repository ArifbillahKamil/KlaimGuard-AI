import lighthouse from 'lighthouse'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
await mkdir(`${root}/qa-results`, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--remote-debugging-port=9223'] })
try {
  const result = await lighthouse('http://127.0.0.1:4173/', { port: 9223, output: ['json', 'html'], logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'], formFactor: 'desktop', screenEmulation: { mobile: false, width: 1440, height: 1050, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 }, disableStorageReset: false })
  await writeFile(`${root}/qa-results/lighthouse.json`, result.report[0])
  await writeFile(`${root}/qa-results/lighthouse.html`, result.report[1])
  console.log(JSON.stringify({ categories: Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)])), metrics: { fcp: result.lhr.audits['first-contentful-paint'].displayValue, lcp: result.lhr.audits['largest-contentful-paint'].displayValue, cls: result.lhr.audits['cumulative-layout-shift'].displayValue }, failures: Object.values(result.lhr.audits).filter(a => a.score !== null && a.score < 1 && a.details?.items?.length).map(a => ({ id: a.id, title: a.title, score: a.score })) }, null, 2))
} finally { await browser.close() }
