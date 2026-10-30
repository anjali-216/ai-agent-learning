const fs = require("fs");
const { PDFParse } = require("pdf-parse");

async function dump() {
    const dataBuffer = fs.readFileSync("sample.pdf");
    const parser = new PDFParse({ data: dataBuffer });
    const pdfData = await parser.getText();
    console.log(pdfData.text);
    await parser.destroy();
}
dump();
