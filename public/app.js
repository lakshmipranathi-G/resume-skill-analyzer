/**
 * public/app.js
 * --------------
 * Client-side JavaScript for the Resume Skill Gap Analyzer.
 *
 * Responsibilities:
 *  - Handle PDF drag-and-drop and file-input selection
 *  - Validate inputs before submission
 *  - POST to /api/analyze and handle loading / error states
 *  - Render the skill-gap report (score ring, skill tags, recommendations)
 */

"use strict";

/* ============================================================
   DOM References — declared first so the health check IIFE
   and all other handlers can share them without re-querying.
   ============================================================ */
const form          = document.getElementById("analyzeForm");
const resumeInput   = document.getElementById("resumeInput");
const dropZone      = document.getElementById("dropZone");
const dropText      = document.getElementById("dropText");
const fileNameEl    = document.getElementById("fileName");
const jdTextarea    = document.getElementById("jobDescription");
const analyzeBtn    = document.getElementById("analyzeBtn");
const formError     = document.getElementById("formError");

const inputSection   = document.getElementById("inputSection");
const loadingSection = document.getElementById("loadingSection");
const resultsSection = document.getElementById("resultsSection");

const ringFill       = document.getElementById("ringFill");
const scoreNumber    = document.getElementById("scoreNumber");
const scoreSummary   = document.getElementById("scoreSummary");
const scoreLabel     = document.getElementById("scoreLabel");
const matchingSkills = document.getElementById("matchingSkills");
const missingSkills  = document.getElementById("missingSkills");
const matchCount     = document.getElementById("matchCount");
const missingCount   = document.getElementById("missingCount");
const recommendations= document.getElementById("recommendations");
const resetBtn       = document.getElementById("resetBtn");

/* ============================================================
   Ollama Health Check — runs once on page load
   Warns the user immediately if the local AI service is down
   rather than letting them discover it after uploading a file.
   ============================================================ */
(async function checkOllama() {
  const banner     = document.getElementById("ollamaBanner");
  const bannerText = document.getElementById("ollamaBannerText");

  try {
    const res  = await fetch("/api/health");
    const data = await res.json();

    if (!data.ollamaReachable) {
      // Ollama is completely unreachable
      bannerText.innerHTML =
        `<strong>Ollama is not running.</strong> ` +
        `Start it with <code>ollama serve</code> in a terminal, then refresh this page.`;
      banner.classList.remove("hidden");
      analyzeBtn.disabled = true;
      analyzeBtn.title    = "Ollama must be running to analyze resumes.";
      return;
    }

    if (!data.modelReady) {
      // Ollama is up but the chosen model hasn't been pulled yet
      bannerText.innerHTML =
        `<strong>Model not found.</strong> ` +
        `Pull it once with: <code>ollama pull ${data.model}</code>, then refresh.`;
      banner.classList.remove("hidden");
      analyzeBtn.disabled = true;
      analyzeBtn.title    = `Run: ollama pull ${data.model}`;
    }
    // If both checks pass, the banner stays hidden and the button stays enabled
  } catch {
    // Network error hitting /api/health — server may not be up yet.
    // Don't block the user; the real error will surface on submit.
  }
})();

/* ============================================================
   Ring circumference constant  (2 * π * r, r = 52)
   ============================================================ */
const CIRCUMFERENCE = 2 * Math.PI * 52; // ≈ 326.7

/* ============================================================
   File-Drop Zone Logic
   ============================================================ */

// Open the hidden file input when the drop zone is clicked or activated via keyboard
dropZone.addEventListener("click", () => resumeInput.click());
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") resumeInput.click();
});

// Drag-and-drop visual feedback
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

["dragleave", "dragend"].forEach((evt) =>
  dropZone.addEventListener(evt, () => dropZone.classList.remove("dragover"))
);

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) applyFile(file);
});

// Handle normal file-input selection
resumeInput.addEventListener("change", () => {
  if (resumeInput.files[0]) applyFile(resumeInput.files[0]);
});

/**
 * Validates and attaches the chosen file to the hidden input (via DataTransfer),
 * then updates the UI.
 */
function applyFile(file) {
  clearError();

  if (file.type !== "application/pdf") {
    showError("Only PDF files are accepted. Please choose a .pdf file.");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showError("File is too large. Maximum allowed size is 5 MB.");
    return;
  }

  // Replace the input's file list with the drag-dropped file
  const dt = new DataTransfer();
  dt.items.add(file);
  resumeInput.files = dt.files;

  // Update UI
  dropText.classList.add("hidden");
  fileNameEl.textContent = `✔ ${file.name}`;
  fileNameEl.classList.remove("hidden");
  dropZone.classList.add("has-file");
}

/* ============================================================
   Form Submission
   ============================================================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  // --- Client-side validation ---
  if (!resumeInput.files || resumeInput.files.length === 0) {
    showError("Please upload a PDF resume before analyzing.");
    return;
  }

  const jd = jdTextarea.value.trim();
  if (jd.length < 50) {
    showError("The job description is too short. Please paste at least 50 characters.");
    jdTextarea.focus();
    return;
  }

  // --- Build FormData ---
  const formData = new FormData();
  formData.append("resume", resumeInput.files[0]);
  formData.append("jobDescription", jd);

  // --- Show loading state ---
  setLoading(true);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong. Please try again.");
    }

    renderResults(data);
  } catch (err) {
    setLoading(false);
    showError(err.message);
  }
});

/* ============================================================
   Loading State
   ============================================================ */
