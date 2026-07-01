const express = require('express');
const router = express.Router();
const Parser = require('rss-parser');
const pool = require('../db'); // Путь к вашему модулю подключения к pg/pool

const parser = new Parser();

// 1. GET /api/articles — Отдать статьи фронтенду из нашей БД
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM articles ORDER BY pub_date DESC LIMIT 20');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении статей:', err);
        res.status(500).json({ error: 'Не удалось загрузить статьи' });
    }
});

// 2. POST /api/articles/sync — Запуск парсинга (можно вызывать вручную или по таймеру)
router.post('/sync', async (req, res) => {
    try {
        // Пример открытой RSS-ленты (можно заменить на любую другую ветеринарную ленту)
        const feedUrl = 'https://vetandlife.ru/feed/';
        // Примечание: Для теста можно взять RSS любого крупного хаба или медиа, например: https://habr.com/ru/rss/articles/
        
        const feed = await parser.parseURL(feedUrl);
        let insertedCount = 0;

        for (const item of feed.items) {
            // Проверяем, нет ли уже статьи с такой ссылкой
            const checkExist = await pool.query('SELECT id FROM articles WHERE link = $1', [item.link]);
            
            if (checkExist.rows.length === 0) {
                // Пытаемся вытащить картинку из контента, если её нет в стандартном теге
                const imageUrl = item.enclosure?.url || ''; 

                await pool.query(
                    `INSERT INTO articles (title, link, description, pub_date, image_url, source_name) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        item.title, 
                        item.link, 
                        item.contentSnippet || item.description, 
                        item.pubDate ? new Date(item.pubDate) : new Date(), 
                        imageUrl,
                        feed.title || 'Ветеринарный блог'
                    ]
                );
                insertedCount++;
            }
        }

        res.json({ success: true, message: `Парсинг успешно завершен. Добавлено новых статей: ${insertedCount}` });
    } catch (err) {
        console.error('Ошибка парсинга:', err);
        res.status(500).json({ error: 'Ошибка во время парсинга данных' });
    }
});

module.exports = router;