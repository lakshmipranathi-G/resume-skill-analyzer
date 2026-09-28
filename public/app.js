/**
 * public/app.js
 * --------------
 * Client-side JavaScript for the Resume Skill Gap Analyzer.
 *
 * Responsibilities:
 *  - Handle PDF drag-and-drop and file-input selection
 *  - Validate inputs before submission
 *  - POST to /api/analyze and handle loading / error states
 *  - Render the skill-gap report
 */

"use strict";

/* ============================================================
   DOM References
   ============================================================ */

const form           = document.getElementById("analyzeForm");
const resumeInput    = document.getElementById("resumeInput");
const dropZone       = document.getElementById("dropZone");
const dropText       = document.getElementById("dropText");
const fileNameEl     = document.getElementById("fileName");
const jdTextarea     = document.getElementById("jobDescription");
const analyzeBtn     = document.getElementById("analyzeBtn");
const formError      = document.getElementById("formError");

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
const recommendations = document.getElementById("recommendations");
const resetBtn       = document.getElementById("resetBtn");

/*
 * The old Ollama health check has been removed.
 *
 * The application now uses Gemini through the backend.
 * The Gemini API key stays on the server and is never exposed
 * to the browser.
 */

/* ============================================================
   Ring circumference constant
   ============================================================ */

const CIRCUMFERENCE = 2 * Math.PI * 52;


/* ============================================================
   File-Drop Zone Logic
   ============================================================ */

// Open the hidden file input when the drop zone is clicked
dropZone.addEventListener("click", () => resumeInput.click());

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    resumeInput.click();
  }
});

// Drag-and-drop visual feedback
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

["dragleave", "dragend"].forEach((evt) =>
  dropZone.addEventListener(evt, () => {
    dropZone.classList.remove("dragover");
  })
);

// Handle dropped file
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");

  const file = e.dataTransfer.files[0];

  if (file) {
    applyFile(file);
  }
});

// Handle normal file selection
resumeInput.addEventListener("change", () => {
  if (resumeInput.files[0]) {
    applyFile(resumeInput.files[0]);
  }
});


/**
 * Validate and attach the selected PDF.
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

  // Replace input's file list with the selected file
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

  // Validate resume
  if (!resumeInput.files || resumeInput.files.length === 0) {
    showError("Please upload a PDF resume before analyzing.");
    return;
  }

  // Validate job description
  const jd = jdTextarea.value.trim();

  if (jd.length < 50) {
    showError(
      "The job description is too short. Please paste at least 50 characters."
    );

    jdTextarea.focus();
    return;
  }

  // Build FormData
  const formData = new FormData();

  formData.append("resume", resumeInput.files[0]);
  formData.append("jobDescription", jd);

  // Show loading state
  setLoading(true);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Something went wrong. Please try again."
      );
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

  // Accept both snake_case and camelCase keys
  const pct =
    report.match_percentage ??
    report.matchPercentage ??
    0;

  const matched =
    report.matched_skills ??
    report.matchingSkills ??
    [];

  const missing =
    report.missing_skills ??
    report.missingSkills ??
    [];

  const recos =
    report.recommendations ??
    [];

  // Score ring
  const offset =
    CIRCUMFERENCE -
    (pct / 100) * CIRCUMFERENCE;

  ringFill.style.strokeDashoffset = offset;

  // Score ring colour
  if (pct >= 75) {
    ringFill.style.stroke = "#16a34a";
  } else if (pct >= 50) {
    ringFill.style.stroke = "#4f46e5";
  } else if (pct >= 25) {
    ringFill.style.stroke = "#d97706";
  } else {
    ringFill.style.stroke = "#dc2626";
  }

  // Animate score
  animateCounter(scoreNumber, pct);

  // Summary
  scoreSummary.textContent = report.summary || "";

  // Score label
  const scoreInfo = getScoreLabel(pct);

  scoreLabel.textContent = scoreInfo.text;

  scoreLabel.className =
    `score-label ${scoreInfo.cls}`;


  /* ----------------------------------------------------------
     Matching Skills
     ---------------------------------------------------------- */

  matchingSkills.innerHTML = "";

  matched.forEach((skill, i) => {

    const li = document.createElement("li");

    li.className =
      "skill-tag skill-tag-match";

    li.style.animationDelay =
      `${i * 0.05}s`;

    li.textContent = skill;

    matchingSkills.appendChild(li);
  });

  matchCount.textContent = matched.length;


  /* ----------------------------------------------------------
     Missing Skills
     ---------------------------------------------------------- */

  missingSkills.innerHTML = "";

  missing.forEach((skill, i) => {

    const li = document.createElement("li");

    li.className =
      "skill-tag skill-tag-miss";

    li.style.animationDelay =
      `${i * 0.05}s`;

    li.textContent = skill;

    missingSkills.appendChild(li);
  });

  missingCount.textContent = missing.length;


  /* ----------------------------------------------------------
     Recommendations
     ---------------------------------------------------------- */

  recommendations.innerHTML = "";

  recos.forEach((reco, i) => {

    const card = document.createElement("div");

    card.className =
      "reco-card-item";

    card.style.animationDelay =
      `${i * 0.1}s`;

    card.innerHTML = `
      <div class="reco-skill-name">
        <i
          class="fa-solid fa-lightbulb"
          aria-hidden="true">
        </i>

        ${escapeHtml(reco.skill)}
      </div>

      <p class="reco-reason">
        ${escapeHtml(reco.reason)}
      </p>

      <div class="reco-resource">
        <i
          class="fa-solid fa-book-open"
          aria-hidden="true">
        </i>

        ${escapeHtml(reco.resource)}
      </div>
    `;

    recommendations.appendChild(card);
  });


  /* ----------------------------------------------------------
     Show Results
     ---------------------------------------------------------- */

  resultsSection.classList.remove("hidden");

  setTimeout(() => {
    resultsSection.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 100);
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


  // Reset score ring
  ringFill.style.strokeDashoffset =
    CIRCUMFERENCE;

  ringFill.style.stroke =
    "#4f46e5";


  // Show input again
  resultsSection.classList.add("hidden");

  inputSection.classList.remove("hidden");

  analyzeBtn.disabled = false;


  // Scroll to top
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});


/* ============================================================
   Helper Functions
   ============================================================ */

/**
 * Display an error message.
 */
function showError(message) {

  formError.textContent =
    `⚠ ${message}`;

  formError.classList.remove("hidden");

  formError.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
}


/**
 * Clear error message.
 */
function clearError() {

  formError.textContent = "";

  formError.classList.add("hidden");
}


/**
 * Animate score counter.
 */
function animateCounter(el, target) {

  const duration = 1200;

  const start = performance.now();

  function update(now) {

    const elapsed =
      now - start;

    const progress =
      Math.min(elapsed / duration, 1);

    // Ease-out cubic
    const eased =
      1 - Math.pow(1 - progress, 3);

    el.textContent =
      `${Math.round(eased * target)}%`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}


/**
 * Return score label and CSS class.
 */
function getScoreLabel(pct) {

  if (pct >= 75) {
    return {
      text: "Excellent Match 🎉",
      cls: "label-excellent",
    };
  }

  if (pct >= 50) {
    return {
      text: "Good Match 👍",
      cls: "label-good",
    };
  }

  if (pct >= 25) {
    return {
      text: "Fair Match 🔧",
      cls: "label-fair",
    };
  }

  return {
    text: "Needs Work 📚",
    cls: "label-poor",
  };
}


/**
 * Escape HTML special characters.
 * Prevents XSS when displaying AI-generated content.
 */
function escapeHtml(str) {

  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}