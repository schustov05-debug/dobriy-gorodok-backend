const express = require('express');
const router = express.Router();
const Parser = require('rss-parser');
const cron = require('node-cron');
const pool = require('../db');

const parser = new Parser();

const FEED_URL = 'https://vetandlife.ru/feed/';

function extractImageUrl(item) {
    if (item.enclosure?.url) {
        return item.enclosure.url;
    }

    const htmlContent = item['content:encoded'] || item.content || '';
    const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch) {
        return imgMatch[1];
    }

    if (item['media:content']?.$?.url) {
        return item['media:content'].$.url;
    }

    return '';
}


async function syncArticles() {
    const feed = await parser.parseURL(FEED_URL);
    let insertedCount = 0;

    for (const item of feed.items) {
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


router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM articles ORDER BY pub_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении статей:', err);
        res.status(500).json({ error: 'Не удалось загрузить статьи' });
    }
});


router.post('/sync', async (req, res) => {
    try {
        const insertedCount = await syncArticles();
        res.json({ success: true, message: `Парсинг успешно завершен. Добавлено новых статей: ${insertedCount}` });
    } catch (err) {
        console.error('Ошибка парсинга:', err);
        res.status(500).json({ error: 'Ошибка во время парсинга данных' });
    }
});


cron.schedule('0 * * * *', async () => {
    try {
        const insertedCount = await syncArticles();
        console.log(`[cron] Автосинхронизация статей выполнена. Добавлено: ${insertedCount}`);
    } catch (err) {
        console.error('[cron] Ошибка автосинхронизации статей:', err);
    }
});

module.exports = router;