// createCollection.js
const { QdrantClient } = require("@qdrant/js-client-rest");

const client = new QdrantClient({
    url: "http://localhost:6333",
});

async function main() {
    try {
        console.log("Checking if collection exists...");
        const collections = await client.getCollections();
        const exists = collections.collections.some(c => c.name === "documents");

        if (exists) {
            console.log("Deleting existing collection...");
            await client.deleteCollection("documents");
        }

        console.log("Creating new collection 'documents' with 3072 dimensions...");
        await client.createCollection("documents", {
            vectors: {
                size: 3072,
                distance: "Cosine",
            },
        });

        console.log("✅ Collection 'documents' is ready (and empty).");
    } catch (err) {
        console.error("Error creating collection:", err.message);
    }
}

main();