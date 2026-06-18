require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const candidateModels = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-pro", "gemini-1.0-pro"];

async function testModels() {
    for (const m of candidateModels) {
        try {
            console.log(`Testing ${m}...`);
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("hi");
            console.log(`SUCCESS with ${m}: ${result.response.text().substring(0, 10)}...`);
            return m; // Found one!
        } catch (e) {
            console.log(`FAILED with ${m}: ${e.message.substring(0, 100)}`);
        }
    }
}

testModels();
