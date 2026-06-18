const fs = require('fs');
const { runAgent } = require('./agent_module');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function runEvaluation() {
    console.log("🚀 Starting AI Agent Evaluation...");
    const cases = JSON.parse(fs.readFileSync('eval_cases.json', 'utf8'));
    const results = [];

    for (const testCase of cases) {
        console.log(`\n📝 Testing Case #${testCase.id}: [${testCase.category}]`);
        console.log(`Question: ${testCase.question}`);

        try {
            // 1. Get the Agent's Answer
            const startTime = Date.now();
            const answer = await runAgent(testCase.question);
            const duration = (Date.now() - startTime) / 1000;

            // 2. Use a "Judge" AI to score the answer
            const score = await judgeAnswer(testCase.question, testCase.expected_mention, answer);

            console.log(`Score: ${score}/10`);
            console.log(`Time: ${duration}s`);

            results.push({
                ...testCase,
                actual_answer: answer,
                score: score,
                latency: duration
            });
        } catch (err) {
            console.error(`❌ Case #${testCase.id} Failed:`, err.message);
        }
    }

    // 3. Save the report
    fs.writeFileSync('eval_report.json', JSON.stringify(results, null, 2));
    console.log("\n✅ Evaluation Complete! Report saved to eval_report.json");

    const avgScore = results.reduce((acc, r) => acc + r.score, 0) / results.length;
    console.log(`📊 AVERAGE AGENT SCORE: ${avgScore.toFixed(1)} / 10`);
}

/**
 * The "Judge" function: Uses Gemini to grade the response
 */
async function judgeAnswer(question, expected, actual) {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const prompt = `
        You are an AI Quality Auditor.
        Question: ${question}
        Ground Truth Reference: ${expected}
        Agent Answer: ${actual}

        Score the Agent Answer from 1 to 10 based on accuracy and helpfulness. 
        Does it mention the key facts from the Ground Truth? 
        Respond ONLY with a single number.
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        return parseInt(text) || 0;
    } catch {
        return 0;
    }
}

runEvaluation();
