/**
 * samples/create-sample-pdf.js
 * -----------------------------
 * One-time helper script that converts sample-resume.txt into
 * a real PDF file (sample-resume.pdf) so you have a ready-made
 * file to upload when testing the app.
 *
 * Run with:  node samples/create-sample-pdf.js
 *
 * Requires the 'pdfkit' package:  npm install pdfkit --save-dev
 */

const fs = require("fs");
const path = require("path");

try {
  const PDFDocument = require("pdfkit");

  const inputFile  = path.join(__dirname, "sample-resume.txt");
  const outputFile = path.join(__dirname, "sample-resume.pdf");

  const resumeText = fs.readFileSync(inputFile, "utf-8");

  const doc = new PDFDocument({ margin: 50 });
  const writeStream = fs.createWriteStream(outputFile);

  doc.pipe(writeStream);

  // Title
  doc.fontSize(18).font("Helvetica-Bold").text("ALEX MORGAN", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica")
     .text("alex.morgan@email.com | github.com/alexmorgan | linkedin.com/in/alexmorgan", { align: "center" });
  doc.moveDown(1);

  // Body — split by line and write
  const lines = resumeText.split("\n").slice(4); // skip the header lines we already wrote
  lines.forEach((line) => {
    if (line.match(/^-{3,}$/)) {
      doc.moveDown(0.2);
    } else if (line.match(/^[A-Z\s]{4,}$/) && line.trim().length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text(line.trim());
      doc.moveDown(0.3);
    } else {
      doc.fontSize(10).font("Helvetica").text(line, { lineGap: 2 });
    }
  });

  doc.end();

  writeStream.on("finish", () => {
    console.log(`✅  PDF created: ${outputFile}`);
  });
} catch (err) {
  if (err.code === "MODULE_NOT_FOUND") {
    console.error(
      "pdfkit is not installed.\n" +
      "Run:  npm install pdfkit --save-dev\n" +
      "Then run this script again."
    );
  } else {
    console.error("Error creating PDF:", err.message);
  }
}
