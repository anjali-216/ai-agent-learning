const fs = require('fs');
const path = require('path');

const tasksPath = path.join(__dirname, 'tasks.json');

async function initTaskDB() {
    if (!fs.existsSync(tasksPath)) {
        fs.writeFileSync(tasksPath, JSON.stringify({}));
    }
    console.log("✅ Tasks Database initialized (tasks.json)");
    return true;
}

async function addTask(userId, title, description, time, priority = 'medium', frequency = 1, intervalHours = 24, category = 'general') {
    const data = JSON.parse(fs.readFileSync(tasksPath, 'utf8') || '{}');
    if (!data[userId]) data[userId] = [];

    const newTask = {
        id: Date.now().toString(),
        title,
        description,
        time,
        status: 'pending',
        priority,
        frequency,
        remaining: frequency,
        intervalHours,
        category
    };
    data[userId].push(newTask);
    fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2));
    return newTask;
}

async function getUserTasks(userId) {
    if (!fs.existsSync(tasksPath)) return [];
    const data = JSON.parse(fs.readFileSync(tasksPath, 'utf8') || '{}');
    return data[userId] || [];
}

module.exports = { initTaskDB, addTask, getUserTasks };
