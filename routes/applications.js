// routes/applications.js
const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const authMiddleware = require('../middleware/auth');
const axios = require('axios');

router.get('/check/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  try {
    const checkResult = await pool.query(
      'SELECT 1 FROM applications WHERE user_id = $1 AND pet_id = $2 LIMIT 1',
      [user_id, id]
    );
    res.json({ applied: checkResult.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка проверки' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  const { pet_id } = req.body; // Больше не ждем никакой type с фронтенда
  const user_id = req.user.id;
  
  if (!pet_id) {
    return res.status(400).json({ error: 'Не указан ID питомца' });
  }
  try {
    const existing = await pool.query(
      'SELECT 1 FROM applications WHERE user_id = $1 AND pet_id = $2 LIMIT 1',
      [user_id, pet_id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Вы уже подавали заявку на этого питомца!" });
    }
    // 1. Записываем заявку в БД приюта Supabase
    const appResult = await pool.query(
      'INSERT INTO applications (user_id, pet_id) VALUES ($1, $2) RETURNING *',
      [user_id, pet_id]
    );

    // 2. Достаем информацию о пользователе и питомце для Telegram-уведомления волонтерам
    const userResult = await pool.query('SELECT full_name, phone FROM users WHERE id = $1', [req.user.id]);
    const petResult = await pool.query('SELECT name, type AS pet_type FROM pets WHERE id = $1', [pet_id]);

    const client = userResult.rows[0] || {};
    const pet = petResult.rows[0] || {};

    // Формируем строгое и четкое сообщение для волонтеров
    const telegramMessage = 
      `🚨 *НОВАЯ ЗАЯВКА В ПРИЮТЕ!*\n\n` +
      `🏠 *Цель:* ХОЧЕТ ЗАБРАТЬ ДОМОЙ\n` +
      `👤 *Имя клиента:* ${client.full_name || 'Не указано'}\n` +
      `📞 *Телефон:* ${client.phone || 'Не указано'}\n` +
      `🐈 *Питомец:* ${pet.name || 'Неизвестный'} (${pet.pet_type === 'dog' ? 'собака' : 'кошка'})\n` +
      `📅 *Дата:* ${new Date().toLocaleDateString('ru-RU')}`;

    // Отправка в Telegram через твои переменные из Render.com
    if (process.env.TG_TOKEN && process.env.TG_CHAT_ID) {
      await axios.post(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
        chat_id: process.env.TG_CHAT_ID,
        text: telegramMessage,
        parse_mode: 'Markdown'
      });
    } else {
      console.warn('Предупреждение: На сервере Render не найдены переменные TG_TOKEN или TG_CHAT_ID');
    }

    res.status(201).json(appResult.rows[0]);
  } catch (err) {
    console.error('Ошибка при создании заявки:', err.message);
    res.status(500).json({ error: 'Ошибка сервера при оформлении заявки' });
  }
});

module.exports = router;