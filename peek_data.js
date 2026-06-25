const { QdrantClient } = require("@qdrant/js-client-rest");

const client = new QdrantClient({ url: "http://localhost:6333" });

async function peek() {
    console.log("🔍 Peeking into the 'documents' collection...\n");

    const response = await client.scroll("documents", {
        limit: 1, // Just get one point
        with_payload: true,
        with_vector: true // We want to see those 3072 numbers!
    });

    if (response.points.length > 0) {
        const point = response.points[0];
        console.log("✅ RAW DATA FOUND:");
        console.log("-------------------");
        console.log(`ID: ${point.id}`);
        console.log(`SOURCE: ${point.payload.source}`);
        console.log(`TEXT PREVIEW: ${point.payload.text.substring(0, 100)}...`);

        // Show the first 10 numbers of the vector
        const vectorPreview = point.vector.slice(0, 10).join(", ");
        console.log(`VECTOR PREVIEW (First 10 of 3072): [ ${vectorPreview}, ... ]`);
        console.log("-------------------");
    } else {
        console.log("❌ No data found in 'documents' collection.");
    }
}

peek().catch(console.error);
