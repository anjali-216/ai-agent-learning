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
                console.log("Models that support generateContent:");
                parsed.models.forEach(m => {
                    if (m.supportedGenerationMethods.includes("generateContent")) {
                        console.log(`- ${m.name}`);
                    }
                });
            }
        } catch (e) {
            console.log("Error parsing response:", e.message);
        }
    });
});