function setLoading(isLoading) {
  if (isLoading) {
    inputSection.classList.add("hidden");
    loadingSection.classList.remove("hidden");
    resultsSection.classList.add("hidden");
    analyzeBtn.disabled = true;
  } else {
    inputSection.classList.remove("hidden");
    loadingSection.classList.add("hidden");
    analyzeBtn.disabled = false;
  }
}

/* ============================================================
   Render Results
   ============================================================ */
function renderResults(report) {
  loadingSection.classList.add("hidden");

  // Accept both snake_case (new canonical) and camelCase (legacy) keys
  const pct     = report.match_percentage  ?? report.matchPercentage  ?? 0;
  const matched = report.matched_skills    ?? report.matchingSkills   ?? [];
  const missing = report.missing_skills    ?? report.missingSkills    ?? [];
  const recos   = report.recommendations  ?? [];

  // -- Score ring animation --
  const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
  ringFill.style.strokeDashoffset = offset;

  // Colour the ring based on score
  if (pct >= 75)      ringFill.style.stroke = "#16a34a"; // green
  else if (pct >= 50) ringFill.style.stroke = "#4f46e5"; // indigo
  else if (pct >= 25) ringFill.style.stroke = "#d97706"; // amber
  else                ringFill.style.stroke = "#dc2626"; // red

  // Animate the number counting up
  animateCounter(scoreNumber, pct);

  // Summary text
  scoreSummary.textContent = report.summary || "";

  // Label pill
  scoreLabel.textContent    = getScoreLabel(pct).text;
  scoreLabel.className      = `score-label ${getScoreLabel(pct).cls}`;

  // -- Matching skills --
  matchingSkills.innerHTML = "";
  matched.forEach((skill, i) => {
    const li = document.createElement("li");
    li.className = "skill-tag skill-tag-match";
    li.style.animationDelay = `${i * 0.05}s`;
    li.textContent = skill;
    matchingSkills.appendChild(li);
  });
  matchCount.textContent = matched.length;

  // -- Missing skills --
  missingSkills.innerHTML = "";
  missing.forEach((skill, i) => {
    const li = document.createElement("li");
    li.className = "skill-tag skill-tag-miss";
    li.style.animationDelay = `${i * 0.05}s`;
    li.textContent = skill;
    missingSkills.appendChild(li);
  });
  missingCount.textContent = missing.length;

  // -- Recommendations --
  recommendations.innerHTML = "";
  recos.forEach((reco, i) => {
    const card = document.createElement("div");
    card.className = "reco-card-item";
    card.style.animationDelay = `${i * 0.1}s`;
    card.innerHTML = `
      <div class="reco-skill-name">
        <i class="fa-solid fa-lightbulb" aria-hidden="true"></i>
        ${escapeHtml(reco.skill)}
      </div>
      <p class="reco-reason">${escapeHtml(reco.reason)}</p>
      <div class="reco-resource">
        <i class="fa-solid fa-book-open" aria-hidden="true"></i>
        ${escapeHtml(reco.resource)}
      </div>
    `;
    recommendations.appendChild(card);
  });

  // Show results section
  resultsSection.classList.remove("hidden");

  // Smooth scroll to results
  setTimeout(() => resultsSection.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
}

/* ============================================================
   Reset / Analyze Another
   ============================================================ */
resetBtn.addEventListener("click", () => {
  // Reset form
  form.reset();
  dropText.classList.remove("hidden");
  fileNameEl.classList.add("hidden");
  fileNameEl.textContent = "";
  dropZone.classList.remove("has-file");
  clearError();

  // Reset ring
  ringFill.style.strokeDashoffset = CIRCUMFERENCE;
  ringFill.style.stroke = "#4f46e5";

  // Show input, hide results
  resultsSection.classList.add("hidden");
  inputSection.classList.remove("hidden");
  analyzeBtn.disabled = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* ============================================================
   Helper Functions
   ============================================================ */

/** Display an error message above the submit button. */
function showError(message) {
  formError.textContent = `⚠ ${message}`;
  formError.classList.remove("hidden");
  formError.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearError() {
  formError.textContent = "";
  formError.classList.add("hidden");
}

/** Animate a number counting from 0 to target. */
function animateCounter(el, target) {
  const duration = 1200;
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = `${Math.round(eased * target)}%`;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/** Returns a label text and CSS class based on the percentage. */
function getScoreLabel(pct) {
  if (pct >= 75) return { text: "Excellent Match 🎉", cls: "label-excellent" };
  if (pct >= 50) return { text: "Good Match 👍",      cls: "label-good" };
  if (pct >= 25) return { text: "Fair Match 🔧",      cls: "label-fair" };
  return           { text: "Needs Work 📚",            cls: "label-poor" };
}

/** Escapes HTML special characters to prevent XSS. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
