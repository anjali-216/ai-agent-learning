// require("dotenv").config();
// const { QdrantClient } = require("@qdrant/js-client-rest");
// const { GoogleGenerativeAI } = require("@google/generative-ai");

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// const qdrant = new QdrantClient({
//     url: "http://localhost:6333",
// });

// async function rag(question) {
//     try {
//         console.log("\nQuestion:");
//         console.log(question);

//         // STEP 1: Create embedding for user question
//         // Using 'gemini-embedding-001' as it matches your ingestion
//         const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
//         const embeddingResponse = await embeddingModel.embedContent(question);

//         const vector = embeddingResponse.embedding.values;

//         // STEP 2: Search Qdrant
//         const results = await qdrant.search("documents", {
//             vector,
//             limit: 3,
//         });

//         if (!results.length) {
//             console.log("No relevant documents found");
//             return;
//         }

//         // STEP 3: Build context
//         const context = results
//             .map((item) => item.payload.text)
//             .join("\n");

//         console.log("\nRetrieved Context:");
//         console.log(context);

//         // STEP 4: Create RAG prompt
//         const prompt = `
// You are a helpful AI assistant.

// Answer ONLY using the provided context.

// Context:
// ${context}

// Question:
// ${question}
// `;

//         // STEP 5: Generate answer
//         // Reverting to 'gemini-3.5-flash' as it's the available model, keeping the retry logic
//         const chatModel = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

//         // Simple retry logic for 503 errors (high demand)
//         let result;
//         let retries = 5;
//         let waitTime = 5000; // Start with 5 seconds
//         while (retries > 0) {
//             try {
//                 result = await chatModel.generateContent(prompt);
//                 break;
//             } catch (err) {
//                 if (err.message.includes("503") && retries > 1) {
//                     console.log(`Model busy, retrying in ${waitTime / 1000}s... (${retries - 1} left)`);
//                     await new Promise(resolve => setTimeout(resolve, waitTime));
//                     retries--;
//                     waitTime *= 1.5; // Exponential backoff
//                 } else {
//                     throw err;
//                 }
//             }
//         }

//         const response = await result.response;

//         console.log("\nFinal Answer:");
//         console.log(response.text());

//     } catch (error) {
//         console.error("RAG Error:", error.message);
//     }
// }

// rag("What database should I use?");




require("dotenv").config();

const { QdrantClient } = require("@qdrant/js-client-rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const qdrant = new QdrantClient({
    url: "http://localhost:6333",
});

async function generateEmbedding(text) {
    const embeddingModel = genAI.getGenerativeModel({
        model: "gemini-embedding-001",
    });

    const result = await embeddingModel.embedContent(text);

    return result.embedding.values;
}

async function generateAnswer(prompt) {
    const chatModel = genAI.getGenerativeModel({
        model: "gemini-3.5-flash",
    });

    let retries = 5;
    let waitTime = 5000;

    while (retries > 0) {
        try {
            const result = await chatModel.generateContent(prompt);
            return result.response.text();
        } catch (err) {
            if (err.message.includes("503") && retries > 1) {
                console.log(
                    `Model busy, retrying in ${waitTime / 1000}s... (${retries - 1} left)`
                );

                await new Promise((resolve) =>
                    setTimeout(resolve, waitTime)
                );

                retries--;
                waitTime *= 1.5;
            } else {
                throw err;
            }
        }
    }
}

async function rag(question) {
    try {
        console.log("\n=================================");
        console.log("Question:");
        console.log(question);
        console.log("=================================\n");

        // STEP 1: Generate Question Embedding
        const vector = await generateEmbedding(question);

        // STEP 2: Search Qdrant
        const results = await qdrant.search("documents", {
            vector,
            limit: 3,
        });

        if (!results.length) {
            console.log("No relevant documents found");
            return;
        }

        // STEP 3: Show Retrieved Chunks
        console.log("Top Retrieved Chunks:\n");

        results.forEach((item, index) => {
            console.log(`Chunk ${index + 1}`);
            console.log(`Score: ${item.score}`);
            console.log(item.payload.text);
            console.log("-----------------------------------");
        });

        // STEP 4: Build Context
        const context = results
            .map((item) => item.payload.text)
            .join("\n\n");

        // STEP 5: Build Prompt
        const prompt = `
You are a helpful AI assistant.

Rules:
1. Answer only from the provided context.
2. If the answer is not present, say:
   "I could not find that information in the provided context."

Context:
${context}

Question:
${question}
`;

        // STEP 6: Generate Final Answer
        const answer = await generateAnswer(prompt);

        console.log("\n=================================");
        console.log("FINAL ANSWER");
        console.log("=================================\n");

        console.log(answer);

    } catch (error) {
        console.error("\nRAG Error:");
        console.error(error.message);
    }
}

// Test Questions
// rag("What database should I use?");
rag("what is bonding curve ");