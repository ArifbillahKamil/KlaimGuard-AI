import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${base}/#/`)
  await page.getByRole('heading', { name: 'Audit yang lebih terarah.', exact: true }).waitFor()
  for (const name of ['summary', 'claims_flagged', 'faskes_risk', 'model_report', 'feature_dictionary']) {
    const response = await page.request.get(`${base}/data/${name}.json`)
    assert.equal(response.status(), 200)
  }
  await page.locator('a.nav-item[href="#/antrean"]').click()
  await page.getByRole('row', { name: 'Buka klaim C000123', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  assert.deepEqual(errors, [])
  console.log('DEV PASS: Ringkasan, Antrean, detail claim, 5 JSON HTTP 200, 0 runtime errors.')
} finally { await browser.close() }
