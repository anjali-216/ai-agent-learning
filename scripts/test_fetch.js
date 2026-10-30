const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyDummy");
async function test() {
    try {
        const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent("hello");
        console.log(result.response.text());
    } catch (e) {
        console.error(e);
        console.error("Cause:", e.cause);
    }
}
test();
