/**
 * server/index.js
 * ----------------
 * Entry point for the Express web server.
 * Loads environment variables, wires up middleware, mounts routes,
 * and starts listening on the configured port.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const analyzeRouter = require("./routes/analyze");

const app = express();
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
 * Checks whether the local Ollama service is reachable before the user
 * wastes time uploading a PDF only to get a connection error at the end.
 * The frontend calls this on page load and warns the user if Ollama is down.
 *
 * Returns:
 *   200 { ollamaReachable: true,  model: "llama3.2:3b" }
 *   503 { ollamaReachable: false, error: "..." }
 */
app.get("/api/health", async (req, res) => {
  const baseURL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
  const model   = process.env.OLLAMA_MODEL    || "llama3.2:3b";

  // Ollama's OpenAI-compatible /models endpoint is a lightweight way to
  // confirm the service is up without triggering an actual inference.
  const tagsUrl = baseURL.replace(/\/v1\/?$/, "") + "/api/tags";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4-second timeout
    const response = await fetch(tagsUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(503).json({
        ollamaReachable: false,
        error: `Ollama responded with HTTP ${response.status}. Is it fully started?`,
      });
    }

    // Check whether the chosen model has actually been pulled
    const data = await response.json();
    const pulledModels = (data.models || []).map((m) => m.name);
    const modelReady   = pulledModels.some((name) =>
      name === model || name.startsWith(model.split(":")[0])
    );

    return res.json({
      ollamaReachable: true,
      model,
      modelReady,
      availableModels: pulledModels,
      message: modelReady
        ? `Ollama is running and "${model}" is ready.`
        : `Ollama is running but "${model}" has not been pulled yet. Run: ollama pull ${model}`,
    });
  } catch (err) {
    const isTimeout = err.name === "AbortError";
    return res.status(503).json({
      ollamaReachable: false,
      error: isTimeout
        ? "Ollama did not respond within 4 seconds. Make sure it is running."
        : `Cannot reach Ollama at ${tagsUrl}. Run: ollama serve`,
    });
  }
});

// Catch-all: send index.html for any non-API route (SPA fallback)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: err.message || "Something went wrong." });
});

app.listen(PORT, () => {
  console.log(`✅  Resume Skill Analyzer running at http://localhost:${PORT}`);
});
