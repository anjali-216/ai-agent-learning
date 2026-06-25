require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { QdrantClient } = require("@qdrant/js-client-rest");
const googleIt = require('google-it');
const path = require('path');
const fs = require('fs');
const { addTask, getUserTasks } = require('./task_db');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const qdrant = new QdrantClient({ url: "http://localhost:6333" });

// ==========================================
// TOOL IMPLEMENTATIONS
// ==========================================

async function search_knowledge_base(query) {
    console.log(`[TOOL] search_knowledge_base: "${query}"`);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
        const result = await model.embedContent(query);
        const vector = result.embedding.values;
        const searchResults = await qdrant.search("documents", { vector, limit: 3 });
        if (!searchResults.length) return "No relevant documents found in the knowledge base.";
        return searchResults.map(r => r.payload?.text || "").filter(Boolean).join("\n\n---\n\n");
    } catch (e) {
        return `Knowledge base search unavailable: ${e.message}`;
    }
}

async function search_the_web({ query }) {
    console.log(`[TOOL] search_the_web: "${query}"`);
    try {
        const results = await Promise.race([
            googleIt({ query, limit: 3, disableConsole: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000))
        ]);
        if (!results || !results.length) return "No web results found.";
        return results.map(r => `**${r.title}**\n${r.snippet}\n${r.link}`).join("\n\n");
    } catch (e) {
        return `Web search failed (${e.message}). Use your existing knowledge to answer.`;
    }
}

