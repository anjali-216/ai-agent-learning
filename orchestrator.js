require("dotenv").config();
const { runAgent } = require("./agent_module");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const logPath = path.join(__dirname, 'agent_logs.txt');

function logToFile(msg) {
    const timestamp = new Date().toLocaleString();
    const formattedMsg = `[${timestamp}] ${msg}\n`;
    fs.appendFileSync(logPath, formattedMsg);
    console.log(msg);
}

/**
 * The CRITIC: No tools, just logic.
 */
async function runCritic(userQuery, researcherAnswer, onStatus) {
    onStatus && onStatus({ type: 'status', message: 'Critic is auditing the researcher...' });
    logToFile("[CRITIC] Reviewing the Researcher's work...");
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
        You are a Senior Quality Auditor. 
        USER REQUEST: "${userQuery}"
        RESEARCHER DRAFT: "${researcherAnswer}"
        
        If the answer is GOOD, start your response with "APPROVED".
        If it's BAD, start with "REDO" and explain why.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

/**
 * THE ORCHESTRATOR: Now supports Status Callbacks for Streaming
 */
async function runCollaborativeChat(userQuery, history = [], onStatus) {
    logToFile(`\n--- NEW REQUEST: ${userQuery} ---`);

    // 1. Initial Status
    onStatus && onStatus({ type: 'status', message: 'Researcher is searching docs and the web...' });

    logToFile("[ORCHESTRATOR] Calling Researcher...");
    let currentAnswer = await runAgent(userQuery, history);

    let rounds = 1;
    while (rounds <= 2) {
        const critique = await runCritic(userQuery, currentAnswer, onStatus);

        if (critique.trim().startsWith("APPROVED")) {
            logToFile("[ORCHESTRATOR] Quality Check Passed!");
            onStatus && onStatus({ type: 'status', message: 'Quality check passed! Finalizing answer...' });
            return currentAnswer;
        } else {
            logToFile(`[ORCHESTRATOR] Quality Check Failed (Round ${rounds}).`);
            onStatus && onStatus({ type: 'status', message: `Critic found issues. Researcher is fixing (Round ${rounds})...` });

            const redoPrompt = `My previous attempt was: ${currentAnswer}\n\nFeedback from Auditor: ${critique}\n\nPlease fix the answer based on this feedback.`;
            currentAnswer = await runAgent(redoPrompt, history);
            rounds++;
        }
    }

    return currentAnswer;
}

module.exports = { runCollaborativeChat };
