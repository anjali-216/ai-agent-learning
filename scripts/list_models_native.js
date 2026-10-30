require("dotenv").config();
const https = require("https");

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;

https.get(url, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.models) {
                console.log("Supported Models:");
                parsed.models.forEach(m => console.log(`- ${m.name}`));
            } else {
                console.log("No models found or error:", data);
            }
        } catch (e) {
            console.log("Error parsing response:", e.message);
            console.log("Raw Data:", data);
        }
    });
}).on("error", (err) => {
    console.log("Request Error:", err.message);
});
