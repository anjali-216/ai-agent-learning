require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const candidateModels = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro", "gemini-pro"];

    console.log("Searching for alternative models...");

    for (const modelName of candidateModels) {
        try {
            console.log(`Testing ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const resultok = await model.generateContent("Hi");
            console.log(`✅ ${modelName} is WORKING.`);
            process.exit(0); // Stop at the first working one
        } catch (err) {
            if (err.message.includes("404")) {
                console.log(`❌ ${modelName} not found (404).`);
            } else if (err.message.includes("429")) {
                console.log(`⚠️ ${modelName} quota exceeded (429).`);
            } else {
                console.log(`❓ ${modelName} error: ${err.message.substring(0, 50)}...`);
            }
        }
    }
}

testModels();
