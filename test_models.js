require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        const models = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("Testing gemini-1.5-flash...");
        const result = await models.generateContent("Say hi");
        console.log("Success:", result.response.text());
    } catch (error) {
        console.error("Error with gemini-1.5-flash:", error.message);
    }

    try {
        console.log("\nListing all available models...");
        // The SDK doesn't have a direct listModels, but we can try to find what works via common names
        // Actually, let's just try to fix the SDK usage first.
    } catch (e) { }
}

listModels();
