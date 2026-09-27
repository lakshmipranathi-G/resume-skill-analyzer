/**
 * server/routes/analyze.js
 * -------------------------
 * Defines the POST /api/analyze route.
 * Accepts a resume PDF upload and a job description string,
 * extracts the resume text, calls the AI analysis service,
 * and returns a structured skill-gap report as JSON.
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { extractTextFromPDF } = require("../services/pdfExtractor");
const { analyzeSkillGap } = require("../services/aiAnalyzer");

// --- Multer config: save uploads to /uploads, accept only PDFs ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads");
    // Create the directory if it doesn't exist yet
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use a timestamp prefix to avoid filename collisions
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are accepted."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

/**
 * POST /api/analyze
 * Body (multipart/form-data):
 *   - resume      : PDF file
 *   - jobDescription : plain text string
 */
router.post("/analyze", upload.single("resume"), async (req, res) => {
  const resumeFile = req.file;
  const jobDescription = req.body.jobDescription?.trim();

  // --- Validation ---
  if (!resumeFile) {
    return res.status(400).json({ error: "Please upload a resume PDF." });
  }
  if (!jobDescription || jobDescription.length < 50) {
    // Clean up the uploaded file before returning the error
    fs.unlink(resumeFile.path, () => {});
    return res.status(400).json({
      error: "Please provide a job description (at least 50 characters).",
    });
  }

  try {
    // 1. Extract plain text from the uploaded PDF
    const resumeText = await extractTextFromPDF(resumeFile.path);

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(422).json({
        error:
          "Could not extract readable text from the PDF. Please make sure the resume is not a scanned image.",
      });
    }

    // 2. Send both texts to the AI analyzer
    const report = await analyzeSkillGap(resumeText, jobDescription);

    res.json(report);
  } catch (err) {
    console.error("Analysis error:", err.message);
    res.status(500).json({ error: err.message || "Analysis failed." });
  } finally {
    // Always clean up the temporary file
    if (resumeFile) fs.unlink(resumeFile.path, () => {});
  }
});

module.exports = router;
