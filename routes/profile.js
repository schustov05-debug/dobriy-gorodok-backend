const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {

    const result = await pool.query(
      'SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/', auth, async (req, res) => {
  const { full_name, phone } = req.body;

  if (!full_name && !phone) {
    return res.status(400).json({ error: 'Укажите хотя бы одно поле для обновления' });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone)
       WHERE id = $3
       RETURNING id, email, full_name, phone, role`,
      [full_name, phone, req.user.id]
    );


    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;