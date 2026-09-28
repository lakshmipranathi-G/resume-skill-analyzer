/**
 * server/index.js
 * ----------------
 * Entry point for the Express web server.
 * Loads environment variables, wires up middleware,
 * mounts routes, and starts listening on the configured port.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const analyzeRouter = require("./routes/analyze");

const app = express();

// Render provides PORT automatically.
// Locally, it will use port 3000.
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Serve the frontend from the /public folder
app.use(express.static(path.join(__dirname, "../public")));

// --- API Routes ---
app.use("/api", analyzeRouter);

/**
 * GET /api/health
 * ---------------
 * Checks whether the Gemini API is configured.
 *
 * This does NOT make a Gemini API request.
 * It only checks whether GEMINI_API_KEY exists.
 */
app.get("/api/health", (req, res) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  if (!geminiConfigured) {
    return res.status(503).json({
      geminiConfigured: false,
      error: "Gemini API key is not configured.",
    });
  }

  return res.json({
    geminiConfigured: true,
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    message: "Gemini API is configured.",
  });
});

// Catch-all: send index.html for frontend routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);

  res.status(500).json({
    error: err.message || "Something went wrong.",
  });
});

// --- Start server ---
// 0.0.0.0 allows Render and other hosts to access the server.
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `✅ Resume Skill Analyzer running on port ${PORT}`
  );
});