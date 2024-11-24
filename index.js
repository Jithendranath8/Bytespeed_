const express = require('express');
const bodyParser = require('body-parser');
const contactRoute = require('./routes/contactRoute');


const app = express();

// Middleware
app.use(bodyParser.json());

// Routes
app.use('/api', contactRoute);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ error: 'Something went wrong!' });
});

// Start Server
const PORT = process.env.DB_PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
