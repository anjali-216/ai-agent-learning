require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const { runCollaborativeChat } = require("./orchestrator");
const { runAgent, runAgentSimple } = require("./agent_module");
const { initDB, saveMessage, getHistory } = require("./db");
const { initTaskDB, addTask, getUserTasks } = require("./task_db");
const { startProactiveEngine } = require("./proactive_engine");

const app = express();
app.use(cors());
app.use(express.json());

initDB().catch(err => console.error("DB init failed:", err));
initTaskDB().catch(err => console.error("Task DB init failed:", err));

// ── PUSH NOTIFICATION (SSE) ───────────────────────────────────────────────────
const notificationClients = new Set();

app.get("/notifications", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    notificationClients.add(res);
    console.log(`[PUSH] Client connected (${notificationClients.size} total)`);

    const hb = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'hb' })}\n\n`);
    }, 20000);

    req.on('close', () => {
        clearInterval(hb);
        notificationClients.delete(res);
    });
});

global.broadcastNotification = (payload) => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of notificationClients) {
        try { client.write(data); } catch { /* client disconnected */ }
    }
};

// ── STATIC FILES ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.static(__dirname));

// ── CHAT (streaming SSE) ──────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
    const { message, sessionId = "default" } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ error: "message is required" });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        const history = await getHistory(sessionId);

        const finalAnswer = await runCollaborativeChat(message, history, (status) => {
            sendEvent(status);
        });

        await saveMessage(sessionId, 'user', message);
        await saveMessage(sessionId, 'model', finalAnswer);

        sendEvent({ type: 'final', answer: finalAnswer });
        res.end();
    } catch (error) {
        console.error("[CHAT ERROR]", error.message);
        sendEvent({ type: 'error', message: "I ran into an issue. Please try again." });
        res.end();
    }
});

// ── TASK API ──────────────────────────────────────────────────────────────────
const tasksFilePath = path.join(__dirname, "tasks.json");

app.get("/api/tasks/:userId", async (req, res) => {
    try {
        const tasks = await getUserTasks(req.params.userId);
        res.json({ tasks });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Parse an IST date string produced by the AI and return a UTC ISO string.
// The AI is instructed to produce "YYYY-MM-DD HH:MM AM/PM IST" format.
function parseIstToUtc(istStr) {
    if (!istStr) return null;
    try {
        const clean = istStr.trim()
            .replace(/\bIST\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Convert "HH:MM AM/PM" → 24-hour
        const ampmMatch = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (ampmMatch) {
            const [, datePart, h, m, period] = ampmMatch;
            let hours = parseInt(h, 10);
            if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
            if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
            const iso24 = `${datePart}T${String(hours).padStart(2, '0')}:${m}:00+05:30`;
            const d = new Date(iso24);
            return isNaN(d) ? null : d.toISOString();
        }

        // "YYYY-MM-DD HH:MM" — assume 24-hour IST
        const h24Match = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})$/);
        if (h24Match) {
            const [, datePart, h, m] = h24Match;
            const iso = `${datePart}T${h}:${m}:00+05:30`;
            const d = new Date(iso);
            return isNaN(d) ? null : d.toISOString();
        }

        // Fallback: try native Date parse — may not be accurate but better than nothing
        const d = new Date(clean);
        return isNaN(d) ? null : d.toISOString();
    } catch {
        return null;
    }
}

async function enrichTask(title, description, time, existingSchedule = "") {
    const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const hasTime = !!time;
    const istTime = hasTime
        ? new Date(time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : 'NOT PROVIDED — you must suggest one';

    const prompt = `[SYSTEM] You are Nexus — a Strategic Life OS. You think like a high-performance executive coach.
Current Time: ${ist} IST
Task: "${title}"
Extra Details: "${description || 'None provided'}"
Scheduled Time: ${istTime}
Existing Schedule:
${existingSchedule || 'None'}

[YOUR JOB]
Write a rich, natural strategic briefing for this task. Think about what a sharp personal advisor would tell you before this event. Cover what's actually useful — attire, preparation, mindset, what to bring, conflicts, tips. Skip anything that doesn't apply. Sound human, not robotic.

Structure your briefing naturally — no rigid headers, just flowing practical advice in 4-6 sentences. Include:
- What this task is and why it matters strategically
- How to prepare (what to review, bring, do beforehand)
- Suggested attire if relevant (meetings, gym, outings, classes, etc.)
- Any conflict with the existing schedule, or if the slot is clear
- One sharp tip that makes this session more effective
${!hasTime ? '- Recommend a specific time slot (explain briefly why that slot works)' : ''}

Then output priority and time on separate lines.