async function calculate({ expression }) {
    try {
        const sanitized = expression.replace(/[^0-9+\-*/.()\s%]/g, '').trim();
        if (!sanitized) return "Invalid math expression.";
        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${sanitized})`)();
        if (typeof result !== 'number' || !isFinite(result)) return "Math error: result is not a valid number.";
        return String(result);
    } catch {
        return "Math error: could not evaluate expression.";
    }
}

async function get_current_time() {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + " IST";
}

async function save_to_file({ filename, content }) {
    console.log(`[TOOL] save_to_file: "${filename}"`);
    try {
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const safeName = path.basename(filename);
        fs.writeFileSync(path.join(outputDir, safeName), content, 'utf8');
        return `Saved to output/${safeName}.`;
    } catch (err) {
        return `File save failed: ${err.message}`;
    }
}

async function schedule_task({ userId = "default", title, description = "", time, priority = "medium", frequency = 1, intervalHours = 24 }) {
    console.log(`[TOOL] schedule_task: "${title}" @ ${time} [${priority}]`);
    try {
        if (!title) return "Error: task title is required.";
        if (!time) return "Error: task time is required. Please provide an ISO 8601 UTC timestamp.";
        const task = await addTask(userId, title, description, time, priority, frequency, intervalHours);
        const istTime = new Date(task.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        return `Scheduled: "${task.title}" at ${istTime} IST. Priority: ${task.priority}.`;
    } catch (err) {
        return `Schedule failed: ${err.message}`;
    }
}

async function get_schedule({ userId = "default" }) {
    console.log(`[TOOL] get_schedule for user: ${userId}`);
    try {
        const tasks = await getUserTasks(userId);
        if (!tasks.length) return "No tasks found. Schedule is empty.";
        const active = tasks.filter(t => t.status !== 'done');
        if (!active.length) return "All tasks are done. Schedule is clear.";
        return active
            .sort((a, b) => new Date(a.time) - new Date(b.time))
            .map(t => {
                const ist = new Date(t.time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                return `• [${(t.priority || 'medium').toUpperCase()}] ${t.title} — ${ist} IST (${t.status})`;
            })
            .join("\n");
    } catch (err) {
        return `Schedule fetch failed: ${err.message}`;
    }
}

async function save_user_memory({ userId = "default", memory }) {
    console.log(`[TOOL] save_user_memory: "${memory}"`);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
        const result = await model.embedContent(memory);
        const vector = result.embedding.values;
        await qdrant.upsert("user_memories", {
            wait: true,
            points: [{
                id: Date.now() + Math.floor(Math.random() * 999),
                vector,
                payload: { userId, memory }
            }]
        });
        return `Remembered: "${memory}"`;
    } catch (err) {
        return `Memory save failed: ${err.message}`;
    }
}

async function search_user_memory({ userId = "default", query }) {
    console.log(`[TOOL] search_user_memory: "${query}"`);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
        const result = await model.embedContent(query);
        const vector = result.embedding.values;
        const searchResults = await qdrant.search("user_memories", {
            vector,
            limit: 5,
            filter: { must: [{ key: "userId", match: { value: userId } }] }
        });
        if (!searchResults.length) return "No relevant memories found.";
        return searchResults.map(res => `- ${res.payload.memory || res.payload.text}`).join("\n");
    } catch (err) {
        return `Memory search failed: ${err.message}`;
    }
}

const TOOLS = {
    search_knowledge_base: async ({ query }) => await search_knowledge_base(query),
    search_the_web: async ({ query }) => await search_the_web({ query }),
    calculate: async ({ expression }) => await calculate({ expression }),
    get_current_time: async () => await get_current_time(),
    save_to_file: async ({ filename, content }) => await save_to_file({ filename, content }),
    schedule_task: async (args) => await schedule_task(args),
    get_schedule: async (args) => await get_schedule(args),
    save_user_memory: async (args) => await save_user_memory(args),
    search_user_memory: async (args) => await search_user_memory(args),
};

// ==========================================
// MODEL CONFIG — confirmed working models
// ==========================================

// gemini-2.5-flash-lite is the confirmed primary. Others are fallbacks if rate limit clears.
// gemini-1.5-x models return 404 for this API key — removed entirely.
const MODEL_PRIORITY = [
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-pro",
];

const SYSTEM_INSTRUCTION = () => {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    return `# NEXUS — STRATEGIC LIFE OPERATING SYSTEM

CURRENT TIME (IST): ${now}

## WHO YOU ARE
You are Nexus — a personal Strategic Life OS. Not a chatbot. Not a secretary. A highly intelligent advisor who protects the user's time, health, and goals.

## USER PROFILE
- User ID: "default" (ALWAYS use this exact string for schedule_task, get_schedule, save_user_memory, search_user_memory)
- If the user tells you their name or any personal details, immediately use save_user_memory to store it.
- Before answering questions about the user's preferences/health/goals, always call search_user_memory first.

## SCHEDULING RULES (CRITICAL)
- userId is ALWAYS "default" — never use a name as userId.
- Times the user says (e.g. "2 PM", "14:30", "in 20 minutes") are in IST (UTC+5:30).
- You MUST convert IST → UTC before calling schedule_task. IST = UTC + 5 hours 30 minutes.
  - Example: "5 PM IST" → subtract 5h30m → pass "T11:30:00.000Z"
  - Example: "10:38 AM IST" → subtract 5h30m → pass "T05:08:00.000Z"
- Always call get_schedule before scheduling to check for conflicts.
- After scheduling, confirm: title, IST time, and priority.

## TASK DESCRIPTIONS (CRITICAL — always write a rich description)
When calling schedule_task, the "description" field is a Strategic Briefing shown to the user as their preparation guide. Never leave it blank or write one line. Write 4-6 sentences covering:
- Why this task matters and what the goal is
- How to prepare: what to review, bring, or do beforehand
- Suggested attire if it's a physical event (gym → athletic wear; meeting → business casual; outing → comfortable/weather-appropriate)
- Any conflict or scheduling note
- One sharp execution tip that makes this more effective
Sound like a knowledgeable human advisor, not a robot. The user reads this right before the task.

## PRIORITIES
Evaluate all tasks on: Health > Wealth > Career > Relationships > Social/Leisure.
Categorize as: HIGH (critical/health/deadline), MEDIUM (standard work), LOW (flexible/social).

## RESPONSE STYLE
- Match the user's tone: casual = short casual reply, complex request = thorough response.
- Be direct. No corporate fluff. No motivational clichés.
- Simple questions deserve simple answers (1-3 sentences max).
- Health/lifestyle questions: practical, actionable, tailored to what you know about the user.

## RESPONSE FORMAT (CRITICAL — follow exactly)
- Write in natural flowing prose like a smart friend texting you. NOT a report. NOT a document.
- NEVER use markdown headers (##, ###, ####) in chat replies. Never.
- Bold (**text**) ONLY for: task names, specific times, key numbers. Not general emphasis.
- Use bullet points ONLY when listing 3 or more truly distinct items. Never for 1-2 items.
- Scheduling confirmation: one clean line — "Done — **{title}** locked in at **{time} IST**. Priority: {level}."
- For detailed answers: 2-3 short paragraphs separated by blank lines. No headers, no sub-sections.
- NEVER start a reply with "Certainly!", "Sure!", "Of course!", "Great!" or any filler phrase.

## TECHNICAL RULE
ALWAYS wrap your final reply in <final_reply></final_reply> tags.
Never include internal reasoning, thoughts, or meta-text in the final reply.`;
};

const TOOL_DECLARATIONS = [
    {
        name: "search_knowledge_base",
        description: "Search the user's uploaded documents and PDFs for specific information.",
        parameters: {
            type: "OBJECT",
            properties: { query: { type: "STRING", description: "Search query" } },
            required: ["query"]
        }
    },
    {
        name: "search_the_web",
        description: "Search the internet for current facts, news, or information you're not certain about.",
        parameters: {
            type: "OBJECT",
            properties: { query: { type: "STRING", description: "Web search query" } },
            required: ["query"]
        }
    },
    {
        name: "calculate",
        description: "Evaluate a mathematical expression and return the result.",
        parameters: {
            type: "OBJECT",
            properties: { expression: { type: "STRING", description: "Math expression e.g. '(150 * 0.15) + 200'" } },
            required: ["expression"]
        }
    },
    {
        name: "get_current_time",
        description: "Get the current date and time in IST."
    },
    {
        name: "save_to_file",
        description: "Save research, a report, or notes to a local file.",
        parameters: {
            type: "OBJECT",
            properties: {
                filename: { type: "STRING", description: "File name e.g. 'report.txt'" },
                content: { type: "STRING", description: "Full content to write" }
            },
            required: ["filename", "content"]
        }
    },
    {
        name: "schedule_task",
        description: "Schedule a task or reminder for the user. userId must always be 'default'. Time must be ISO 8601 UTC.",
        parameters: {
            type: "OBJECT",
            properties: {
                userId: { type: "STRING", description: "Always use the string 'default'" },
                title: { type: "STRING", description: "Short task title" },
                description: { type: "STRING", description: "Strategic briefing or details about the task" },
                time: { type: "STRING", description: "ISO 8601 UTC timestamp e.g. '2026-06-25T08:30:00.000Z'" },
                priority: { type: "STRING", enum: ["low", "medium", "high"], description: "Task priority" },
                frequency: { type: "NUMBER", description: "How many times to repeat (default 1)" },
                intervalHours: { type: "NUMBER", description: "Hours between repeats (default 24)" }
            },
            required: ["userId", "title", "time", "priority"]
        }
    },
    {
        name: "get_schedule",
        description: "Fetch the user's upcoming tasks and events. Always check this before scheduling.",
        parameters: {
            type: "OBJECT",
            properties: { userId: { type: "STRING", description: "Always use 'default'" } },
            required: ["userId"]
        }
    },
    {
        name: "save_user_memory",
        description: "Permanently save a fact about the user (name, preference, allergy, health condition, goal). Use this whenever the user shares personal info.",
        parameters: {
            type: "OBJECT",
            properties: {
                userId: { type: "STRING", description: "Always use 'default'" },
                memory: { type: "STRING", description: "Clear factual statement e.g. \"User's name is Anjali\" or \"User prefers dark roast coffee\" or \"User has a sensitive left knee\"" }
            },
            required: ["userId", "memory"]
        }
    },
    {
        name: "search_user_memory",
        description: "Recall previously saved facts about the user. Use before answering questions about preferences, health, or personal context.",
        parameters: {
            type: "OBJECT",
            properties: {
                userId: { type: "STRING", description: "Always use 'default'" },
                query: { type: "STRING", description: "What to look up e.g. 'coffee preference' or 'health conditions' or 'user name'" }
            },
            required: ["userId", "query"]
        }
    }
];

// ==========================================
// CORE AGENT ENGINE
// ==========================================

function isRateLimitError(message) {
    return message.includes("429") || message.includes("503") || message.includes("RESOURCE_EXHAUSTED") || message.includes("quota");
}

function isModelNotFoundError(message) {
    return message.includes("404") || message.includes("not found") || message.includes("invalid") || message.includes("does not exist");
}

async function tryModel(modelName, userInput, history, onStatus) {
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION(),
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
    });

    const chat = model.startChat({ history: history || [] });
    const res = await chat.sendMessage(userInput);
    let response = res.response;

    // Tool-call loop (max 6 iterations to prevent runaway loops)
    let loopCount = 0;
    while (response.functionCalls()?.length > 0 && loopCount < 6) {
        loopCount++;
        const calls = response.functionCalls();
        const toolResponses = [];

        for (const call of calls) {
            if (onStatus) onStatus({ type: 'status', message: `Running: ${call.name.replace(/_/g, ' ')}...` });
            console.log(`[TOOL CALL] ${call.name}(${JSON.stringify(call.args).substring(0, 120)})`);

            let output;
            try {
                const handler = TOOLS[call.name];
                if (handler) {
                    output = await handler(call.args);
                } else {
                    output = `Unknown tool requested: ${call.name}`;
                }
            } catch (e) {
                output = `Tool "${call.name}" encountered an error: ${e.message}`;
                console.error(`[TOOL ERROR] ${call.name}:`, e.message);
            }

            console.log(`[TOOL RESULT] ${call.name} → ${String(output).substring(0, 120)}`);
            toolResponses.push({
                functionResponse: { name: call.name, response: { content: String(output) } }
            });
        }

        const followUp = await chat.sendMessage(toolResponses);
        response = followUp.response;
    }

    const text = response.text();
    if (!text || text.trim().length < 2) throw new Error("Empty response from model");
    return text;
}

async function runAgent(userInput, history = [], onStatus) {
    let lastError;

    for (const modelName of MODEL_PRIORITY) {
        try {
            console.log(`[AGENT] Trying: ${modelName}`);
            const result = await tryModel(modelName, userInput, history, onStatus);
            console.log(`[AGENT] Success: ${modelName}`);
            return result;
        } catch (err) {
            lastError = err;
            const msg = err.message || "";

            if (isModelNotFoundError(msg)) {
                console.log(`[AGENT] ${modelName}: model unavailable, skipping.`);
                continue;
            }
            if (isRateLimitError(msg)) {
                console.log(`[AGENT] ${modelName}: rate-limited, trying next after 800ms...`);
                await new Promise(r => setTimeout(r, 800));
                continue;
            }
            // Other errors (network, etc.) — still try next model
            console.log(`[AGENT] ${modelName}: error (${msg.substring(0, 80)}), trying next...`);
        }
    }

    throw new Error(`All models failed. Last error: ${lastError?.message || "unknown"}`);
}

// Lightweight agent for simple text generation (no tools, no system prompt overhead)
async function runAgentSimple(userInput) {
    const lightModels = ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.0-flash-lite"];
    for (const modelName of lightModels) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(userInput);
            return result.response.text();
        } catch (err) {
            console.log(`[AGENT-SIMPLE] ${modelName} failed: ${err.message.substring(0, 60)}`);
        }
    }
    throw new Error("Simple Agent: all models exhausted.");
}

module.exports = { runAgent, runAgentSimple };
