/**
 * Пересылает заявки с сайта в Telegram.
 *
 * Netlify сам вызывает функцию с именем submission-created каждый раз, когда
 * Netlify Forms принимает заявку (уже отсеяв спам). Отдельный роут не нужен и
 * не должен задаваться — имя файла и есть триггер.
 *
 * Токен бота и chat ID лежат в переменных окружения проекта на Netlify
 * (Project configuration → Environment variables), а не в коде: репозиторий
 * публичный, и любой секрет в нём считается скомпрометированным.
 *
 *   TELEGRAM_BOT_TOKEN — токен от @BotFather
 *   TELEGRAM_CHAT_ID   — куда слать: личный id, или -100... для группы/канала
 *
 * Заявка при этом всё равно сохраняется в разделе Forms на Netlify, так что
 * даже если Telegram недоступен, ни одна заявка не теряется.
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

function buildMessage(data, meta) {
  const name = esc(data.name || '—');
  const phone = esc(data.phone || '—');
  const car = CAR[data.car] || esc(data.car || '—');

  const lines = [
    '🚕 <b>Новая заявка с сайта</b>',
    '',
    `<b>Имя:</b> ${name}`,
    `<b>Телефон:</b> ${phone}`,
    `<b>Автомобиль:</b> ${car}`,
  ];

  // страница подсказывает язык заявки: /uz/ — заявка с узбекской версии
  if (meta.page) lines.push(`<b>Страница:</b> ${esc(meta.page)}`);
  if (meta.time) lines.push(`<b>Время:</b> ${esc(meta.time)}`);

  return lines.join('\n');
}

export default async (req) => {
  const token = Netlify.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Netlify.env.get('TELEGRAM_CHAT_ID');

  if (!token || !chatId) {
    // Не роняем обработку: заявка уже сохранена в Netlify Forms.
    console.error('Не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID — заявка в Telegram не отправлена');
    return new Response('missing telegram config', { status: 200 });
  }

  let payload;
  try {
    const body = await req.json();
    payload = body?.payload ?? body;
  } catch (err) {
    console.error('Не удалось разобрать тело запроса от Netlify Forms:', err);
    return new Response('bad payload', { status: 200 });
  }

  const data = payload?.data ?? {};
  const message = buildMessage(data, {
    page: data.page || payload?.referrer || '',
    time: payload?.created_at || new Date().toISOString(),
  });

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    // Тело ответа Telegram объясняет причину: не тот chat_id, бот не запущен и т.п.
    console.error('Telegram отклонил сообщение:', res.status, await res.text());
    return new Response('telegram error', { status: 200 });
  }

  console.log('Заявка отправлена в Telegram');
  return new Response('ok', { status: 200 });
};
