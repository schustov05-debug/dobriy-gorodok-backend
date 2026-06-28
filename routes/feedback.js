const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/api/feedback', async (req, res) => {
    const { name, email, phone, topic, message } = req.body;

    // Формируем красивое сообщение
    const text = `📬 <b>Новая заявка с сайта!</b>\n\n` +
                 `👤 <b>Имя:</b> ${name}\n` +
                 `📧 <b>Email:</b> ${email}\n` +
                 `📱 <b>Телефон:</b> ${phone || 'Не указан'}\n` +
                 `🎯 <b>Тема:</b> ${topic}\n\n` +
                 `💬 <b>Сообщение:</b>\n${message}`;

    try {
        // Отправляем запрос к API Telegram
        await axios.post(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
            chat_id: process.env.TG_CHAT_ID,
            text: text,
            parse_mode: 'HTML' // Позволяет использовать жирный шрифт и эмодзи
        });

        res.status(200).json({ success: true, message: 'Сообщение отправлено в Telegram!' });
    } catch (error) {
        console.error('Ошибка отправки в Telegram:', error.response?.data || error.message);
        res.status(500).json({ error: 'Не удалось отправить сообщение' });
    }
});

module.exports = router;