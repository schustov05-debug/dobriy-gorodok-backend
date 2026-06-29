// routes/pets.js
const express = require('express');
const router = express.Router();
const pool = require('../db/index'); // Подключение через pg.Pool
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// 1. ПОЛУЧИТЬ ВСЕХ ПИТОМЦЕВ (Доступно всем)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, type, age, gender, description, image_url AS photo_url, images, created_at FROM pets ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка GET /api/pets:', err.message);
    res.status(500).json({ error: 'Ошибка сервера при получении списка питомцев' });
  }
});

// 2. ПОЛУЧИТЬ ОДНОГО ПИТОМЦА ПО ID (Для карточки)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, name, type, age, gender, description, image_url AS photo_url, images, created_at FROM pets WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Питомец не найден' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка GET /api/pets/:id:', err.message);
    res.status(500).json({ error: 'Некорректный ID или ошибка сервера' });
  }
});

// 3. ДОБАВИТЬ ПИТОМЦА (Только для Администратора)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  const { name, type, age, gender, description, images } = req.body;
  
  // Безопасный перехват ссылки для обратной совместимости: 
  // если images — массив, берем первую картинку как главную для image_url
  const finalImageUrl = req.body.image_url || req.body.photo_url || (Array.isArray(images) && images.length > 0 ? images[0] : null);

  if (!name || !type || !age || !gender) {
    return res.status(400).json({ error: 'Пожалуйста, заполните обязательные поля (имя, тип, возраст, пол)' });
  }

  try {
    const queryText = `
      INSERT INTO pets (name, type, age, gender, description, image_url, images)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, type, age, gender, description, image_url AS photo_url, images, created_at
    `;
    const values = [name, type, parseInt(age, 10), gender, description || null, finalImageUrl, images || []];
    
    const result = await pool.query(queryText, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка POST /api/pets:', err.message);
    res.status(500).json({ error: 'Не удалось сохранить питомца в базу данных' });
  }
});

// 4. ОБНОВИТЬ ДАННЫЕ ПИТОМЦА (Только для Администратора)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, type, age, gender, description, images } = req.body;
  
  // Синхронизируем главную картинку: берем первую из обновленного массива images
  const finalImageUrl = req.body.image_url || req.body.photo_url || (Array.isArray(images) && images.length > 0 ? images[0] : null);

  if (!name || !type || !age || !gender) {
    return res.status(400).json({ error: 'Пожалуйста, заполните обязательные поля (имя, тип, возраст, пол)' });
  }

  try {
    const queryText = `
      UPDATE pets 
      SET name = $1, type = $2, age = $3, gender = $4, description = $5, image_url = $6, images = $7
      WHERE id = $8
      RETURNING id, name, type, age, gender, description, image_url AS photo_url, images, created_at
    `;
    const values = [name, type, parseInt(age, 10), gender, description || null, finalImageUrl, images || [], id];

    const result = await pool.query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Питомец не найден или уже был удален' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка PUT /api/pets/:id:', err.message);
    res.status(500).json({ error: 'Не удалось обновить данные питомца в базе данных' });
  }
});

// 5. УДАЛИТЬ ПИТОМЦА (Только для Администратора)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM pets WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Питомец не найден или уже удален' });
    }
    res.json({ message: 'Карточка питомца успешно удалена из базы' });
  } catch (err) {
    console.error('Ошибка DELETE /api/pets/:id:', err.message);
    res.status(500).json({ error: 'Ошибка сервера при удалении карточки' });
  }
});

module.exports = router;