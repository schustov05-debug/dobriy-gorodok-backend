const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const feedbackRouter = require('./routes/feedback'); 
app.use(feedbackRouter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));

app.use('/api/pets', require('./routes/pets'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/applications', require('./routes/applications'));
const articlesRouter = require('./routes/articles');
app.use('/api/articles', articlesRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер приюта «Добрый городок» запущен на порту ${PORT}`);
});