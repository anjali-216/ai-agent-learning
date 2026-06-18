const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'chat_history.json');

/**
 * Initialize (Create file if it doesn't exist)
 */
async function initDB() {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    console.log("✅ Pure-JS File Database initialized (chat_history.json)");
    return true;
}

/**
 * Save a message
 */
async function saveMessage(sessionId, role, text) {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8') || '{}');
    if (!data[sessionId]) data[sessionId] = [];

    data[sessionId].push({ role, text });

    // Keep last 20
    if (data[sessionId].length > 20) data[sessionId].shift();

    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

/**
 * Get History
 */
async function getHistory(sessionId) {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8') || '{}');
    const rows = data[sessionId] || [];

    return rows.map(row => ({
        role: row.role === 'user' ? 'user' : 'model',
        parts: [{ text: row.text }]
    }));
}

module.exports = { initDB, saveMessage, getHistory };
