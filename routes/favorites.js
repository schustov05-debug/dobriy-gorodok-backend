// routes/favorites.js
const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const authMiddleware = require('../middleware/auth');

// 1. Получить список всех избранных ID питомцев для текущего юзера
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT pet_id FROM favorites WHERE user_id = $1',
      [req.user.id]
    );
    // Возвращаем просто массив id, чтобы фронтенду было легче проверять наличие лайка
    const favoriteIds = result.rows.map(row => row.pet_id);
    res.json(favoriteIds);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при получении списка избранного' });
  }
});

// 2. Добавить питомца в избранное (POST /api/favorites/:pet_id)
router.post('/:pet_id', authMiddleware, async (req, res) => {
  try {
    const { pet_id } = req.params;
    
    // Проверяем, нет ли уже лайка, чтобы избежать дубликатов
    const checkExist = await pool.query(
      'SELECT id FROM favorites WHERE user_id = $1 AND pet_id = $2',
      [req.user.id, pet_id]
    );
    
    if (checkExist.rows.length > 0) {
      return res.status(400).json({ error: 'Питомец уже в избранном' });
    }

    await pool.query(
      'INSERT INTO favorites (user_id, pet_id) VALUES ($1, $2)',
      [req.user.id, pet_id]
    );
    res.status(201).json({ success: true, message: 'Добавлено в избранное' });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось добавить в избранное' });
  }
});

// 3. Удалить питомца из избранного (DELETE /api/favorites/:pet_id)
router.delete('/:pet_id', authMiddleware, async (req, res) => {
  try {
    const { pet_id } = req.params;
    const result = await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND pet_id = $2 RETURNING id',
      [req.user.id, pet_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Запись в избранном не найдена' });
    }
    res.json({ success: true, message: 'Удалено из избранного' });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось удалить из избранного' });
  }
});

module.exports = router;