// routes/pets.js
const express = require('express');
const router = express.Router();
const pool = require('../db/index'); 
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { createClient } = require('@supabase/supabase-js');

// Инициализируем клиент Supabase на бэкенде
// Замените URL и Ключ на свои актуальные значения (желательно взять Service Role Key или Anon Key с правами на Storage)
const SUPABASE_URL = 'https://phugltuiwowvwbegtmem.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodWdsdHVpd293dndiZWd0bWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MDg0NzgsImV4cCI6MjA5ODE4NDQ3OH0.qJPXUQ1ekKYrIXpi8KVy8ipMBHZPNadLMC6Bsy8xGIY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Вспомогательная функция для удаления массива картинок из хранилища Supabase
async function deletePhotosFromSupabase(imagesArray) {
  if (!Array.isArray(imagesArray) || imagesArray.length === 0) return;

  try {
    // Извлекаем относительные пути файлов из полных URL-ссылок
    // Пример ссылки: .../storage/v1/object/public/pet-photos/animals/123-456.jpg
    // Нам нужно вырезать хвостик: "animals/123-456.jpg"
    const filesToDelete = imagesArray
      .map(url => {
        if (!url || typeof url !== 'string') return null;
        const parts = url.split('/pet-photos/');
        return parts.length > 1 ? parts[1] : null;
      })
      .filter(path => path !== null);

    if (filesToDelete.length === 0) return;

    // Вызываем API Supabase Storage для удаления файлов из бакета 'pet-photos'
    const { error } = await supabase.storage
      .from('pet-photos')
      .remove(filesToDelete);

    if (error) {
      console.error('Ошибка Supabase Storage при удалении файлов:', error.message);
    } else {
      console.log(`Успешно удалено файлов из хранилища: ${filesToDelete.length}`);
    }
  } catch (err) {
    console.error('Непредвиденная ошибка при очистке хранилища:', err.message);
  }
}

// 1. ПОЛУЧИТЬ ВСЕХ ПИТОМЦЕВ
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, type, age, gender, description, image_url AS photo_url, images, created_at FROM pets ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка GET /api/pets:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 2. ПОЛУЧИТЬ ОДНОГО ПИТОМЦА ПО ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, name, type, age, gender, description, image_url AS photo_url, images, created_at FROM pets WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Питомец не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка GET /api/pets/:id:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 3. ДОБАВИТЬ ПИТОМЦА
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  const { name, type, age, gender, description, images } = req.body;
  const finalImageUrl = req.body.image_url || req.body.photo_url || (Array.isArray(images) && images.length > 0 ? images[0] : null);

  if (!name || !type || !age || !gender) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 4. ОБНОВИТЬ ДАННЫЕ ПИТОМЦА (С умным удалением замененных фото)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, type, age, gender, description, images } = req.body;
  const finalImageUrl = req.body.image_url || req.body.photo_url || (Array.isArray(images) && images.length > 0 ? images[0] : null);

  if (!name || !type || !age || !gender) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  try {
    // Сначала получаем старое состояние карточки, чтобы узнать, какие фото были удалены пользователем
    const oldPetResult = await pool.query('SELECT images FROM pets WHERE id = $1', [id]);
    
    const queryText = `
      UPDATE pets 
      SET name = $1, type = $2, age = $3, gender = $4, description = $5, image_url = $6, images = $7
      WHERE id = $8
      RETURNING id, name, type, age, gender, description, image_url AS photo_url, images, created_at
    `;
    const values = [name, type, parseInt(age, 10), gender, description || null, finalImageUrl, images || [], id];
    const result = await pool.query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Питомец не найден' });
    }

    // Если обновление прошло успешно, находим фото, которые админ удалил во время редактирования, и стираем их из Supabase
    if (oldPetResult.rows.length > 0) {
      const oldImages = oldPetResult.rows[0].images || [];
      const newImages = images || [];
      // Оставляем только те ссылки, которых больше нет в новом массиве
      const deletedImages = oldImages.filter(img => !newImages.includes(img));
      
      if (deletedImages.length > 0) {
        // Запускаем асинхронное удаление (не блокируя ответ клиенту)
        deletePhotosFromSupabase(deletedImages);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка PUT /api/pets/:id:', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// 5. УДАЛИТЬ ПИТОМЦА (С полной очисткой его картинок из хранилища)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Шаг А: Сначала достаем информацию о питомце, чтобы забрать список его изображений из БД
    const petResult = await pool.query('SELECT images FROM pets WHERE id = $1', [id]);
    
    if (petResult.rows.length === 0) {
      return res.status(404).json({ error: 'Питомец не найден или уже удален' });
    }

    const petImages = petResult.rows[0].images || [];

    // Шаг Б: Удаляем саму запись о питомце из базы данных PostgreSQL
    await pool.query('DELETE FROM pets WHERE id = $1', [id]);

    // Шаг В: Стираем все связанные с ним файлы из Supabase Storage
    if (petImages.length > 0) {
      await deletePhotosFromSupabase(petImages);
    }

    res.json({ message: 'Карточка питомца и все связанные фотографии успешно удалены' });
  } catch (err) {
    console.error('Ошибка DELETE /api/pets/:id:', err.message);
    res.status(500).json({ error: 'Ошибка сервера при удалении карточки' });
  }
});

module.exports = router;