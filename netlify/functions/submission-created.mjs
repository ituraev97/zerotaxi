/**
 * Пересылает заявки с сайта в Telegram.
 *
 * Netlify сам вызывает функцию с именем submission-created каждый раз, когда
 * Netlify Forms принимает заявку (уже отсеяв спам). Отдельный роут не нужен и
 * не должен задаваться — имя файла и есть триггер.
 *
 * Экспортируется именно `handler` (сигнатура v1). Для событийных функций
 * Netlify документирует этот формат; у функций нового формата (export default)
 * основной сценарий — обработка HTTP-запроса по своему пути.
 *
 * Токен бота и chat ID лежат в переменных окружения проекта на Netlify
 * (Project configuration → Environment variables), а не в коде: репозиторий
 * публичный, и любой секрет в нём считается скомпрометированным.
 *
 *   TELEGRAM_BOT_TOKEN — токен от @BotFather
 *   TELEGRAM_CHAT_ID   — куда слать: личный id, или -100... для группы/канала
 *
 * Заявка при этом всё равно сохраняется в разделе Forms на Netlify, так что
 * даже если Telegram недоступен, ни одна заявка не теряется. Поэтому функция
 * в любом случае отвечает 200: ошибка тут не должна ломать приём заявок.
 */

const CAR = {
  own: 'своя машина',
  rent: 'нужна аренда',
};

/** Экранирование под parse_mode: HTML — иначе имя со «<» уронит отправку. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildMessage(data = {}, meta = {}) {
  const lines = [
    '🚕 <b>Новая заявка с сайта</b>',
    '',
    `<b>Имя:</b> ${esc(data.name || '—')}`,
    `<b>Телефон:</b> ${esc(data.phone || '—')}`,
    `<b>Автомобиль:</b> ${CAR[data.car] || esc(data.car || '—')}`,
  ];
  // страница подсказывает язык заявки: /uz/ — заявка с узбекской версии
  if (meta.page) lines.push(`<b>Страница:</b> ${esc(meta.page)}`);
  if (meta.time) lines.push(`<b>Время:</b> ${esc(meta.time)}`);
  return lines.join('\n');
}

export async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { ok: false, reason: 'Не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID' };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const body = await res.text();
  // Тело ответа Telegram объясняет причину: не тот chat_id, бот не запущен и т.п.
  return res.ok ? { ok: true } : { ok: false, reason: `Telegram ${res.status}: ${body}` };
}

export const handler = async (event) => {
  let payload;
  try {
    const parsed = JSON.parse(event?.body || '{}');
    payload = parsed.payload ?? parsed;
  } catch (err) {
    console.error('Не удалось разобрать тело запроса от Netlify Forms:', err);
    return { statusCode: 200, body: 'bad payload' };
  }

  const data = payload?.data ?? {};
  const text = buildMessage(data, {
    page: data.page || payload?.referrer || '',
    time: payload?.created_at || new Date().toISOString(),
  });

  const result = await sendToTelegram(text);
  if (!result.ok) {
    console.error('Заявка НЕ отправлена в Telegram:', result.reason);
    return { statusCode: 200, body: 'telegram error' };
  }

  console.log('Заявка отправлена в Telegram');
  return { statusCode: 200, body: 'ok' };
};
