// routes/feedback.js или прямо в server.js (в зависимости от твоей архитектуры)
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

router.post('/api/feedback', async (req, res) => {
    // Принимаем данные, которые прислал наш React-фронтенд
    const { name, email, phone, topic, message } = req.body;

    // Простая валидация на бэке (обязательные поля)
    if (!name || !email || !topic || !message) {
        return res.status(400).json({ error: 'Пожалуйста, заполните все обязательные поля.' });
    }

    // 1. Создаем транспорт для отправки писем через SMTP Яндекса
const transporter = nodemailer.createTransport({
    host: 'smtp.yandex.ru',
    port: 587,
    secure: false, // Обязательно false для 587 порта
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
    // Вот здесь решение вашей ошибки:
    family: 4, 
    // Дополнительные параметры для надежности:
    connectionTimeout: 10000,
    socketTimeout: 20000
});

    // 2. Настраиваем само письмо
    const mailOptions = {
        // От кого: Имя системы и адрес ящика-отправителя (должен совпадать с SMTP_USER)
        from: `"Приют Добрый Городок" <${process.env.SMTP_USER}>`, 
        
        // Кому: Твоя личная почта, куда должны приходить заявки
        to: 'schustov05@yandex.ru', 
        
        // Тема письма
        subject: `Форма обратной связи: ${topic}`, 
        
        // Текст письма в формате HTML для красивого отображения в интерфейсе почты
        html: `
            <div style="font-family: sans-serif; padding: 20px; background-color: #f9f9f9; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #365E42; margin-top: 0;">Новое обращение с сайта приюта</h2>
                <hr style="border: none; border-top: 1px solid #ddd; margin-bottom: 20px;" />
                
                <p><b>Имя отправителя:</b> ${name}</p>
                <p><b>Email для связи:</b> <a href="mailto:${email}">${email}</a></p>
                <p><b>Телефон:</b> ${phone ? phone : '<span style="color: #999;">не указан</span>'}</p>
                <p><b>Тема вопроса:</b> ${topic}</p>
                
                <div style="background-color: #fff; padding: 15px; border-left: 4px solid #365E42; border-radius: 4px; margin-top: 20px;">
                    <p style="margin: 0; font-weight: bold; margin-bottom: 8px;">Текст сообщения:</p>
                    <p style="margin: 0; white-space: pre-wrap; color: #333;">${message}</p>
                </div>
            </div>
        `,
    };

    try {
        // 3. Отправляем письмо
        await transporter.sendMail(mailOptions);
        
        // Возвращаем фронтенду успешный статус
        return res.status(200).json({ success: true, message: 'Письмо отправлено администратору.' });
    } catch (error) {
        console.error('Ошибка при отправке почты через Nodemailer:', error);
        
        // Если что-то пошло не так (например, Яндекс заблокировал вход), фронтенд получит ошибку 500
        return res.status(500).json({ error: 'Внутренняя ошибка сервера при отправке сообщения.' });
    }
});

module.exports = router;