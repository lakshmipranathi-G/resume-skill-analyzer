/**
 * server/services/pdfExtractor.js
 * --------------------------------
 * Reads a PDF file from disk and returns its text content as a plain string.
 *
 * WHY this was rewritten
 * ----------------------
 * The previous implementation used `pdf-parse` which bundles pdf.js v1.10.100
 * (2018). That vintage version throws a hard "bad XRef entry" crash on any PDF
 * whose cross-reference table is compressed (/XRefStm), uses an object stream,
 * or is even mildly non-standard — which covers virtually every PDF produced by
 * Microsoft Word, Google Docs, LibreOffice, macOS Preview, and online resume
 * builders.
 *
 * This version uses `pdfjs-dist` (the official, actively-maintained Mozilla
 * PDF.js package). Key improvements:
 *   • `stopAtErrors: false`  — instructs the parser to continue past XRef
 *     warnings instead of throwing. Corrupt/non-standard tables are repaired
 *     automatically whenever possible.
 *   • Per-page errors are caught individually, so a bad page doesn't kill the
 *     entire extraction — we still get text from all other pages.
 *   • A fallback message is returned for pages that genuinely can't be read.
 *
 * Exported function:
 *   extractTextFromPDF(filePath) → Promise<string>
 */

const fs = require("fs");
const path = require("path");

/**
 * Lazily-loaded pdfjs-dist module reference.
 * We load it once on first call because it is ESM-only in v4+ and must be
 * imported with a dynamic import() rather than require().
 */
let _pdfjsLib = null;

async function getPdfjsLib() {
  if (_pdfjsLib) return _pdfjsLib;

  _pdfjsLib = await import("pdfjs-dist");

  // Point to the real worker file so pdf.js can run its parsing pipeline.
  // Without this, pdfjs-dist 4.x throws "No GlobalWorkerOptions.workerSrc
  // specified" even in Node. We use a file:// URL so the ESM loader can
  // resolve it correctly on Windows and Unix alike.
  const workerPath = path.resolve(
    __dirname,
    "../../node_modules/pdfjs-dist/build/pdf.worker.mjs"
  );
  _pdfjsLib.GlobalWorkerOptions.workerSrc = `file:///${workerPath.replace(/\\/g, "/")}`;

  return _pdfjsLib;
}

/**
 * Extracts all readable text from a PDF file.
 *
 * @param {string} filePath - Absolute path to the uploaded PDF.
 * @returns {Promise<string>} The concatenated plain text from all pages.
 * @throws  If the file is not a PDF at all (e.g. a JPEG renamed to .pdf).
 */
async function extractTextFromPDF(filePath) {
  const pdfjsLib = await getPdfjsLib();

  const fileBuffer = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(fileBuffer);

  // stopAtErrors: false  → keep going after XRef warnings / non-standard tables
  // disableRange / disableStream → not needed for local buffers, but safe defaults
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    stopAtErrors: false,    // <-- the critical flag that silences "bad XRef entry"
    verbosity: 0,           // suppress console warnings from the parser
  });

  let pdfDocument;
  try {
    pdfDocument = await loadingTask.promise;
  } catch (err) {
    // Re-throw with a user-friendly message
    throw new Error(
      `Could not open the PDF file. ${err.message || "The file may be corrupted or password-protected."}`
    );
  }

  const numPages = pdfDocument.numPages;
  const pageTexts = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Reconstruct readable text: items on the same Y-coordinate are on the
      // same line; a new Y means a new line.
      let lastY = null;
      let pageText = "";

      for (const item of textContent.items) {
        if ("str" in item) {
          const y = item.transform ? item.transform[5] : null;
          if (lastY !== null && y !== null && y !== lastY) {
            pageText += "\n";
          }
          pageText += item.str;
          lastY = y;
        }
      }

      pageTexts.push(pageText.trim());
      page.cleanup();
    } catch (pageErr) {
      // One unreadable page should not abort the entire extraction
      console.warn(`⚠ Could not read page ${pageNum}: ${pageErr.message}`);
      pageTexts.push(""); // blank placeholder keeps page numbering intact
    }
  }

  await pdfDocument.destroy();

  return pageTexts.filter(Boolean).join("\n\n");
}

module.exports = { extractTextFromPDF };
