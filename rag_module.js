require("dotenv").config();
const { QdrantClient } = require("@qdrant/js-client-rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const qdrant = new QdrantClient({ url: "http://localhost:6333" });

/**
 * Generates an embedding for a piece of text.
 */
async function generateEmbedding(text) {
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
}

/**
 * Core RAG logic: Embeds question, searches Qdrant, and generates grounded answer.
 * @param {string} question - The user query.
 * @param {Array} history - Optional previous conversation history for context.
 */
async function performRAG(question, history = []) {
    try {
        // 1. Embed question
        const vector = await generateEmbedding(question);

        // 2. Search Qdrant for context
        const searchResults = await qdrant.search("documents", {
            vector,
            limit: 5,
        });

        // 3. Build context string
        const context = searchResults.length > 0
            ? searchResults.map(res => res.payload.text).join("\n\n")
            : "No specific context found in database.";

        // 4. Build prompt with history
        const historyString = history.length > 0
            ? history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.parts[0].text}`).join("\n")
            : "No previous conversation.";

        const prompt = `
You are the Libertum Official AI Assistant.
Answer the user's question accurately using the provided context and conversation history.

Rules:
1. Only answer based on the provided Context.
2. If the answer is not in the context, say "I'm sorry, I don't have information on that in my current database."
3. Be professional and helpful.

Conversation History:
${historyString}

Context:
${context}

User Question: ${question}

Assistant Answer:`;

        // 5. Generate content using Gemini 3.5 Flash (with retry logic)
        const chatModel = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

        let retries = 5;
        let waitTime = 2000;
        let result;

        while (retries > 0) {
            try {
                result = await chatModel.generateContent(prompt);
                break;
            } catch (err) {
                if (err.message.includes("503") && retries > 1) {
                    await new Promise(r => setTimeout(r, waitTime));
                    retries--;
                    waitTime *= 2;
                } else {
                    throw err;
                }
            }
        }

        return {
            answer: result.response.text(),
            sources: searchResults.map(res => ({
                text: res.payload.text.substring(0, 100) + "...",
                source: res.payload.source || "Unknown"
            }))
        };

    } catch (error) {
        console.error("RAG Module Error:", error.message);
        throw error;
    }
}

module.exports = { performRAG };
