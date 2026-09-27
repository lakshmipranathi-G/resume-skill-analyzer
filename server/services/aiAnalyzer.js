/**
 * server/services/aiAnalyzer.js
 * ──────────────────────────────
 * Analyses a resume against a job description and returns a structured
 * skill-gap report.
 *
 * Strategy (in priority order):
 *   1. Call local Ollama via http.request (no AbortSignal — Node 24 bug workaround).
 *      Uses /api/generate with format:"json" and temperature:0 for deterministic output.
 *   2. If Ollama fails OR returns unparseable JSON → run the deterministic fallback.
 *      The fallback matches skills from a comprehensive built-in skill list and always
 *      returns a valid report — the dashboard ALWAYS gets a result.
 *
 * NO API KEY REQUIRED.  No external services.  No OpenAI.
 *
 * Exported:
 *   analyzeSkillGap(resumeText, jobDescription) → Promise<SkillGapReport>
 *
 * SkillGapReport:
 *   match_percentage  : number  0-100
 *   matched_skills    : string[]
 *   missing_skills    : string[]
 *   recommendations   : { skill, reason, resource }[]
 *   summary           : string
 */

"use strict";

const http = require("http");

// ─────────────────────────────────────────────────────────────────────────────
// Config — safe defaults, .env is optional
// ─────────────────────────────────────────────────────────────────────────────
const OLLAMA_HOST = "localhost";
const OLLAMA_PORT = 11434;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";
const OLLAMA_TIMEOUT_MS = 90_000; // 90 s — generous for cold model load

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic skill list
// Used by the fallback analyser to identify skills by keyword matching.
// ─────────────────────────────────────────────────────────────────────────────
const SKILL_LIST = [
  // Languages
  "JavaScript","TypeScript","Python","Java","C#","C++","C","Go","Rust","Ruby",
  "PHP","Swift","Kotlin","Scala","R","MATLAB","Bash","PowerShell","Perl","Lua",
  // Frontend
  "React","Vue","Angular","Svelte","Next.js","Nuxt","HTML","CSS","Sass","SCSS",
  "Tailwind","Bootstrap","jQuery","Redux","Zustand","GraphQL","REST","REST APIs",
  "Webpack","Vite","Babel","Storybook","Figma","Accessibility","WCAG",
  // Backend
  "Node.js","Express","Django","Flask","FastAPI","Spring","Laravel","Rails",
  "ASP.NET","Gin","Fiber","NestJS","Hapi","Fastify","tRPC","gRPC","WebSockets",
  // Databases
  "PostgreSQL","MySQL","SQLite","MongoDB","Redis","Elasticsearch","Cassandra",
  "DynamoDB","Firebase","Supabase","Prisma","Sequelize","TypeORM","SQL","NoSQL",
  // DevOps / Cloud
  "Docker","Kubernetes","Terraform","Ansible","Jenkins","GitHub Actions","GitLab CI",
  "CircleCI","AWS","GCP","Azure","Vercel","Netlify","Heroku","CI/CD","Linux",
  "Nginx","Apache","Prometheus","Grafana","DataDog","Helm",
  // Tools & practices
  "Git","GitHub","GitLab","Jira","Confluence","Agile","Scrum","Kanban",
  "TDD","BDD","Jest","Mocha","Cypress","Playwright","Vitest","Pytest",
  "Postman","Swagger","OpenAPI","Microservices","Serverless","Event-Driven",
  // Data / AI
  "Machine Learning","Deep Learning","TensorFlow","PyTorch","Keras","scikit-learn",
  "Pandas","NumPy","Jupyter","Spark","Hadoop","Airflow","dbt","Power BI","Tableau",
  // Soft / professional
  "Communication","Leadership","Teamwork","Problem Solving","Agile","Project Management",
  "Code Review","Mentoring","Documentation","Technical Writing",
];

// ─────────────────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Condenses a block of text down to its most skill-dense lines.
 * Keeps lines that contain skill-keyword signals, plus the first few lines
 * for context. This keeps the prompt short enough for llama3.2:3b to answer
 * in well under 90 seconds on a CPU-only machine.
 */
