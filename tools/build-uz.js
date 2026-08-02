#!/usr/bin/env node
/**
 * Собирает uz/index.html из index.html и tools/uz-translations.json.
 *
 * Русская главная — единственный источник вёрстки. Узбекская страница не правится
 * руками: поменяли index.html или переводы — запустили сборку заново.
 *
 *   node tools/build-uz.js
 *
 * Скрипт падает с ненулевым кодом, если у какого-то data-i18n нет перевода, —
 * так узбекская версия не может втихую разъехаться с русской.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.URL || 'https://zerotaxiplus.uz';
const SRC = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'uz', 'index.html');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'uz-translations.json'), 'utf8'));

const die = (msg) => { console.error('Сборка остановлена: ' + msg); process.exit(1); };
let h = fs.readFileSync(SRC, 'utf8');
const missing = [];

/* ---------- 1. Тексты по data-i18n ---------- */
h = h.replace(/(<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
  (all, open, tag, key, inner, close) => {
    const uz = T.keys[key];
    if (uz === undefined) { missing.push(key); return all; }
    return open + uz + close;
  });

/* ---------- 2. Плейсхолдеры по data-ph ---------- */
h = h.replace(/(<(?:input|textarea)\b[^>]*\bdata-ph="([^"]+)"[^>]*>)/g, (all, el, key) => {
  const uz = T.keys[key];
  if (uz === undefined) { missing.push(key); return all; }
  return el.replace(/placeholder="[^"]*"/, 'placeholder="' + uz + '"');
});

if (missing.length) die('нет перевода для ключей: ' + [...new Set(missing)].join(', '));

/* ---------- 3. Язык страницы ---------- */
h = h.replace('<html lang="ru">', '<html lang="uz">');
h = h.replace(/^var lang = 'ru';[^\n]*$/m,
  "var lang = 'uz';        // страница собрана сборщиком tools/build-uz.js");

