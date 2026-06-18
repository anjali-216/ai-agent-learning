require("dotenv").config();
const fs = require("fs");
const { PDFParse } = require("pdf-parse"); // Correct for version 2.4.5
const { QdrantClient } = require("@qdrant/js-client-rest");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const qdrant = new QdrantClient({ url: "http://localhost:6333" });

async function ingestPDF() {
  try {
    console.log("Loading PDF and extracting text...");
    const dataBuffer = fs.readFileSync("sample.pdf");

    // The installed version of pdf-parse (2.4.5) requires PDFParse class
    const parser = new PDFParse({ data: dataBuffer });
    const pdfData = await parser.getText();
    const text = pdfData.text;
    await parser.destroy();

    if (!text || text.trim().length === 0) {
      throw new Error("No text content found in the PDF.");
    }

    console.log("PDF text extracted. Cleaning and chunking...");

    // Chunking fix: remove extra whitespace and split into ~500 char chunks
    const cleanText = text.replace(/\s+/g, " ");
    const chunks = cleanText.match(/.{1,500}/g) || [];

    console.log(`Divided into ${chunks.length} chunks.`);

    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const points = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Embedding chunk ${i + 1}/${chunks.length}...`);

      let vector;
      let retries = 5;
      let waitTime = 5000;
      while (retries > 0) {
        try {
          const result = await embeddingModel.embedContent(chunk);
          vector = result.embedding.values;
          break;
        } catch (err) {
          if (err.message.includes("503") && retries > 1) {
            console.log(`Embedding model busy, retrying in ${waitTime / 1000}s... (${retries - 1} left)`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retries--;
            waitTime *= 1.5;
          } else {
            throw err;
          }
        }
      }

      points.push({
        id: Date.now() + i,
        vector,
        payload: {
          text: chunk,
          source: "sample.pdf",
        },
      });
    }

    console.log("Upserting to Qdrant...");
    await qdrant.upsert("documents", {
      wait: true,
      points,
    });

    console.log("✅ PDF stored successfully in Qdrant!");
  } catch (err) {
    console.error("❌ PDF Error:", err.message);
  }
}

ingestPDF();