/**
 * ВРЕМЕННАЯ диагностика связки с Telegram. Удалить, когда заявки пойдут.
 *
 * Открыть в браузере (chat — это значение TELEGRAM_CHAT_ID, служит простым
 * ключом, чтобы страницу не дёргал кто попало):
 *
 *   https://zerotaxiplus.uz/api/telegram-check?chat=ВАШ_CHAT_ID
 *
 * Страница показывает, что именно отвечает Telegram: валиден ли токен
 * (getMe) и доходит ли сообщение до чата (sendMessage). Самая частая причина
 * молчания бота — пользователь не нажал Start: Telegram запрещает ботам
 * писать первыми и отвечает «bot can't initiate conversation with a user».
 */

const redact = (text, token) => (token ? String(text).split(token).join('<токен>') : String(text));

export default async (req) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

  /* Простой ключ: без него по этому адресу мог бы слать вам сообщения кто угодно. */
  if (chatId && new URL(req.url).searchParams.get('chat') !== String(chatId)) {
    return new Response('Not found', { status: 404 });
  }

  if (!token || !chatId) {
    return json({
      ok: false,
      шаг: 'переменные окружения',
      проблема: 'TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы в настройках проекта на Netlify',
      токен_задан: Boolean(token),
      chat_id_задан: Boolean(chatId),
    }, 500);
  }

  const call = async (method, body) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    try { return { status: res.status, ...JSON.parse(text) }; }
    catch { return { status: res.status, raw: redact(text, token) }; }
  };

  const me = await call('getMe');
  if (!me.ok) {
    return json({
      ok: false,
      шаг: 'getMe',
      проблема: 'Telegram не принял токен. Перевыпустите его через @BotFather и обновите переменную TELEGRAM_BOT_TOKEN.',
      ответ_telegram: me,
    });
  }

  const sent = await call('sendMessage', {
    chat_id: chatId,
    text: '✅ Проверка связи: заявки с сайта будут приходить сюда.',
  });

  if (!sent.ok) {
    const desc = String(sent.description || '');
    let подсказка = 'Смотрите поле description ниже — там точная причина от Telegram.';
    if (/can't initiate|bot can't/i.test(desc)) {
      подсказка = 'Откройте бота в Telegram и нажмите Start. Ботам запрещено писать пользователю первыми.';
    } else if (/chat not found/i.test(desc)) {
      подсказка = 'Неверный TELEGRAM_CHAT_ID. Свой id можно узнать у бота @userinfobot; для группы id начинается с -100.';
    } else if (/blocked/i.test(desc)) {
      подсказка = 'Бот заблокирован в этом чате — разблокируйте его.';
    } else if (/kicked|not a member/i.test(desc)) {
      подсказка = 'Бота удалили из группы — добавьте его обратно.';
    }
    return json({ ok: false, шаг: 'sendMessage', бот: '@' + me.result.username, подсказка, ответ_telegram: sent });
  }

  return json({
    ok: true,
    бот: '@' + me.result.username,
    chat_id: chatId,
    итог: 'Сообщение доставлено. Проверьте Telegram — заявки будут приходить так же.',
    напоминание: 'Этот эндпоинт временный, удалите netlify/functions/telegram-check.mjs, когда всё заработает.',
  });
};

export const config = {
  path: '/api/telegram-check',
};
