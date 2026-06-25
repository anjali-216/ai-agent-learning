// ============================================================
// LANGCHAIN AGENT (With Framework)
// This does the EXACT SAME THING as manual_agent.js
// but notice how much shorter and cleaner it is!
// ============================================================

require('@dotenvx/dotenvx').config({ path: require('path').join(__dirname, '../.env') });
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { tool } = require("@langchain/core/tools");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { z } = require("zod");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");

// --- STEP 1: Define Tools (Much cleaner with schema validation!) ---
const calculateTool = tool(
    async ({ expression }) => {
        console.log(`[LANGCHAIN AGENT] Tool called: calculate`);
        const sanitized = expression.replace(/[^-()\d/*+.]/g, '');
        const result = eval(sanitized).toString();
        console.log(`[LANGCHAIN AGENT] Tool result: ${result}`);
        return result;
    },
    {
        name: "calculate",
        description: "Perform math calculations.",
        schema: z.object({
            expression: z.string().describe("The math expression to evaluate.")
        })
    }
);

const getTimeTool = tool(
    async () => {
        console.log(`[LANGCHAIN AGENT] Tool called: get_current_time`);
        const result = new Date().toLocaleString();
        console.log(`[LANGCHAIN AGENT] Tool result: ${result}`);
        return result;
    },
    {
        name: "get_current_time",
        description: "Get the current time.",
        schema: z.object({})
    }
);

// LangChain needs it as GOOGLE_API_KEY
process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;

// --- STEP 2: Create the Model ---
const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
});

// --- STEP 3: Create the Agent (LangGraph handles the loop!) ---
async function runLangChainAgent(userInput) {
    console.log("\n[LANGCHAIN AGENT] Starting...");

    // LangGraph's createReactAgent handles everything automatically!
    const agent = createReactAgent({
        llm: model,
        tools: [calculateTool, getTimeTool]
    });

    const result = await agent.invoke({
        messages: [{ role: "human", content: userInput }]
    });

    return result.messages[result.messages.length - 1].content;
}

// Run it!
runLangChainAgent("What is 999 * 888? Also what is the current time?")
    .then(answer => {
        console.log("\n--- LANGCHAIN AGENT ANSWER ---");
        console.log(answer);
    })
    .catch(console.error);
