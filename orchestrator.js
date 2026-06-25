require("dotenv").config();
const { runAgent } = require("./agent_module");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const logPath = path.join(__dirname, 'agent_logs.txt');

function logToFile(msg) {
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const line = `[${timestamp}] ${msg}\n`;
    fs.appendFileSync(logPath, line);
    console.log(msg);
}

// ── CRITIC MODELS ─────────────────────────────────────────────────────────────
// Use lightweight models for the critic so they don't compete with the main agent
// for quota on the same heavy models.
const CRITIC_MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
];

// Only audit genuinely complex research/analysis queries.
// Simple scheduling/greeting/conversational queries skip the critic entirely.
function needsAudit(query) {
    if (query.trim().length < 30) return false;
    return /\b(research|analyze|analyse|audit|compare|evaluate|explain in detail|comprehensive|detailed report|what is|who is|how does)\b/i.test(query);
}

async function runCritic(userQuery, researcherAnswer, onStatus) {
    if (!needsAudit(userQuery)) {
        logToFile("[CRITIC] Fast-Pass — simple query, no audit needed.");
        return "APPROVED";
    }

    onStatus?.({ type: 'status', message: 'Verifying answer...' });
    logToFile("[CRITIC] Auditing response quality...");

    const auditPrompt = `You are a quality reviewer. Quickly check this AI response.

USER QUESTION: "${userQuery.substring(0, 200)}"

AI RESPONSE: "${researcherAnswer.substring(0, 600)}"

Verdict (reply ONLY with one of these):
- "APPROVED" — if the response is accurate and answers the question
- "REDO: [one line reason]" — ONLY if the response is clearly wrong or dangerous

Default to APPROVED if uncertain. Be concise.`;

    // Race: first working critic model wins, with a hard 5-second total timeout
    return await Promise.race([
        (async () => {
            for (const modelName of CRITIC_MODELS) {
                try {
                    const model = genAI.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent(auditPrompt);
                    const verdict = result.response.text().trim();
                    logToFile(`[CRITIC] ${modelName} → ${verdict.substring(0, 60)}`);
                    return verdict;
                } catch (err) {
                    logToFile(`[CRITIC] ${modelName} failed: ${err.message.substring(0, 60)}`);
                }
            }
            logToFile("[CRITIC] All models unavailable — auto-approving.");
            return "APPROVED";
        })(),
        new Promise(resolve => setTimeout(() => {
            logToFile("[CRITIC] Timeout (5s) — auto-approving.");
            resolve("APPROVED");
        }, 5000))
    ]);
}

// ── MEMORY RECALL ─────────────────────────────────────────────────────────────
async function recallMemories(userQuery) {
    try {
        const { QdrantClient } = require("@qdrant/js-client-rest");
        const qClient = new QdrantClient({ url: "http://localhost:6333" });

        const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
        const emb = await Promise.race([
            embedModel.embedContent(userQuery),
            new Promise((_, reject) => setTimeout(() => reject(new Error("embed timeout")), 4000))
        ]);

        const vector = emb.embedding.values;
        const memories = await qClient.search("user_memories", { vector, limit: 4 });
        if (!memories.length) return null;

        logToFile(`[MEMORY] Found ${memories.length} relevant memories.`);
        return memories.map(m => `- ${m.payload.memory}`).join("\n");
    } catch (e) {
        logToFile(`[MEMORY] Skipped: ${e.message}`);
        return null;
    }
}

// ── RESPONSE CLEANER ──────────────────────────────────────────────────────────
function extractFinalReply(rawText) {
    if (!rawText) return "I encountered an issue generating a response. Please try again.";

    // Extract <final_reply> block if present
    const tagMatch = rawText.match(/<final_reply>([\s\S]*?)<\/final_reply>/i);
    if (tagMatch) return tagMatch[1].trim();

    // Strip known meta-text prefixes the model might leak
    let cleaned = rawText
        .replace(/<\/?final_reply>/gi, '')
        .replace(/^(Nexus|Assistant|Researcher|Final\s+Response|Self-Correction|Correction|Thoughts|Plan|OK)\s*:\s*/gim, '')
        .trim();

    // If there are multiple paragraph blocks with meta-text, take the last clean paragraph
    if (/\b(Self-Correction|Researcher:|Thoughts:|Plan:)\b/.test(cleaned)) {
        const blocks = cleaned.split(/\n{2,}/);
        cleaned = blocks[blocks.length - 1].trim();
    }

    return cleaned || "I was unable to generate a response. Please rephrase your question.";
}

// ── MAIN ORCHESTRATOR ─────────────────────────────────────────────────────────
async function runCollaborativeChat(userQuery, history = [], onStatus) {
    logToFile(`\n--- REQUEST: ${userQuery.substring(0, 100)} ---`);

    // Step 1: Recall personal context from vector memory
    onStatus?.({ type: 'status', message: 'Recalling your context...' });
    const memoryContext = await recallMemories(userQuery);

    // Step 2: Build enriched input with context
    const enrichedQuery = memoryContext
        ? `[WHAT I REMEMBER ABOUT YOU]\n${memoryContext}\n\n[YOUR MESSAGE]\n${userQuery}`
        : userQuery;

    // Step 3: Run the main agent
    onStatus?.({ type: 'status', message: 'Thinking...' });
    logToFile("[ORCHESTRATOR] Running main agent...");

    let currentAnswer = await runAgent(enrichedQuery, history, onStatus);

    // Step 4: Critic quality gate (only for complex queries)
    const critique = await runCritic(userQuery, currentAnswer, onStatus);

    if (!critique.trim().startsWith("APPROVED")) {
        logToFile(`[ORCHESTRATOR] Critic flagged an issue. Re-running with feedback...`);
        onStatus?.({ type: 'status', message: 'Refining answer...' });

        const fixPrompt = `Your previous response had a quality issue. Please fix it.

ORIGINAL USER REQUEST: "${userQuery}"
YOUR PREVIOUS ANSWER: "${currentAnswer.substring(0, 500)}"
QUALITY ISSUE DETECTED: "${critique}"

Write a corrected, accurate response. Wrap it in <final_reply></final_reply> tags.`;

        currentAnswer = await runAgent(fixPrompt, history, onStatus);
        logToFile("[ORCHESTRATOR] Re-run complete.");
    } else {
        logToFile("[ORCHESTRATOR] Quality check passed.");
    }

    onStatus?.({ type: 'status', message: 'Done.' });

    return extractFinalReply(currentAnswer);
}

module.exports = { runCollaborativeChat };
