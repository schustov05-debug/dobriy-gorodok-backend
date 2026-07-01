const express = require('express');
const router = express.Router();
const Parser = require('rss-parser');
const cron = require('node-cron'); // npm install node-cron
const pool = require('../db'); // Путь к вашему модулю подключения к pg/pool

const parser = new Parser();

const FEED_URL = 'https://vetandlife.ru/feed/';
// Примечание: Для теста можно взять RSS любого крупного хаба или медиа, например: https://habr.com/ru/rss/articles/

// Вспомогательная функция: пытаемся вытащить картинку из разных мест RSS-элемента
function extractImageUrl(item) {
    if (item.enclosure?.url) {
        return item.enclosure.url;
    }

    // Часто картинка лежит внутри HTML-контента (content:encoded / content)
    const htmlContent = item['content:encoded'] || item.content || '';
    const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch) {
        return imgMatch[1];
    }

    // Иногда парсер кладёт media:content отдельным полем
    if (item['media:content']?.$?.url) {
        return item['media:content'].$.url;
    }

    return '';
}

// Функция синхронизации, вынесена отдельно, чтобы её можно было
// вызывать и из роута, и по расписанию (cron)
async function syncArticles() {
    const feed = await parser.parseURL(FEED_URL);
    let insertedCount = 0;

    for (const item of feed.items) {
        // Проверяем, нет ли уже статьи с такой ссылкой
        const checkExist = await pool.query('SELECT id FROM articles WHERE link = $1', [item.link]);

        if (checkExist.rows.length === 0) {
            const imageUrl = extractImageUrl(item);

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

    return insertedCount;
}

// 1. GET /api/articles — Отдать статьи фронтенду из нашей БД
// ВАЖНО: раньше здесь стоял LIMIT 20, из-за чего фронтенд никогда
// не получал больше 20 статей, сколько бы их ни было в базе.
// Фронтенд сам пагинирует полученный список, поэтому лимит снят.
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM articles ORDER BY pub_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении статей:', err);
        res.status(500).json({ error: 'Не удалось загрузить статьи' });
    }
});

// 2. POST /api/articles/sync — Запуск парсинга (можно вызывать вручную)
router.post('/sync', async (req, res) => {
    try {
        const insertedCount = await syncArticles();
        res.json({ success: true, message: `Парсинг успешно завершен. Добавлено новых статей: ${insertedCount}` });
    } catch (err) {
        console.error('Ошибка парсинга:', err);
        res.status(500).json({ error: 'Ошибка во время парсинга данных' });
    }
});

// 3. Автосинхронизация по расписанию — раз в час, силами сервера,
// а не по факту захода пользователя на страницу.
// Запускается один раз при старте сервера (когда роутер подключается).
cron.schedule('0 * * * *', async () => {
    try {
        const insertedCount = await syncArticles();
        console.log(`[cron] Автосинхронизация статей выполнена. Добавлено: ${insertedCount}`);
    } catch (err) {
        console.error('[cron] Ошибка автосинхронизации статей:', err);
    }
});

module.exports = router;