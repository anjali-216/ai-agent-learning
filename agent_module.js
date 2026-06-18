require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { QdrantClient } = require("@qdrant/js-client-rest");
const googleIt = require('google-it');
const path = require('path');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const qdrant = new QdrantClient({ url: "http://localhost:6333" });

// ==========================================
// TOOL LOGIC
// ==========================================

async function search_knowledge_base(query) {
    console.log(`[AGENT TOOL] Finding info in PDFs for: "${query}"`);
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await model.embedContent(query);
    const vector = result.embedding.values;
    const searchResults = await qdrant.search("documents", { vector, limit: 3 });
    return searchResults.map(res => res.payload.text).join("\n\n");
}

async function search_the_web({ query }) {
    console.log(`[AGENT TOOL] Searching the Internet for: "${query}"`);
    try {
        const results = await googleIt({ query });
        return results.slice(0, 3).map(res => `Title: ${res.title}\nLink: ${res.link}\nSnippet: ${res.snippet}`).join("\n\n");
    } catch (err) {
        return "Search Error: Could not reach the internet.";
    }
}

async function calculate({ expression }) {
    console.log(`[AGENT TOOL] Calculating: ${expression}`);
    try {
        const sanitized = expression.replace(/[^-()\d/*+.]/g, '');
        return eval(sanitized).toString();
    } catch { return "Math Error."; }
}

async function get_current_time() {
    return new Date().toLocaleString();
}

async function save_to_file({ filename, content }) {
    console.log(`[AGENT TOOL] Saving research to: ${filename}`);
    try {
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

        fs.writeFileSync(path.join(outputDir, filename), content);
        return `Successfully saved content to output/${filename}.`;
    } catch (err) {
        return `Error saving file: ${err.message}`;
    }
}

const tools = {
    search_knowledge_base: async ({ query }) => await search_knowledge_base(query),
    search_the_web: async ({ query }) => await search_the_web({ query }),
    calculate: async ({ expression }) => await calculate({ expression }),
    get_current_time: async () => await get_current_time(),
    save_to_file: async ({ filename, content }) => await save_to_file({ filename, content }),
};

const FALLBACK_MODELS = [
    "gemma-4-31b-it",
    "gemma-4-26b-a4b-it",
    "gemini-flash-latest",
    "gemini-pro-latest"
];

async function runAgent(userInput, history = []) {
    let lastError;

    for (const modelName of FALLBACK_MODELS) {
        try {
            console.log(`[AGENT] Attempting chat with ${modelName}...`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                tools: [{
                    functionDeclarations: [
                        { name: "search_knowledge_base", description: "Search Libertum docs for facts.", parameters: { type: "OBJECT", properties: { query: { type: "string" } }, required: ["query"] } },
                        { name: "search_the_web", description: "Search the real-time internet for latest news, prices, or general info.", parameters: { type: "OBJECT", properties: { query: { type: "string" } }, required: ["query"] } },
                        { name: "calculate", description: "Perform math.", parameters: { type: "OBJECT", properties: { expression: { type: "string" } }, required: ["expression"] } },
                        {
                            name: "save_to_file",
                            description: "Save research, reports, or text to a local file for the user.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    filename: { type: "string", description: "The name of the file (e.g. 'summary.txt')" },
                                    content: { type: "string", description: "The full text content to save." }
                                },
                                required: ["filename", "content"]
                            }
                        },
                        { name: "get_current_time", description: "Get the current time." }
                    ],
                }],
            });

            const chat = model.startChat({ history });

            async function sendMessageWithRetry(msg) {
                let retries = 3;
                let waitTime = 2000;
                while (retries > 0) {
                    try {
                        const res = await chat.sendMessage(msg);
                        return res.response;
                    } catch (err) {
                        if ((err.message.includes("429") || err.message.includes("503")) && retries > 1) {
                            await new Promise(r => setTimeout(r, waitTime));
                            retries--;
                            waitTime *= 2;
                        } else { throw err; }
                    }
                }
            }

            let response = await sendMessageWithRetry(userInput);

            while (response.functionCalls()?.length > 0) {
                const calls = response.functionCalls();
                const toolResponses = [];
                for (const call of calls) {
                    const toolOutput = await tools[call.name](call.args);
                    toolResponses.push({
                        functionResponse: { name: call.name, response: { content: toolOutput } },
                    });
                }
                response = await sendMessageWithRetry(toolResponses);
            }

            return response.text();

        } catch (err) {
            console.error(`[AGENT] Model ${modelName} failed: ${err.message.substring(0, 50)}...`);
            lastError = err;
            continue;
        }
    }
    throw new Error(`All models failed. Last error: ${lastError.message}`);
}

module.exports = { runAgent };
