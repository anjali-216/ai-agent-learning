require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { runCollaborativeChat } = require("./orchestrator");
const { initDB, saveMessage, getHistory } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

initDB().catch(err => console.error("Database failed to start:", err));

app.get("/", (req, res) => res.send("Streaming Libertum AI Server is ready."));

/**
 * STREAMING ENDPOINT: Uses Server-Sent Events (SSE)
 */
app.post("/chat", async (req, res) => {
    const { message, sessionId = "default" } = req.body;

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const history = await getHistory(sessionId);

        // Define a helper to send chunks to the browser
        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Call Orchestrator with our streaming helper
        const finalAnswer = await runCollaborativeChat(message, history, (status) => {
            sendEvent(status); // Send "Agent is thinking..." etc.
        });

        // Save and send final result
        await saveMessage(sessionId, 'user', message);
        await saveMessage(sessionId, 'model', finalAnswer);

        sendEvent({ type: 'final', answer: finalAnswer });
        res.end();

    } catch (error) {
        console.error("Stream Error:", error.message);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Streaming AI Server running on http://localhost:${PORT}`));