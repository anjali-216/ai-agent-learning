const { QdrantClient } = require("@qdrant/js-client-rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const client = new QdrantClient({
    url: "http://localhost:6333",
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function main() {
    const text = "PostgreSQL is a relational database";

    // Use the Gemini embedding model
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    const result = await model.embedContent(text);
    const vector = result.embedding.values;

    await client.upsert("documents", {
        wait: true,
        points: [
            {
                id: 1,
                vector,
                payload: {
                    text,
                },
            },
        ],
    });

    console.log("Stored successfully with Gemini embeddings");
}

main().catch(console.error);
