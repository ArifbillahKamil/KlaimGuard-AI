import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../', import.meta.url))
const base = process.env.QA_URL || 'http://127.0.0.1:4173'
const require = createRequire(import.meta.url)
const load = async name => JSON.parse(await readFile(`${root}/public/data/${name}.json`, 'utf8'))
const [summary, claims, facilities, report, dictionary] = await Promise.all(['summary', 'claims_flagged', 'faskes_risk', 'model_report', 'feature_dictionary'].map(load))
const focusClaim = claims[0]
const checks = [], errors = [], measurements = {}
await mkdir(`${root}/screenshots`, { recursive: true })
await mkdir(`${root}/qa-results`, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1, reducedMotion: 'reduce', acceptDownloads: true, locale: 'id-ID' })
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const check = async (name, run) => { await run(); checks.push(name); console.log(`PASS: ${name}`) }
const accessibility = async target => {
  await target.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const violations = await target.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.html) })))
  assert.deepEqual(violations, [], `Accessibility on ${target.url()}`)
}
const routes = [['ringkasan', '/', 'Audit yang lebih terarah.'], ['antrean', '/antrean', 'Antrean audit'], ['faskes', '/faskes', 'Risiko faskes'], ['evaluasi', '/evaluasi', 'Evaluasi model'], ['tata-kelola', '/tata-kelola', 'AI yang membantu. Manusia yang memutuskan.']]
let navigation = 0
const go = async (path, target = page) => { await target.goto(`${base}/?qa=${++navigation}#${path}`); await target.locator('h1').waitFor(); await target.evaluate(() => document.fonts.ready) }
const row = (claim = focusClaim, target = page) => target.getByRole('row', { name: `Buka klaim ${claim.claim_id}`, exact: true })
const reset = () => page.getByRole('button', { name: /Atur ulang/ }).click()
const countIs = async n => {
  if (!n) await page.getByText('Belum ada klaim yang cocok.').waitFor()
  else await page.waitForFunction(expected => document.querySelector('[role="table"][aria-label="Antrean klaim"]')?.getAttribute('aria-rowcount') === String(expected + 1), n)
}
try {
  await check('Actual ML JSON: 3000/62711 claims, 120 facilities, grouped metrics, privacy and integrity', async () => {
    assert.equal(summary.dataset.synthetic, true); assert.equal(summary.data_source, 'ml_oof')
    assert.equal(claims.length, 3000); assert.equal(summary.dataset.n_claims, 62711); assert.equal(facilities.length, 120)
    assert.equal(summary.score_hist.counts.reduce((a, b) => a + b), summary.dataset.n_claims)
    assert.equal(facilities.reduce((n, f) => n + f.n_claims, 0), summary.dataset.n_claims)
    assert.deepEqual(Object.keys(report.grouped_eval).sort(), ['faskes_id', 'patient_id'])
    assert.equal(report.config.seed, 42); assert.equal(report.config.folds, 5)
    for (const result of Object.values(report.grouped_eval)) { assert.equal(result.outer_group_overlap, 0); assert.equal(result.inner_group_overlap, 0) }
    const official = ['Phantom billing (klaim palsu)', 'Repeat billing (klaim berulang)', 'Manipulasi diagnosis dan/atau tindakan (upcoding)', 'Services unbundling / fragmentation', 'Inflated bills (penggelembungan tagihan)', 'Cloning (penjiplakan klaim)']
    claims.forEach((c, i) => { assert.match(c.patient_ref, /^PX-[a-f0-9]{6}$/); assert.equal(c.patient_id, undefined); assert.equal(c.est_excess, Math.max(0, c.claim_total - c.peer_median)); assert.ok(!i || claims[i - 1].risk_score >= c.risk_score); assert.equal(c.reasons.length, 3); c.patterns.forEach(p => assert.ok(official.includes(p))); c.reasons.forEach(r => assert.ok(dictionary.some(d => d.feature === r.feature))) })
  })
  for (const [name, path, heading] of routes) {
    await check(`Desktop ${path}: direct route, no overflow, WCAG A/AA, actual-data screenshot`, async () => {
      await go(path); assert.equal(await page.locator('h1').innerText(), heading)
      assert.match(await page.title(), /KlaimGuard AI/)
      assert.ok(await page.locator('footer').innerText().then(text => text.includes('Angka performa bukan klaim performa dunia nyata')))
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await accessibility(page)
      await page.screenshot({ path: `${root}/screenshots/${name}-desktop.png`, fullPage: true })
    })
  }
  await check('Budget simulation derived from JSON, performance labels and honest evaluation text', async () => {
    await go('/')
    const rows = page.locator('.budget-table tbody tr')
    const percent = value => new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 2 }).format(value)
    const inverse = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(1 / value)
    const expected = [
      ['Sampling acak', 5 / 100, summary.dataset.fraud_rate],
      ['Validasi per klaim', report.at_budget['5'].recall.hybrid, report.at_budget['5'].precision.hybrid],
      ['Validasi faskes ditahan (lebih ketat)', report.grouped_eval.faskes_id.at_budget['5'].recall.hybrid, report.grouped_eval.faskes_id.at_budget['5'].precision.hybrid],
    ]
    assert.equal(await rows.count(), expected.length)
    for (const [i, [label, recall, precision]] of expected.entries()) {
      assert.ok((await rows.nth(i).locator('th').innerText()).includes(label))
      assert.deepEqual(await rows.nth(i).locator('td > .performance-value').evaluateAll(nodes => nodes.map(n => n.firstChild.textContent)), [percent(recall), percent(precision), inverse(precision)])
    }
    await go('/evaluasi')
    await page.getByText(/Hybrid belum unggul atas xgb_only/).waitFor()
    await page.getByText('Pola yang belum pernah dilihat sebagian besar tidak tertangkap model supervised.', { exact: true }).waitFor()
    assert.equal(await page.locator('.grouped-section').count(), 2)
    assert.ok(await page.locator('.performance-value').count() > 50)
    assert.ok(await page.locator('.performance-value').evaluateAll(nodes => nodes.every(node => node.dataset.performanceLabel === 'Data sintetis | validasi silang 5-fold')))
    assert.equal(await page.getByRole('switch').getAttribute('aria-checked'), 'false')
    await go('/tata-kelola'); await page.getByText(/Pola baru memerlukan retraining berkala/).waitFor()
  })
  await check('Queue: 3000 virtual rows, all filters, stable sort, keyboard detail and scroll measurements', async () => {
    await go('/antrean')
    await page.getByText(/3\.000 klaim teratas dari 62\.711/).waitFor(); await countIs(claims.length)
    assert.ok(await page.locator('.claim-row').count() < 30)
    measurements.virtual_scroll = await page.locator('.queue-scroll').evaluate(async el => {
      const intervals = []; let previous = performance.now(), maxRows = 0
      for (let i = 0; i < 100; i++) {
        el.scrollTop = (el.scrollHeight - el.clientHeight) * i / 99
        await new Promise(resolve => requestAnimationFrame(resolve))
        const now = performance.now(); intervals.push(now - previous); previous = now
        maxRows = Math.max(maxRows, el.querySelectorAll('.claim-row').length)
      }
      intervals.sort((a, b) => a - b)
      return { frames: intervals.length, median_ms: intervals[50], p95_ms: intervals[95], max_ms: intervals.at(-1), max_dom_rows: maxRows }
    })
    assert.ok(measurements.virtual_scroll.max_dom_rows < 30)
    await row(claims.at(-1)).waitFor()
    const started = Date.now()
    await page.getByLabel('Cari ID klaim atau faskes').fill(focusClaim.claim_id); await countIs(1)
    measurements.search_ms = Date.now() - started
    await page.locator('.claim-row').first().focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor()
    assert.ok((await page.getByRole('dialog').innerText()).includes(focusClaim.patient_ref))
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByLabel('Cari ID klaim atau faskes').fill('TIDAK-ADA'); await countIs(0); await reset()
    const reference = claims.find(c => c.risk_tier === 'high' && c.patterns.length)
    await page.getByLabel('Prioritas', { exact: true }).selectOption('high'); await countIs(claims.filter(c => c.risk_tier === 'high').length)
    await page.getByLabel('Pola dugaan', { exact: true }).selectOption(reference.patterns[0])
    await page.getByLabel('Kelas faskes', { exact: true }).selectOption(reference.faskes_class)
    await page.getByLabel('Layanan', { exact: true }).selectOption(reference.service_type)
    await page.getByLabel('Dari tanggal').fill(reference.admit_date); await page.getByLabel('Sampai tanggal').fill(reference.admit_date)
    const matching = claims.filter(c => c.risk_tier === 'high' && c.patterns.includes(reference.patterns[0]) && c.faskes_class === reference.faskes_class && c.service_type === reference.service_type && c.admit_date === reference.admit_date)
    await countIs(matching.length); await reset(); await countIs(claims.length)
    await page.getByRole('button', { name: 'Biaya klaim' }).click()
    await row(claims.reduce((best, c) => c.claim_total > best.claim_total ? c : best)).waitFor()
  })
  await check('Actual SHAP detail, decision persistence and safe CSV with BOM/quotes/newlines/formula neutralization', async () => {
    await go('/antrean'); assert.equal(await page.getByRole('columnheader', { name: 'Label sintetis' }).count(), 0)
    await row().click(); const dialog = page.getByRole('dialog'); await dialog.waitFor()
    assert.equal(await dialog.locator('.reason').count(), 3)
    for (const reason of focusClaim.reasons) assert.ok((await dialog.innerText()).includes(reason.text))
    await dialog.getByRole('button', { name: 'Perlu diperiksa', exact: true }).click()
    await dialog.getByLabel('Catatan pemeriksaan').fill('Perlu diperiksa terhadap rincian layanan dan bukti pendukung; bandingkan dengan kasus sejenis.')
    await dialog.getByRole('button', { name: 'Simpan keputusan' }).click(); await dialog.getByText('Keputusan diperbarui.', { exact: true }).waitFor()
    await accessibility(page)
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))
    await page.screenshot({ path: `${root}/screenshots/detail-klaim-desktop.png` })
    await dialog.getByLabel('Catatan pemeriksaan').fill('=HYPERLINK("https://example.invalid"); catatan, "uji"\nbaris kedua')
    await dialog.getByRole('button', { name: 'Simpan keputusan' }).click(); await dialog.getByText('Keputusan diperbarui.', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Tutup detail klaim' }).click()
    await page.reload(); await row().waitFor(); await row().click()
    assert.match(await page.getByLabel('Catatan pemeriksaan').inputValue(), /^=HYPERLINK/)
    assert.equal(await page.getByRole('button', { name: 'Perlu diperiksa', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: 'Tutup detail klaim' }).click()
    const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: /Ekspor keputusan/ }).click()
    const download = await downloadEvent; await download.saveAs(`${root}/qa-results/keputusan.csv`)
    const csv = await readFile(`${root}/qa-results/keputusan.csv`, 'utf8')
    assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes(focusClaim.claim_id)); assert.match(csv, /"'=HYPERLINK/); assert.match(csv, /""uji""/)
  })
  await check('Evaluation off by default, opt-in label visibility, budget controls and subset warning', async () => {
    await page.locator('a.nav-item[href="#/evaluasi"]').click(); await page.getByRole('switch').click()
    await page.getByText('Matriks evaluasi sederhana', { exact: true }).waitFor()
    await page.getByText(/Seluruh subset ekspor berada dalam anggaran ini/).waitFor()
    await page.getByRole('button', { name: 'Top 10%' }).click()
    await page.locator('a.nav-item[href="#/antrean"]').click(); await page.getByRole('columnheader', { name: 'Label sintetis' }).waitFor()
    await page.reload(); await page.locator('.claim-row').first().waitFor(); assert.equal(await page.getByRole('columnheader', { name: 'Label sintetis' }).count(), 0)
  })
  await check('Actual facility selection and filtered queue deep link', async () => {
    await go('/faskes'); const facility = facilities[1]
    await page.getByRole('row', { name: `Lihat ${facility.faskes_id}`, exact: true }).click()
    assert.equal(await page.locator('.facility-profile h2').innerText(), facility.faskes_id)
    await page.locator('.facility-detail').getByRole('link', { name: 'Antrean' }).click()
    assert.equal(await page.getByLabel('Cari ID klaim atau faskes').inputValue(), facility.faskes_id)
    await countIs(claims.filter(c => c.faskes_id === facility.faskes_id).length)
  })
  await check('Mobile 390px: five actual-data routes/screenshots, WCAG A/AA, no page overflow, working navigation/detail', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => localStorage.clear())
    for (const [name, path] of routes) {
      await go(path); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name)
      await accessibility(page); await page.screenshot({ path: `${root}/screenshots/${name}-mobile.png`, fullPage: true })
    }
    await page.getByRole('button', { name: 'Buka navigasi' }).click(); await page.locator('a.nav-item[href="#/antrean"]').click()
    await page.getByRole('heading', { name: 'Antrean audit', exact: true }).waitFor(); assert.equal(await page.locator('.sidebar.open').count(), 0)
    await row().click(); await page.getByRole('dialog').waitFor()
    assert.ok(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth))
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))
    await page.screenshot({ path: `${root}/screenshots/detail-klaim-mobile.png` }); await page.getByRole('button', { name: 'Tutup detail klaim' }).click()
  })
  await check('Corrupt/unavailable localStorage gracefully handled', async () => {
    const corrupt = await browser.newContext(); await corrupt.addInitScript(() => localStorage.setItem('klaimguard:auditor-decisions:v1', '{invalid'))
    const p = await corrupt.newPage(); await go('/antrean', p); await p.getByText(/Penyimpanan lokal tidak dapat dibaca/).waitFor(); await corrupt.close()
    const blocked = await browser.newContext(); await blocked.addInitScript(() => { Storage.prototype.getItem = () => { throw Error('blocked') }; Storage.prototype.setItem = () => { throw Error('blocked') } })
    const q = await blocked.newPage(); await go('/antrean', q); await q.locator('.claim-row').first().click(); await q.getByRole('button', { name: 'Wajar', exact: true }).click(); await q.getByRole('button', { name: 'Simpan keputusan' }).click()
    await q.getByRole('dialog').getByText(/Penyimpanan lokal gagal/).waitFor(); await blocked.close()
  })
  await check('Intentional JSON failure/retry, malformed schema, loading and empty states', async () => {
    const isolated = await browser.newContext(); const p = await isolated.newPage()
    await p.route('**/data/summary.json', r => r.fulfill({ status: 503, body: 'unavailable' })); await p.goto(`${base}/#/`); await p.getByText('Data belum dapat dimuat.').waitFor()
    await p.unroute('**/data/summary.json'); await p.getByRole('button', { name: 'Coba lagi' }).click(); await p.getByText('Audit yang lebih terarah.').waitFor()
    await p.route('**/data/claims_flagged.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })); await p.reload(); await p.getByText('Data belum dapat dimuat.').waitFor(); await p.unroute('**/data/claims_flagged.json')
    let release; const gate = new Promise(resolve => release = resolve)
    await p.route('**/data/summary.json', async r => { await gate; await r.continue() }); await p.reload({ waitUntil: 'domcontentloaded' }); await p.getByRole('status', { name: 'Memuat data dashboard' }).waitFor(); release()
    await p.getByText('Audit yang lebih terarah.').waitFor(); await p.unroute('**/data/summary.json')
    await p.route('**/data/claims_flagged.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })); await go('/antrean', p); await p.getByText('Belum ada klaim yang cocok.').waitFor(); await isolated.close()
  })
  await check('Unknown hash route offers recovery', async () => { await go('/tidak-ada'); await page.getByText('Halaman tidak ditemukan', { exact: true }).waitFor(); await page.getByRole('link', { name: 'Kembali ke Ringkasan' }).click(); await page.getByText('Audit yang lebih terarah.').waitFor() })
  assert.deepEqual(errors, [], 'Unexpected console or runtime errors')
  await writeFile(`${root}/qa-results/results.json`, JSON.stringify({ passed: checks.length, checks, runtimeErrors: errors, consoleErrors: errors, screenshots: 12, base, data_source: summary.data_source, n_exported_claims: claims.length, n_source_claims: summary.dataset.n_claims, measurements }, null, 2))
  console.log(`SUCCESS: ${checks.length} checks; 12 actual-data screenshots; 0 unexpected console/runtime errors.`)
  console.log(JSON.stringify(measurements))
} finally { await browser.close() }
