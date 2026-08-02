#!/usr/bin/env node
/**
 * Снимает uploads/og-cover-ru.png и uploads/og-cover-uz.png из tools/og-cover.html.
 *
 * Соцсети и поисковики не показывают SVG в превью, поэтому обложка нужна растровая
 * и ровно 1200×630 — это размер, который ждут Open Graph и Twitter Card.
 *
 * Запуск (из корня репозитория):
 *   python3 -m http.server 8899 &      # шаблон тянет логотипы по абсолютным путям
 *   npm i playwright-core              # если ещё не стоит
 *   node tools/build-og-image.js
 *
 * Chromium берётся из PLAYWRIGHT_BROWSERS_PATH или из CHROMIUM_PATH.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'uploads');
const ORIGIN = process.env.OG_ORIGIN || 'http://127.0.0.1:8899';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright-core')); }
  catch { console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

  const browser = await chromium.launch({ executablePath: EXEC });
  for (const lang of ['ru', 'uz']) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const url = `${ORIGIN}/tools/og-cover.html?lang=${lang}`;
    const res = await page.goto(url, { waitUntil: 'networkidle' });
    if (!res || !res.ok()) { console.error(`Не удалось открыть ${url} — запущен ли статический сервер?`); process.exit(1); }
    await page.waitForTimeout(300);
    // JPEG, а не PNG: градиент в PNG весит под 600 КБ, в JPEG — около 60 КБ
    const out = path.join(OUT_DIR, `og-cover-${lang}.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
    console.log(`✓ ${path.relative(path.join(__dirname, '..'), out)} — ${(fs.statSync(out).size / 1024).toFixed(0)} КБ`);
    await page.close();
  }
  await browser.close();
})();
