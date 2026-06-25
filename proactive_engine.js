const fs = require('fs');
const path = require('path');
const { runAgentSimple } = require('./agent_module');
const { saveMessage } = require('./db');

const tasksPath = path.join(__dirname, 'tasks.json');

// How far ahead to look for upcoming tasks (2 minutes)
const LOOKAHEAD_MS = 2 * 60 * 1000;
// Grace window for tasks that just passed (1 minute — catches exact-time matches)
const GRACE_MS = 60 * 1000;
// Minimum gap between notifications for the same task (10 minutes)
const RENOTIFY_GAP_MS = 10 * 60 * 1000;
// Auto-archive tasks older than this without notifying
const STALE_TASK_MS = 30 * 60 * 1000;

async function checkUpcomingTasks() {
    if (!fs.existsSync(tasksPath)) return;

    let data;
    try {
        data = JSON.parse(fs.readFileSync(tasksPath, 'utf8') || '{}');
    } catch {
        return;
    }

    const now = new Date();
    let changed = false;

    for (const userId of Object.keys(data)) {
        if (!Array.isArray(data[userId])) continue;

        // Auto-archive stale tasks silently (past the 30-min grace without being notified)
        for (const task of data[userId]) {
            if (task.status !== 'pending') continue;
            const taskTime = new Date(task.time);
            if (isNaN(taskTime)) continue;
            if (now - taskTime > STALE_TASK_MS) {
                task.status = 'notified';
                changed = true;
                console.log(`[PROACTIVE] Auto-archived stale task: "${task.title}" (was ${taskTime.toLocaleString()})`);
            }
        }

        // Find tasks due RIGHT NOW (within -1 min grace to +2 min lookahead)
        const dueTasks = data[userId].filter(task => {
            if (task.status !== 'pending') return false;

            // Skip if already notified recently
            if (task.lastNotified) {
                const sinceNotified = now - new Date(task.lastNotified);
                if (sinceNotified < RENOTIFY_GAP_MS) return false;
            }

            const taskTime = new Date(task.time);
            if (isNaN(taskTime)) return false;

            const msUntilTask = taskTime - now;
            // Only notify: tasks starting within the next 2 minutes OR up to 1 minute ago
            return msUntilTask >= -GRACE_MS && msUntilTask <= LOOKAHEAD_MS;
        });

        if (!dueTasks.length) continue;

        console.log(`\n⏰ [PROACTIVE] ${dueTasks.length} task(s) due now for user: ${userId}`);

        const tasksContext = dueTasks
            .map(t => `- [${(t.priority || 'medium').toUpperCase()}] ${t.title}`)
            .join("\n");

        const prompt = `Tasks starting right now:
${tasksContext}
Current Time: ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST

Write ONE short, natural reminder (1 sentence max) like a helpful friend would send on WhatsApp.
Rules:
- State what's happening and one practical action tip
- Do NOT moralize, lecture, or add unsolicited advice about health/safety/limits
- Do NOT say "As your assistant" or use formal language
- If two tasks overlap, note it and pick the higher-priority one
- Keep it under 15 words

Examples:
"Team standup in 2 mins — check your sprint board real quick."
"Gym time! Don't forget your water bottle."
"Outing starting now — grab your bag and head out."

Wrap in <reminder></reminder> tags.`;

        try {
            const aiReply = await runAgentSimple(prompt);
            const match = aiReply.match(/<reminder>([\s\S]*?)<\/reminder>/);
            const reminder = match
                ? match[1].trim()
                : dueTasks[0].title + ' is starting now.';

            console.log(`\n🔔 [PUSH]: ${reminder}\n`);

            if (global.broadcastNotification) {
                global.broadcastNotification({
                    type: 'task_reminder',
                    title: dueTasks.length > 1 ? `${dueTasks.length} tasks starting` : dueTasks[0].title,
                    message: reminder,
                    taskId: dueTasks[0].id,
                });
            }

            // Update notification state
            for (const task of dueTasks) {
                task.lastNotified = now.toISOString();

                if ((task.remaining || task.frequency || 1) > 1) {
                    task.remaining = (task.remaining || task.frequency || 1) - 1;
                    const nextTime = new Date(
                        new Date(task.time).getTime() + (task.intervalHours || 24) * 60 * 60 * 1000
                    );
                    task.time = nextTime.toISOString();
                } else {
                    task.status = 'notified'; // permanently stops future proactive checks
                }
            }

            changed = true;
            await saveMessage(userId, 'model', `[Reminder sent]: ${reminder}`).catch(() => {});

        } catch (err) {
            console.error(`[PROACTIVE] AI failed:`, err.message);

            // Fallback: plain notification, no moralizing
            const topTask = dueTasks.sort((a, b) => {
                const p = { high: 3, medium: 2, low: 1 };
                return (p[b.priority] || 2) - (p[a.priority] || 2);
            })[0];

            if (global.broadcastNotification) {
                global.broadcastNotification({
                    type: 'task_reminder',
                    title: topTask.title,
                    message: `${topTask.title} is starting now.`,
                    taskId: topTask.id,
                });
            }

            for (const t of dueTasks) {
                t.lastNotified = now.toISOString();
                t.status = 'notified';
            }
            changed = true;
        }
    }

    if (changed) {
        try {
            fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('[PROACTIVE] Failed to write tasks:', e.message);
        }
    }
}

function startProactiveEngine() {
    console.log("⏰ Proactive Engine started...");

    async function loop() {
        try {
            await checkUpcomingTasks();
        } catch (e) {
            console.error("[PROACTIVE] Loop error:", e.message);
        }
        setTimeout(loop, 60000); // check every 60 seconds
    }

    setTimeout(loop, 8000); // first check after 8s (let SSE connections establish)
}

module.exports = { startProactiveEngine };
