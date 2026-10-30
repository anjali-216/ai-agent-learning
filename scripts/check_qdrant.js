const { QdrantClient } = require("@qdrant/js-client-rest");
const qdrant = new QdrantClient({ url: "http://localhost:6333" });

async function check() {
    const response = await qdrant.scroll("documents", {
        limit: 100,
        with_payload: true
    });
    console.log(`Total points: ${response.points.length}`);
    response.points.forEach(p => {
        console.log(`[${p.id}] ${p.payload.text?.substring(0, 50)}... (Source: ${p.payload.source || 'unknown'})`);
    });
}
check();
