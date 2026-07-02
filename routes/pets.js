const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://phugltuiwowvwbegtmem.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBodWdsdHVpd293dndiZWd0bWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MDg0NzgsImV4cCI6MjA5ODE4NDQ3OH0.qJPXUQ1ekKYrIXpi8KVy8ipMBHZPNadLMC6Bsy8xGIY';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function deletePhotosFromSupabase(imagesArray) {
  if (!Array.isArray(imagesArray) || imagesArray.length === 0) return;

  try {
    const filesToDelete = imagesArray
      .map(url => {
        if (!url || typeof url !== 'string') return null;
        
        const animalsIndex = url.indexOf('animals/');
        if (animalsIndex !== -1) {
          return url.substring(animalsIndex);
        }
        return null;
      })
      .filter(path => path !== null);

    if (filesToDelete.length === 0) {
      console.log('Удаление отменено: не удалось распознать пути к файлам:', imagesArray);
      return;
    }

    console.log('Попытка удалить файлы из Supabase:', filesToDelete);

    const { data, error } = await supabase.storage
      .from('pet-photos')
      .remove(filesToDelete);

    if (error) {
      console.error('Ошибка Supabase Storage при удалении файлов:', error.message);
    } else {
      console.log('Файлы успешно удалены из Supabase Storage:', data);
    }
  } catch (err) {
    console.error('Непредвиденная ошибка при очистке хранилища:', err.message);
  }
}

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


router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  const { name, type, age, gender, description, images } = req.body;
  
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

router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, type, age, gender, description, images } = req.body;
  
  const finalImageUrl = req.body.image_url || req.body.photo_url || (Array.isArray(images) && images.length > 0 ? images[0] : null);

  if (!name || !type || !age || !gender) {
    return res.status(400).json({ error: 'Пожалуйста, заполните обязательные поля (имя, тип, возраст, пол)' });
  }

  try {
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
      return res.status(404).json({ error: 'Питомец не найден или уже был удален' });
    }

    if (oldPetResult.rows.length > 0) {
      const oldImages = oldPetResult.rows[0].images || [];
      const newImages = images || [];
      
      const deletedImages = oldImages.filter(img => !newImages.includes(img));
      
      if (deletedImages.length > 0) {
        deletePhotosFromSupabase(deletedImages);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка PUT /api/pets/:id:', err.message);
    res.status(500).json({ error: 'Не удалось обновить данные питомца в базе данных' });
  }
});

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const petResult = await pool.query('SELECT images FROM pets WHERE id = $1', [id]);
    
    if (petResult.rows.length === 0) {
      return res.status(404).json({ error: 'Питомец не найден или уже удален' });
    }

    const petImages = petResult.rows[0].images || [];

    await pool.query('DELETE FROM pets WHERE id = $1', [id]);

    if (petImages.length > 0) {
      await deletePhotosFromSupabase(petImages);
    }

    res.json({ message: 'Карточка питомца и все связанные фотографии успешно удалены из базы и облака' });
  } catch (err) {
    console.error('Ошибка DELETE /api/pets/:id:', err.message);
    res.status(500).json({ error: 'Ошибка сервера при удалении карточки' });
  }
});

module.exports = router;