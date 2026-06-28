const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// POST /api/auth/register — регистрация
router.post('/register', async (req, res) => {
  // Получаем email и пароль из тела запроса
  const { email, password } = req.body;

  // Простая проверка что оба поля заполнены
  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  try {
    // Проверяем что пользователь с таким email не существует
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Хешируем пароль. Число 10 — это "cost factor":
    // чем больше — тем дольше вычисляется хеш и тем сложнее его взломать.
    // 10 — стандартное значение, баланс между безопасностью и скоростью.
    const password_hash = await bcrypt.hash(password, 10);

    // Сохраняем пользователя в БД и сразу получаем его данные обратно
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, role`,
      [email, password_hash]
    );
    const user = result.rows[0];

    // Создаём JWT токен.
    // Первый аргумент — данные которые хотим хранить в токене
    // Второй — секретный ключ
    // expiresIn: '7d' — токен действует 7 дней
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Возвращаем токен и данные пользователя фронтенду
    res.status(201).json({ token, user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/login — вход
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  try {
    // Ищем пользователя по email
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    const user = result.rows[0];

    // Сравниваем введённый пароль с хешем в БД.
    // bcrypt.compare сама хеширует введённый пароль и сравнивает с хранимым хешем
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      // Специально не уточняем что именно неверно (email или пароль) —
      // это стандартная практика безопасности
      return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    // Создаём токен
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Возвращаем токен и безопасные данные пользователя
    // (password_hash не отправляем!)
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;