Output ONLY this format:
BRIEFING: <your natural flowing briefing here>
PRIORITY: <HIGH|MEDIUM|LOW>
TIME_IST: <YYYY-MM-DD HH:MM AM/PM>`;

    const result = await runAgent(prompt);
    return result;
}

// ── CONFLICT PREVIEW ─────────────────────────────────────────────────────────
// Rule-based fallback: find the next 2-hour slot that's clear of all pending tasks.
// Used when AI is unavailable — always returns a valid time.
function findNextClearSlot(fromTime, pending) {
    let candidate = new Date(fromTime.getTime() + 2 * 60 * 60 * 1000); // start 2h after conflict
    for (let attempts = 0; attempts < 12; attempts++) {
        const blocked = pending.some(t => {
            const diff = Math.abs(new Date(t.time) - candidate) / 60000;
            return diff < 90;
        });
        if (!blocked) return candidate;
        candidate = new Date(candidate.getTime() + 2 * 60 * 60 * 1000);
    }
    // Last resort: same time tomorrow
    return new Date(fromTime.getTime() + 24 * 60 * 60 * 1000);
}

// Detects scheduling conflicts. Always returns a suggested alternative — AI if available, rule-based otherwise.
app.post("/api/tasks/preview", async (req, res) => {
    const { userId = "default", title, time } = req.body;
    if (!title || !time) return res.json({ conflict: false });

    let existing = [];
    try { existing = await getUserTasks(userId); } catch { /* ignore */ }
    const pending = existing.filter(t => t.status === 'pending' || t.status === 'reminded');

    // Conflict = any existing task within a 90-minute window
    const requested = new Date(time);
    const conflict = pending.find(t => {
        const diff = Math.abs(new Date(t.time) - requested) / 60000;
        return diff < 90;
    });

    if (!conflict) return res.json({ conflict: false });

    const conflictIST = new Date(conflict.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const requestedIST = requested.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Rule-based suggestion — always available, no AI required
    const ruleBasedSlot = findNextClearSlot(new Date(conflict.time), pending);
    const ruleBasedIST = ruleBasedSlot.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const baseResponse = {
        conflict: true,
        conflictWith: conflict.title,
        conflictTime: conflictIST,
        suggestion: `"${conflict.title}" is at ${conflictIST}, so that slot's taken. How about ${ruleBasedIST} instead — that window is clear.`,
        suggestedTime: ruleBasedSlot.toISOString(),
        suggestedTimeIST: ruleBasedIST,
    };

    // Try AI suggestion — replaces rule-based if successful (5s max)
    try {
        const scheduleStr = pending
            .map(t => `- "${t.title}" at ${new Date(t.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`)
            .join("\n");

        const prompt = `Current time: ${nowIST} IST
User wants to schedule: "${title}" at ${requestedIST} IST
CONFLICT: "${conflict.title}" is already at ${conflictIST} IST

Existing schedule:
${scheduleStr}

Suggest ONE clear alternative time for "${title}" today or tomorrow that avoids all conflicts.

Reply ONLY in this exact format, no other text:
SUGGESTION: <one casual sentence — name the conflict time, then why the new slot works>
ALT_TIME_IST: <YYYY-MM-DD HH:MM AM/PM>`;

        const aiResponse = await Promise.race([
            runAgentSimple(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
        ]);

        const suggestionMatch = aiResponse.match(/SUGGESTION:\s*([\s\S]*?)(?=\nALT_TIME_IST:|$)/i);
        const altTimeMatch = aiResponse.match(/ALT_TIME_IST:\s*([^\n]+)/i);

        // Only override rule-based if AI gives a parseable, valid time
        if (altTimeMatch) {
            const aiTime = parseIstToUtc(altTimeMatch[1].trim());
            if (aiTime) {
                baseResponse.suggestedTime = aiTime;
                baseResponse.suggestedTimeIST = altTimeMatch[1].trim();
                if (suggestionMatch) baseResponse.suggestion = suggestionMatch[1].trim();
            }
        }
    } catch (e) {
        console.warn("[PREVIEW] AI unavailable, using rule-based slot:", ruleBasedIST);
    }

    res.json(baseResponse);
});

app.post("/api/tasks", async (req, res) => {
    try {
        const { userId = "default", title, description, time, category = "general", frequency = 1 } = req.body;
        if (!title) return res.status(400).json({ error: "title is required" });

        // Build conflict-awareness context
        const existing = await getUserTasks(userId);
        const scheduleStr = existing
            .filter(t => t.status === 'pending')
            .map(t => `- ${t.title} at ${new Date(t.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`)
            .join("\n");

        console.log(`[TASKS] Enriching: "${title}"...`);
        const enrichment = await enrichTask(title, description || "", time, scheduleStr);

        // Parse structured response
        const briefingMatch = enrichment.match(/BRIEFING:\s*([\s\S]*?)(?=\nPRIORITY:|$)/i);
        const priorityMatch = enrichment.match(/PRIORITY:\s*(HIGH|MEDIUM|LOW)/i);
        const timeMatch = enrichment.match(/TIME_IST:\s*([\d\w/ :,-]+)/i);

        const briefing = briefingMatch ? briefingMatch[1].trim() : (description || "No briefing available.");
        const priority = priorityMatch ? priorityMatch[1].toLowerCase() : "medium";

        let finalTime = time;
        if (!finalTime && timeMatch) {
            finalTime = parseIstToUtc(timeMatch[1]);
        }
        if (!finalTime) finalTime = new Date().toISOString();

        console.log(`[TASKS] Scheduled: "${title}" @ ${finalTime} [${priority}]`);
        const task = await addTask(userId, title, briefing, finalTime, priority, frequency, 24, category);
        res.json({ task });
    } catch (e) {
        console.error("[TASKS ERROR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.patch("/api/tasks/:userId/:taskId/status", (req, res) => {
    try {
        const { userId, taskId } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: "status is required" });

        const data = JSON.parse(fs.readFileSync(tasksFilePath, "utf8") || "{}");
        const task = (data[userId] || []).find(t => t.id === taskId);
        if (!task) return res.status(404).json({ error: "Task not found" });

        task.status = status;
        fs.writeFileSync(tasksFilePath, JSON.stringify(data, null, 2));
        res.json({ task });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete("/api/tasks/:userId/:taskId", (req, res) => {
    try {
        const { userId, taskId } = req.params;
        const data = JSON.parse(fs.readFileSync(tasksFilePath, "utf8") || "{}");
        if (data[userId]) {
            data[userId] = data[userId].filter(t => t.id !== taskId);
            fs.writeFileSync(tasksFilePath, JSON.stringify(data, null, 2));
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── START SERVER ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Nexus AI running on http://localhost:${PORT}\n`);
    startProactiveEngine();
});
