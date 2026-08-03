/**
 * Принимает заявку с сайта (POST JSON), пересылает её в Telegram и отправляет
 * серверное событие Lead в Meta Conversions API.
 *
 * Заменяет Netlify Forms: форма на странице шлёт сюда fetch напрямую,
 * без form-name/data-netlify и без промежуточной submission-created.
 *
 * Токен бота и chat ID — только из переменных окружения проекта на Netlify
 * (Project configuration → Environment variables), в коде их нет и быть не
 * должно: репозиторий публичный, любой секрет в нём считается
 * скомпрометированным. Локально — .env (см. .env.example), в git не попадает.
 *
 *   TELEGRAM_BOT_TOKEN — токен от @BotFather
 *   TELEGRAM_CHAT_ID   — куда слать: личный id, или -100... для группы/канала
 *   META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE — см. .env.example
 */
import { createHash } from 'node:crypto';

const CAR = {
  own: 'своя машина',
  rent: 'нужна аренда',
};

/* ---------- анти-спам: honeypot проверяется в handler, здесь — rate limit ---------- */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
/** ip -> отметки времени запросов за последнее окно. Живёт, пока тёплый инстанс функции. */
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function clientIp(event) {
  const headers = event.headers || {};
  const fwd = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  if (fwd) return fwd.split(',')[0].trim();
  return headers['x-nf-client-connection-ip'] || 'unknown';
}

/* ---------- валидация ---------- */

/** Приводит номер к +998XXXXXXXXX или возвращает null, если это не узбекский номер. */
function normalizeUzPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  let core;
  if (digits.length === 9) core = digits;                            // ввели без кода страны
  else if (digits.length === 12 && digits.startsWith('998')) core = digits.slice(3);
  else return null;
  return '+998' + core;
}

function formatPhonePretty(e164) {
  const d = e164.slice(4); // 9 цифр после +998
  return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTashkentTime() {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date()) + ' (Asia/Tashkent)';
}

function buildMessage({ name, phone, car, comment }) {
  const carLabel = CAR[car] || (car ? esc(car) : '—');
  return [
    '🚖 <b>Новая заявка</b>',
    '',
    `<b>Имя:</b> ${esc(name)}`,
    `<b>Телефон:</b> <a href="tel:${phone}">${formatPhonePretty(phone)}</a>`,
    `<b>Машина:</b> ${carLabel}`,
    `<b>Комментарий:</b> ${comment ? esc(comment) : '—'}`,
    `<b>Дата/время:</b> ${formatTashkentTime()}`,
  ].join('\n');
}

async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, status: 500, error: 'Сервер не настроен: заданы не все переменные окружения' };
  }

  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    // err.message от fetch никогда не содержит токен — он только в URL, которого здесь нет.
    console.error('Telegram недоступен:', err.message);
    return { ok: false, status: 502, error: 'Не удалось связаться с Telegram' };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Telegram отклонил сообщение:', res.status, body);
    return { ok: false, status: 502, error: 'Telegram отклонил сообщение' };
  }
  return { ok: true };
}

/* ---------- Meta Conversions API ---------- */

function hashField(value) {
  return createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function metaClientIp(event) {
  const headers = event.headers || {};
  return headers['x-nf-client-connection-ip'] || headers['client-ip'];
}

async function sendLeadToMetaCapi({ name, phone, eventId, pageUrl, fbp, fbc, clientIp, userAgent }) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token || !eventId) return;

  const userData = {
    ph: hashField(phone.replace(/\D/g, '')),
    fn: hashField(name),
  };
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: pageUrl || 'https://zerotaxiplus.uz/',
      user_data: userData,
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Meta CAPI отклонил событие:', res.status, body);
  }
}

const json = (statusCode, data) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(data),
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Разрешён только POST' });
  }

  if (isRateLimited(clientIp(event))) {
    return json(429, { ok: false, error: 'Слишком много запросов, попробуйте через минуту' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Некорректный JSON' });
  }

  // Honeypot: скрытое поле, которое видит только бот-заполнитель форм. Заполнено — молча гасим запрос.
  if (payload.website || payload.bot_field) {
    return json(200, { ok: true });
  }

  const name = String(payload.name || '').trim();
  if (name.length < 2) {
    return json(400, { ok: false, error: 'Укажите имя' });
  }

  const phone = normalizeUzPhone(payload.phone);
  if (!phone) {
    return json(400, { ok: false, error: 'Укажите номер в формате +998 XX XXX XX XX' });
  }

  const text = buildMessage({ name, phone, car: payload.car, comment: payload.comment });
  const result = await sendToTelegram(text);
  if (!result.ok) {
    return json(result.status, { ok: false, error: result.error });
  }

  // Аналитика не должна ломать ответ водителю: любая ошибка Meta гасится здесь.
  await sendLeadToMetaCapi({
    name,
    phone,
    eventId: payload.eventId,
    pageUrl: payload.pageUrl,
    fbp: payload.fbp,
    fbc: payload.fbc,
    clientIp: metaClientIp(event),
    userAgent: (event.headers || {})['user-agent'],
  }).catch((err) => console.error('Meta CAPI недоступен:', err.message));

  return json(200, { ok: true });
};
