const { QdrantClient } = require("@qdrant/js-client-rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const qdrant = new QdrantClient({
    url: "http://localhost:6333",
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function search(question) {
    try {
        console.log("Question:", question);

        // Generate embedding
        const embeddingModel = genAI.getGenerativeModel({
            model: "gemini-embedding-001",
        });

        const embeddingResponse = await embeddingModel.embedContent(question);

        const vector = embeddingResponse.embedding.values;

        console.log("Embedding generated");

        // Search Qdrant
        const results = await qdrant.search("documents", {
            vector,
            limit: 3,
        });

        console.log("\nTop Matches:\n");

        results.forEach((result, index) => {
            console.log(`${index + 1}.`);
            console.log("Score:", result.score);
            console.log("Text:", result.payload.text);
            console.log("----------------------");
        });
    } catch (error) {
        console.error(error);
    }
}

search("What database should I use?");