// ============================================================
// MANUAL AGENT (No Framework)
// Uses @langchain/google-genai (same SDK), but writes the
// tool loop, retry, and plumbing MANUALLY.
// Notice how much more code this needs!
// ============================================================

require('@dotenvx/dotenvx').config({ path: require('path').join(__dirname, '../.env') });
process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY; // LangChain needs this name
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { HumanMessage, AIMessage, ToolMessage } = require("@langchain/core/messages");
const { z } = require("zod");

// --- TOOL LOGIC (You write this manually) ---
function calculate(expression) {
    const sanitized = expression.replace(/[^-()\d/*+.]/g, '');
    return eval(sanitized).toString();
}

function get_current_time() {
    return new Date().toLocaleString();
}

const TOOLS_SCHEMA = [
    {
        name: "calculate",
        description: "Perform math calculations.",
        schema: z.object({ expression: z.string() })
    },
    {
        name: "get_current_time",
        description: "Get the current time.",
        schema: z.object({})
    }
];

// Map function names to actual functions
const toolMap = {
    calculate: ({ expression }) => calculate(expression),
    get_current_time: () => get_current_time(),
};

// --- AGENT LOOP (You write this manually) ---
async function runManualAgent(userInput) {
    console.log("\n[MANUAL AGENT] Starting...");

    const model = new ChatGoogleGenerativeAI({
        model: "gemini-1.5-flash",
        apiKey: process.env.GEMINI_API_KEY
    });

    // Manually bind tools
    const modelWithTools = model.bindTools(TOOLS_SCHEMA);

    // Manually manage messages array
    const messages = [new HumanMessage(userInput)];

    let response = await modelWithTools.invoke(messages);
    messages.push(response);

    // Manually write the tool loop
    while (response.tool_calls?.length > 0) {
        for (const call of response.tool_calls) {
            console.log(`[MANUAL AGENT] Tool called: ${call.name}`);
            const output = toolMap[call.name](call.args);
            console.log(`[MANUAL AGENT] Tool result: ${output}`);

            // Manually format tool result
            messages.push(new ToolMessage({
                content: output,
                tool_call_id: call.id
            }));
        }
        response = await modelWithTools.invoke(messages);
        messages.push(response);
    }

    return response.content;
}

// Run it!
runManualAgent("What is 999 * 888? Also what is the current time?")
    .then(answer => {
        console.log("\n--- MANUAL AGENT ANSWER ---");
        console.log(answer);
    })
    .catch(console.error);