/* ---------- 4. Метаданные ---------- */
const m = T.meta;
const set = (re, val, what) => {
  if (!re.test(h)) die('не найден ' + what + ' в index.html');
  h = h.replace(re, val);
};
set(/<title>[^<]*<\/title>/, `<title>${m.title}</title>`, '<title>');
set(/<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${m.description}">`, 'meta description');
set(/<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${m.ogTitle}">`, 'og:title');
set(/<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${m.ogDescription}">`, 'og:description');
set(/<meta property="og:image:alt" content="[^"]*">/,
    `<meta property="og:image:alt" content="${m.ogImageAlt}">`, 'og:image:alt');
/* обложка для соцсетей — узбекская (uploads/og-cover-uz.jpg, см. tools/build-og-image.js) */
h = h.split(`${BASE}/uploads/og-cover-ru.jpg`).join(`${BASE}/uploads/og-cover-uz.jpg`);
set(/<meta property="og:locale" content="ru_RU">/,
    '<meta property="og:locale" content="uz_UZ">', 'og:locale');
set(/<meta property="og:locale:alternate" content="uz_UZ">/,
    '<meta property="og:locale:alternate" content="ru_RU">', 'og:locale:alternate');
set(/<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${BASE}/uz/">`, 'canonical');
set(/<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${BASE}/uz/">`, 'og:url');

/* ---------- 5. Переключатель языка: активна узбекская версия ---------- */
const toggle = `      <div class="lang" aria-label="Язык / Til">
        <a class="is-on" href="/" hreflang="ru" lang="ru" aria-current="true">RU</a>
        <a href="/uz/" hreflang="uz" lang="uz">UZ</a>
      </div>`;
if (!h.includes(toggle)) die('не найдена разметка переключателя языка');
h = h.replace(toggle, `      <div class="lang" aria-label="${m.langLabel}">
        <a href="/" hreflang="ru" lang="ru">RU</a>
        <a class="is-on" href="/uz/" hreflang="uz" lang="uz" aria-current="true">UZ</a>
      </div>`);

/* ---------- 6. Ссылки на узбекский блог ---------- */
h = h.replace(/(<a[^>]*\bdata-blog-link\b[^>]*>)/g, (el) => el.replace('href="/blog/"', 'href="/uz/blog/"'));

/* ---------- 7. Подписи в атрибутах и текст вне data-i18n ---------- */
[['Основная навигация', m.navLabel], ['Меню', m.menuLabel],
 ['Знак ZERO TAXI', m.markAlt], ['Отзывы', m.reviewsLabel],
 ['Написать в Telegram', m.fabLabel],
].forEach(([ru, uz]) => { h = h.split(`"${ru}"`).join(`"${uz}"`); });
h = h.replace(/aria-label="Отзыв (\d)"/g, `aria-label="${m.reviewLabel} $1"`);
h = h.replace('<label>Не заполняйте: ', `<label>${m.hpLabel} `);

/* Счётчики в шапке: у части из них узбекская единица измерения лежит в data-suffix-uz.
   На узбекской странице она становится основным data-suffix, а сам data-suffix-uz
   больше не нужен. Заодно пересобираем статический текст: до выполнения JS —
   и в глазах краулера — виден именно он. */
h = h.replace(/(<div class="stats__num"[^>]*>)([^<]*)(<\/div>)/g, (all, open, txt, close) => {
  const uzSuffix = (open.match(/data-suffix-uz="([^"]*)"/) || [])[1];
  if (uzSuffix === undefined) return all;
  const count = (open.match(/data-count="([^"]*)"/) || [])[1];
  const dec = parseInt((open.match(/data-decimals="([^"]*)"/) || [])[1] || '0', 10);
  const head = open.replace(/data-suffix="[^"]*"/, `data-suffix="${uzSuffix}"`)
                   .replace(/\s*data-suffix-uz="[^"]*"/, '');
  return head + Number(count).toFixed(dec) + uzSuffix + close;
});

/* ---------- 8. JSON-LD ---------- */
const ldRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
const ld = JSON.parse(h.match(ldRe)[1]);
const biz = ld['@graph'].find(n => n['@type'] === 'LocalBusiness');
biz.description = m.ldDescription;
biz.areaServed = m.ldAreaServed;
biz.address.addressLocality = m.ldLocality;
biz.address.streetAddress = m.ldStreet;
biz.priceRange = m.ldPriceRange;
const faq = ld['@graph'].find(n => n['@type'] === 'FAQPage');
faq.mainEntity.forEach((q, i) => {
  const qk = 'q' + (i + 1), ak = 'a' + (i + 1);
  if (!T.keys[qk] || !T.keys[ak]) die(`нет перевода FAQ ${qk}/${ak}`);
  q.name = T.keys[qk];
  q.acceptedAnswer.text = T.keys[ak];
});
h = h.replace(ldRe, '<script type="application/ld+json">\n' + JSON.stringify(ld) + '\n</script>');

/* ---------- 9. hreflang ---------- */
h = h.replace(/<link rel="alternate" hreflang="ru"[^>]*>\n<link rel="alternate" hreflang="uz"[^>]*>\n<link rel="alternate" hreflang="x-default"[^>]*>/,
`<link rel="alternate" hreflang="ru" href="${BASE}/">
<link rel="alternate" hreflang="uz" href="${BASE}/uz/">
<link rel="alternate" hreflang="x-default" href="${BASE}/">`);

/* ---------- 10. Проверки перед записью ---------- */
h = '<!-- Файл собран автоматически: node tools/build-uz.js. Правьте index.html и tools/uz-translations.json, а не этот файл. -->\n' + h;
/* Кириллица допустима только в комментариях — в CSS, в JS и в HTML: это заметки
   для того, кто правит код, посетитель их не видит. В самом тексте её быть не должно. */
const visible = h
  .replace(ldRe, '')                       // JSON-LD проверяется отдельно ниже
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '');
if (/[А-Яа-яЁё]{3,}/.test(visible)) {
  const lines = visible.split('\n')
    .map((l, i) => [i + 1, l.trim()])
    .filter(([, l]) => /[А-Яа-яЁё]{3,}/.test(l));
  console.error('Сборка остановлена: в тексте узбекской страницы осталась кириллица.');
  console.error('Добавьте этим элементам data-i18n в index.html или обработку в tools/build-uz.js:\n');
  lines.slice(0, 30).forEach(([n, l]) => console.error(`  ${l.slice(0, 150)}`));
  if (lines.length > 30) console.error(`  … и ещё ${lines.length - 30} строк`);
  process.exit(1);
}
const ldCyr = JSON.stringify(ld).match(/[А-Яа-яЁё]{3,}/g);
if (ldCyr) die('в JSON-LD осталась кириллица: ' + [...new Set(ldCyr)].slice(0, 8).join(', '));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, h);
console.log(`✓ uz/index.html собран — ${Object.keys(T.keys).length} переводов, ${h.length} байт`);