function condense(text, maxChars) {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  // Prefer lines that look skill-related
  const skillSignals = /skill|experience|proficien|familiar|knowledge|develop|engineer|tool|technolog|language|framework|library|platform|cloud|database|certif|project/i;
  const ranked = lines
    .map(l => ({ l, score: skillSignals.test(l) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score);
  let out = "";
  for (const { l } of ranked) {
    if ((out + l).length > maxChars) break;
    out += l + "\n";
  }
  return out.trim();
}

function buildPrompt(resumeText, jobDescription) {
  // Keep each section tight — llama3.2:3b on CPU needs a short prompt
  const resume = condense(resumeText, 800);
  const job    = condense(jobDescription, 600);

  return (
    `You are a recruiter. Compare the RESUME and JOB below.\n` +
    `Return ONLY a JSON object with EXACTLY these 5 keys (no other text, no markdown):\n` +
    `{"match_percentage":<int 0-100>,"matched_skills":[<strings>],"missing_skills":[<strings>],"recommendations":[{"skill":<str>,"reason":<str>,"resource":<str>}],"summary":<str>}\n` +
    `IMPORTANT: recommendations MUST contain 3 to 5 objects picked from missing_skills. Each object needs skill, reason, and resource fields.\n` +
    `matched_skills=skills in both; missing_skills=job skills absent from resume; summary=2 sentences.\n\n` +
    `RESUME:\n${resume}\n\nJOB:\n${job}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helper — uses Node's http.request (no fetch, no AbortSignal)
// Avoids the Node 24 AbortSignal.timeout() premature-abort bug on Windows.
// ─────────────────────────────────────────────────────────────────────────────
function httpPost(path, payload) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);

    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port:     OLLAMA_PORT,
        path,
        method:   "POST",
        headers:  {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Ollama HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
          resolve(raw);
        });
      }
    );

    // Manual timeout via setTimeout — avoids AbortSignal bug
    const timer = setTimeout(() => {
      req.destroy(new Error(`Ollama request timed out after ${OLLAMA_TIMEOUT_MS / 1000}s`));
    }, OLLAMA_TIMEOUT_MS);

    req.on("response", () => clearTimeout(timer));
    req.on("error",    (e) => { clearTimeout(timer); reject(e); });
    req.on("close",    ()  => clearTimeout(timer));

    req.write(bodyStr);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Ollama  /api/generate  with  format:"json"
// ─────────────────────────────────────────────────────────────────────────────
async function callOllama(resumeText, jobDescription) {
  const rawStr = await httpPost("/api/generate", {
    model:   OLLAMA_MODEL,
    prompt:  buildPrompt(resumeText, jobDescription),
    format:  "json",   // forces Ollama to emit valid JSON tokens
    stream:  false,
    options: { temperature: 0, num_predict: 700 },
  });

  const envelope = JSON.parse(rawStr);          // outer Ollama envelope
  const content  = envelope?.response?.trim();  // the model's actual output

  if (!content) throw new Error("Ollama returned empty response field");
  return content;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON extraction — handles clean JSON, markdown fences, preamble text
// ─────────────────────────────────────────────────────────────────────────────
function extractJSON(raw) {
  if (!raw) return null;

  // 1. Direct parse (ideal — what format:json produces)
  try { return JSON.parse(raw); } catch { /* fall through */ }

  // 2. Strip ```json … ``` fences
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m,        "")
    .trim();
  try { return JSON.parse(stripped); } catch { /* fall through */ }

  // 3. Find the first { … last } and parse that slice
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) {
    try { return JSON.parse(raw.slice(s, e + 1)); } catch { /* fall through */ }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalise — accepts both snake_case and camelCase keys from the model,
// maps to the canonical shape the frontend reads.
// ─────────────────────────────────────────────────────────────────────────────
function normalise(obj) {
  const pct      = obj.match_percentage  ?? obj.matchPercentage  ?? 0;
  const matched  = obj.matched_skills    ?? obj.matchingSkills   ?? [];
  const missing  = obj.missing_skills    ?? obj.missingSkills    ?? [];
  const recos    = obj.recommendations   ?? [];
  const summary  = obj.summary ?? "";

  let safeRecos = (Array.isArray(recos) ? recos : [])
    .filter(r => r && typeof r === "object" && r.skill)
    .map(r => ({
      skill:    String(r.skill    || r.name   || ""),
      reason:   String(r.reason   || r.why    || ""),
      resource: String(r.resource || r.link   || ""),
    }));

  // If model returned no recommendations, generate them from missing_skills.
  // This makes the report useful even when the model skips that field.
  if (safeRecos.length === 0 && Array.isArray(missing) && missing.length > 0) {
    safeRecos = missing.slice(0, 5).map(skill => ({
      skill:    String(skill),
      reason:   `"${skill}" is required by the job description but not present in your resume.`,
      resource: getResource(String(skill)),
    }));
  }

  // Guarantee at least 3 recommendations — pad with popular skills if still short
  if (safeRecos.length < 3) {
    const popular = ["TypeScript","Docker","PostgreSQL","AWS","Kubernetes","GraphQL","Redis","Jest"];
    const existing = new Set(safeRecos.map(r => r.skill.toLowerCase()));
    const matchedSet = new Set((Array.isArray(matched) ? matched : []).map(s => String(s).toLowerCase()));
    for (const skill of popular) {
      if (safeRecos.length >= 3) break;
      if (!existing.has(skill.toLowerCase()) && !matchedSet.has(skill.toLowerCase())) {
        safeRecos.push({
          skill,
          reason:   `"${skill}" is widely required for this type of role.`,
          resource: getResource(skill),
        });
        existing.add(skill.toLowerCase());
      }
    }
  }

  return {
    match_percentage: Math.max(0, Math.min(100, Math.round(Number(pct) || 0))),
    matched_skills:   Array.isArray(matched) ? matched.map(String) : [],
    missing_skills:   Array.isArray(missing) ? missing.map(String) : [],
    recommendations:  safeRecos,
    summary:          String(summary),
  };
}

function isUsable(report) {
  return (
    typeof report.match_percentage === "number" &&
    Array.isArray(report.matched_skills)         &&
    Array.isArray(report.missing_skills)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic fallback analyser
// Runs entirely in-process — no network, no model, always succeeds.
// ─────────────────────────────────────────────────────────────────────────────

/** Free learning resources keyed by skill name (lowercase). */
const RESOURCES = {
  typescript:       "TypeScript Handbook – typescriptlang.org/docs",
  docker:           "Docker Getting Started – docs.docker.com/get-started",
  kubernetes:       "Kubernetes Basics – kubernetes.io/docs/tutorials",
  postgresql:       "PostgreSQL Tutorial – postgresqltutorial.com",
  mysql:            "MySQL Tutorial – mysqltutorial.org",
  mongodb:          "MongoDB University – learn.mongodb.com",
  redis:            "Redis University – university.redis.io",
  aws:              "AWS Skill Builder – skillbuilder.aws (free tier)",
  gcp:              "Google Cloud Skills Boost – cloudskillsboost.google",
  azure:            "Microsoft Learn – learn.microsoft.com/azure",
  react:            "React Docs – react.dev/learn",
  vue:              "Vue.js Guide – vuejs.org/guide",
  angular:          "Angular Tutorial – angular.io/tutorial",
  "next.js":        "Next.js Learn – nextjs.org/learn",
  graphql:          "GraphQL Tutorial – graphql.org/learn",
  "node.js":        "Node.js Docs – nodejs.org/en/learn",
  python:           "Python Tutorial – docs.python.org/3/tutorial",
  django:           "Django Tutorial – docs.djangoproject.com",
  flask:            "Flask Quickstart – flask.palletsprojects.com",
  git:              "Git Book – git-scm.com/book",
  "github actions": "GitHub Actions Docs – docs.github.com/actions",
  jest:             "Jest Docs – jestjs.io/docs/getting-started",
  cypress:          "Cypress Docs – docs.cypress.io",
  "machine learning":"ML Crash Course – developers.google.com/machine-learning",
  terraform:        "Terraform Learn – developer.hashicorp.com/terraform/tutorials",
  linux:            "Linux Journey – linuxjourney.com",
  "ci/cd":          "CI/CD Guide – atlassian.com/continuous-delivery",
  "rest apis":      "REST API Tutorial – restfulapi.net",
};

function getResource(skill) {
  return RESOURCES[skill.toLowerCase()] || `Search: "${skill} tutorial free" on freeCodeCamp or YouTube`;
}

/**
 * Extract skills from a block of text by matching against SKILL_LIST.
 * Returns a Set of matched skill names (preserving original casing from list).
 */
function extractSkills(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const skill of SKILL_LIST) {
    // Word-boundary match: skill must not be part of a longer word
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "i");
    if (re.test(lower)) found.add(skill);
  }
  return found;
}

/**
 * The deterministic fallback. Always returns a valid report.
 */
function deterministicAnalysis(resumeText, jobDescription) {
  console.log("[analyzer] Running deterministic fallback...");

  const resumeSkills = extractSkills(resumeText);
  const jobSkills    = extractSkills(jobDescription);

  const matched = [...jobSkills].filter(s => resumeSkills.has(s));
  const missing = [...jobSkills].filter(s => !resumeSkills.has(s));

  // Also capture skills in resume not mentioned in job (extra skills)
  const bonus = [...resumeSkills].filter(s => !jobSkills.has(s));

  // Percentage: matched job skills / total job skills
  const pct = jobSkills.size === 0
    ? 0
    : Math.round((matched.length / jobSkills.size) * 100);

  // Pick 3-5 recommendations from missing skills
  const recoSkills = missing.slice(0, 5);
  const recommendations = recoSkills.map(skill => ({
    skill,
    reason:   `"${skill}" is listed as a requirement in the job description and is not present in your resume.`,
    resource: getResource(skill),
  }));

  // If fewer than 3 recos, pad with popular skills not already matched
  if (recommendations.length < 3) {
    const popular = ["TypeScript","Docker","PostgreSQL","AWS","Kubernetes","GraphQL","Redis"];
    for (const skill of popular) {
      if (recommendations.length >= 3) break;
      if (!matched.includes(skill) && !recoSkills.includes(skill)) {
        recommendations.push({
          skill,
          reason:   `"${skill}" is a widely requested skill for this type of role.`,
          resource: getResource(skill),
        });
      }
    }
  }

  const summaryParts = [];
  if (matched.length > 0) {
    summaryParts.push(`Your resume matches ${matched.length} of the ${jobSkills.size} skills identified in the job description (${pct}% match).`);
  } else {
    summaryParts.push(`No direct skill overlap was detected between your resume and the job description.`);
  }
  if (missing.length > 0) {
    summaryParts.push(`Focus on building: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ", and more" : ""}.`);
  } else {
    summaryParts.push("You appear to have all the listed skills — tailor your resume language to the job posting.");
  }

  const report = {
    match_percentage: pct,
    matched_skills:   matched,
    missing_skills:   missing,
    recommendations,
    summary:          summaryParts.join(" "),
    _source:          "fallback", // internal flag — not shown in UI
  };

  console.log(
    `[analyzer] Fallback complete — ${pct}% match, ` +
    `${matched.length} matched, ${missing.length} missing`
  );
  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyzes the skill gap between a resume and a job description.
 *
 * Always returns a usable report — never throws a user-visible error.
 *
 * @param {string} resumeText
 * @param {string} jobDescription
 * @returns {Promise<object>} SkillGapReport
 */
async function analyzeSkillGap(resumeText, jobDescription) {
  // ── Attempt 1: Ollama ─────────────────────────────────────────────────────
  let ollamaReport = null;

  try {
    console.log(`[analyzer] Calling Ollama (${OLLAMA_MODEL})...`);
    const rawContent = await callOllama(resumeText, jobDescription);
    console.log("[analyzer] Ollama raw (first 150):", rawContent.slice(0, 150));

    const parsed = extractJSON(rawContent);
    if (parsed) {
      const report = normalise(parsed);
      if (isUsable(report)) {
        ollamaReport = report;
        console.log(
          `[analyzer] Ollama OK — ${report.match_percentage}% match, ` +
          `${report.matched_skills.length} matched, ${report.missing_skills.length} missing`
        );
      } else {
        console.warn("[analyzer] Ollama JSON missing required fields — using fallback");
      }
    } else {
      console.warn("[analyzer] Could not parse Ollama response — using fallback");
    }
  } catch (err) {
    // Give a clear console message but do NOT throw — fallback handles it
    if (
      err.message?.includes("ECONNREFUSED") ||
      err.code === "ECONNREFUSED"
    ) {
      console.warn(
        `[analyzer] Ollama not reachable at ${OLLAMA_HOST}:${OLLAMA_PORT}. ` +
        "Running deterministic fallback."
      );
    } else {
      console.warn("[analyzer] Ollama error:", err.message, "— using fallback");
    }
  }

  // ── Fallback (always available) ───────────────────────────────────────────
  if (ollamaReport) return ollamaReport;
  return deterministicAnalysis(resumeText, jobDescription);
}

module.exports = { analyzeSkillGap };
