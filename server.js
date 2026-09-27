const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve all static files (HTML, JS, CSS, JSON, PNGs) from the current directory
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for any other requests
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🎲 Ladders & Fangs server is running!`);
    console.log(`👉 Open http://localhost:${PORT} in your browser to play.`);
    console.log(`(Running on localhost enables PWA installation and Service Workers)`);
});