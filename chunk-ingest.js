require("dotenv").config();
const fs = require("fs");
const { QdrantClient } = require("@qdrant/js-client-rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const qdrant = new QdrantClient({
  url: "http://localhost:6333",
});

async function ingest() {
  try {
    const text = fs.readFileSync("sample.txt", "utf8");

    // Split into chunks by double newline
    const chunks = text
      // .split("\n\n")
      .match(/.{1,500}/g)
      .map(chunk => chunk.trim())
      .filter(Boolean);

    console.log(`Found ${chunks.length} chunks`);

    const points = [];

    // Use 'gemini-embedding-001' as it matches your available models
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      console.log(`Embedding chunk ${i + 1}/${chunks.length}`);

      const result = await embeddingModel.embedContent(chunk);
      const vector = result.embedding.values;

      points.push({
        id: i + 10, // Starting at 10 to avoid conflict with initial test data
        vector,
        payload: {
          text: chunk,
          chunkNumber: i + 1,
        },
      });
    }

    await qdrant.upsert("documents", {
      wait: true,
      points,
    });

    console.log("All chunks stored successfully");
  } catch (error) {
    console.error("Ingestion Error:", error.message);
  }
}

ingest(); 