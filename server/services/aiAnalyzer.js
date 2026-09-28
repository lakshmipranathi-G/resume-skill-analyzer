"use strict";

const https = require("https");

// ======================================================
// GEMINI CONFIGURATION
// ======================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const GEMINI_HOST = "generativelanguage.googleapis.com";
const GEMINI_TIMEOUT_MS = 90000;

// ======================================================
// SKILL LIST
// ======================================================

const SKILL_LIST = [
  "Python",
  "Java",
  "JavaScript",
  "TypeScript",
  "C",
  "C++",
  "C#",
  "HTML",
  "CSS",
  "React",
  "Angular",
  "Vue",
  "Node.js",
  "Express",
  "SQL",
  "MySQL",
  "PostgreSQL",
  "MongoDB",
  "Oracle",
  "Artificial Intelligence",
  "Machine Learning",
  "Deep Learning",
  "Natural Language Processing",
  "Computer Vision",
  "TensorFlow",
  "PyTorch",
  "Scikit-learn",
  "Keras",
  "Data Analysis",
  "Data Science",
  "Pandas",
  "NumPy",
  "Matplotlib",
  "Power BI",
  "Tableau",
  "Excel",
  "AWS",
  "Azure",
  "Google Cloud",
  "Docker",
  "Kubernetes",
  "Git",
  "GitHub",
  "REST API",
  "API",
  "Problem Solving",
  "Communication",
  "Leadership",
  "Teamwork",
  "Agile",
  "Scrum"
];

// ======================================================
// TEXT HELPER
// ======================================================

function condense(text, maxChars) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  return cleaned.slice(0, maxChars) + "...";
}

// ======================================================
// GEMINI PROMPT
// ======================================================

function buildPrompt(resumeText, jobDescription) {
  return `
You are a professional resume and job matching assistant.

Compare the RESUME with the JOB DESCRIPTION.

Rules:
1. matched_skills must contain skills clearly present in both.
2. missing_skills must contain job-required skills not clearly present in the resume.
3. Do not invent skills.
4. match_percentage must be an integer from 0 to 100.
5. recommendations must contain 3 to 5 useful recommendations.
6. Each recommendation must contain skill, reason, and resource.
7. summary must contain exactly 2 sentences.
8. Return ONLY valid JSON.
9. Do not use markdown.
10. Do not add any text outside the JSON.

Return this structure:

{
  "match_percentage": 75,
  "matched_skills": ["Python", "SQL"],
  "missing_skills": ["Deep Learning"],
  "recommendations": [
    {
      "skill": "Deep Learning",
      "reason": "This skill is required by the job but is not clearly shown in the resume.",
      "resource": "Learn neural networks and deep learning fundamentals."
    }
  ],
  "summary": "The candidate has relevant skills for this role. Developing the missing skills can improve alignment with the job."
}

RESUME:
${condense(resumeText, 1500)}

JOB DESCRIPTION:
${condense(jobDescription, 1500)}
`;
}

// ======================================================
// HTTPS REQUEST
// ======================================================

function httpsPost(path, payload) {
  return new Promise((resolve, reject) => {
    if (!GEMINI_API_KEY) {
      reject(new Error("GEMINI_API_KEY is not configured"));
      return;
    }

    const body = JSON.stringify(payload);

    const request = https.request(
      {
        hostname: GEMINI_HOST,
        path: path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "x-goog-api-key": GEMINI_API_KEY
        }
      },
      (response) => {
        let data = "";

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          if (
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            reject(
              new Error(
                `Gemini HTTP ${response.statusCode}: ${data.slice(0, 500)}`
              )
            );
            return;
          }

          resolve(data);
        });
      }
    );

    const timer = setTimeout(() => {
      request.destroy(
        new Error(
          "Gemini request timed out after 90 seconds"
        )
      );
    }, GEMINI_TIMEOUT_MS);

    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    request.on("close", () => {
      clearTimeout(timer);
    });

    request.write(body);
    request.end();
  });
}

// ======================================================
// CALL GEMINI
// ======================================================

async function callGemini(resumeText, jobDescription) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const responseSchema = {
    type: "OBJECT",

    properties: {
      match_percentage: {
        type: "INTEGER"
      },

      matched_skills: {
        type: "ARRAY",
        items: {
          type: "STRING"
        }
      },

      missing_skills: {
        type: "ARRAY",
        items: {
          type: "STRING"
        }
      },

      recommendations: {
        type: "ARRAY",
        items: {
          type: "OBJECT",

          properties: {
            skill: {
              type: "STRING"
            },

            reason: {
              type: "STRING"
            },

            resource: {
              type: "STRING"
            }
          },

          required: [
            "skill",
            "reason",
            "resource"
          ]
        }
      },

      summary: {
        type: "STRING"
      }
    },

    required: [
      "match_percentage",
      "matched_skills",
      "missing_skills",
      "recommendations",
      "summary"
    ]
  };

  const payload = {
    contents: [
      {
        parts: [
          {
            text: buildPrompt(
              resumeText,
              jobDescription
            )
          }
        ]
      }
    ],

    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  };

  const path =
    `/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const rawResponse = await httpsPost(
    path,
    payload
  );

  const responseData = JSON.parse(rawResponse);

  const result =
    responseData
      ?.candidates?.[0]
      ?.content?.parts?.[0]
      ?.text
      ?.trim();

  if (!result) {
    throw new Error(
      "Gemini returned an empty response"
    );
  }

  return result;
}

// ======================================================
// EXTRACT JSON
// ======================================================

function extractJSON(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    // Try extracting JSON from surrounding text
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1) {
    return null;
  }

  try {
    return JSON.parse(
      text.slice(start, end + 1)
    );
  } catch (error) {
    return null;
  }
}

// ======================================================
// NORMALISE RESULT
// ======================================================

function normalise(report) {
  const percentage =
    Number(report?.match_percentage);

  return {
    match_percentage:
      Number.isFinite(percentage)
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(percentage)
            )
          )
        : 0,

    matched_skills:
      Array.isArray(report?.matched_skills)
        ? report.matched_skills
            .map(String)
            .map((skill) => skill.trim())
            .filter(Boolean)
        : [],

    missing_skills:
      Array.isArray(report?.missing_skills)
        ? report.missing_skills
            .map(String)
            .map((skill) => skill.trim())
            .filter(Boolean)
        : [],

    recommendations:
      Array.isArray(report?.recommendations)
        ? report.recommendations
            .map((item) => ({
              skill: String(
                item?.skill || ""
              ).trim(),

              reason: String(
                item?.reason || ""
              ).trim(),

              resource: String(
                item?.resource || ""
              ).trim()
            }))
            .filter(
              (item) =>
                item.skill &&
                item.reason &&
                item.resource
            )
        : [],

    summary: String(
      report?.summary || ""
    ).trim()
  };
}

// ======================================================
// CHECK RESULT
// ======================================================

function isUsable(report) {
  return Boolean(
    report &&
    Number.isFinite(
      report.match_percentage
    ) &&
    Array.isArray(
      report.matched_skills
    ) &&
    Array.isArray(
      report.missing_skills
    ) &&
    Array.isArray(
      report.recommendations
    ) &&
    report.summary
  );
}

// ======================================================
// FALLBACK RESOURCES
// ======================================================

const RESOURCES = {
  Python:
    "Practice Python fundamentals, data structures, functions, and problem solving.",

  Java:
    "Learn Java syntax, OOP, collections, and exception handling.",

  JavaScript:
    "Practice modern JavaScript, DOM, and ES6+ features.",

  SQL:
    "Practice SELECT, JOIN, GROUP BY, subqueries, and aggregate functions.",

  MySQL:
    "Practice database design, SQL queries, joins, indexes, and transactions.",

  "Machine Learning":
    "Learn supervised learning, unsupervised learning, model evaluation, and feature engineering.",

  "Deep Learning":
    "Learn neural networks, backpropagation, CNNs, and deep learning workflows.",

  "Data Analysis":
    "Practice data cleaning, exploratory analysis, visualization, and interpretation.",

  Pandas:
    "Practice loading, cleaning, filtering, transforming, and analyzing datasets with Pandas.",

  NumPy:
    "Practice arrays, indexing, vectorized operations, and numerical computing with NumPy.",

  Git:
    "Practice commits, branches, merging, and GitHub workflows.",

  React:
    "Learn components, props, state, hooks, and React application development.",

  "Problem Solving":
    "Practice algorithms and data structures through coding problems.",

  Communication:
    "Improve technical communication through presentations, documentation, and discussions.",

  "Artificial Intelligence":
    "Learn AI fundamentals, machine learning, reasoning, and intelligent systems.",

  "Computer Vision":
    "Learn image processing, CNNs, and computer vision applications.",

  "Natural Language Processing":
    "Learn text preprocessing, embeddings, classification, and NLP."
};

function getResource(skill) {
  return (
    RESOURCES[skill] ||
    `Build practical projects and complete hands-on exercises to develop ${skill}.`
  );
}

// ======================================================
// EXTRACT SKILLS FOR FALLBACK
// ======================================================

function extractSkills(text) {
  const lowerText =
    String(text || "").toLowerCase();

  return SKILL_LIST.filter(
    (skill) =>
      lowerText.includes(
        skill.toLowerCase()
      )
  );
}

// ======================================================
// FALLBACK ANALYSIS
// ======================================================

function deterministicAnalysis(
  resumeText,
  jobDescription
) {
  const resumeSkills =
    extractSkills(resumeText);

  const jobSkills =
    extractSkills(jobDescription);

  const resumeSkillSet =
    new Set(
      resumeSkills.map(
        (skill) =>
          skill.toLowerCase()
      )
    );

  const matchedSkills =
    jobSkills.filter(
      (skill) =>
        resumeSkillSet.has(
          skill.toLowerCase()
        )
    );

  const missingSkills =
    jobSkills.filter(
      (skill) =>
        !resumeSkillSet.has(
          skill.toLowerCase()
        )
    );

  let matchPercentage = 0;

  if (jobSkills.length > 0) {
    matchPercentage =
      Math.round(
        (matchedSkills.length /
          jobSkills.length) *
          100
      );
  }

  const recommendations =
    missingSkills
      .slice(0, 5)
      .map((skill) => ({
        skill: skill,

        reason:
          `The job description mentions ${skill}, but it is not clearly shown in the resume.`,

        resource:
          getResource(skill)
      }));

  const extraSkills = [
    "Machine Learning",
    "SQL",
    "Python",
    "Git",
    "Problem Solving"
  ];

  for (const skill of extraSkills) {
    if (
      recommendations.length >= 3
    ) {
      break;
    }

    const alreadyExists =
      recommendations.some(
        (item) =>
          item.skill.toLowerCase() ===
          skill.toLowerCase()
      );

    if (!alreadyExists) {
      recommendations.push({
        skill: skill,

        reason:
          `Developing ${skill} can strengthen the candidate's technical profile.`,

        resource:
          getResource(skill)
      });
    }
  }

  const summary =
    matchedSkills.length > 0
      ? `The resume demonstrates ${matchedSkills.length} skill(s) that match the job requirements. Developing the missing skills can improve alignment with the role.`
      : `The resume does not clearly show many of the skills required by the job. Developing the required skills can improve alignment with the role.`;

  return {
    match_percentage:
      matchPercentage,

    matched_skills:
      matchedSkills,

    missing_skills:
      missingSkills,

    recommendations:
      recommendations,

    summary:
      summary,

    _source:
      "fallback"
  };
}

// ======================================================
// MAIN ANALYZER
// ======================================================

async function analyzeSkillGap(
  resumeText,
  jobDescription
) {
  try {
    console.log(
      `[analyzer] Calling Gemini (${GEMINI_MODEL})...`
    );

    const rawContent =
      await callGemini(
        resumeText,
        jobDescription
      );

    console.log(
      "[analyzer] Gemini raw response:",
      rawContent.slice(0, 200)
    );

    const parsed =
      extractJSON(rawContent);

    if (parsed) {
      const report =
        normalise(parsed);

      if (isUsable(report)) {
        console.log(
          `[analyzer] Gemini OK — ${report.match_percentage}% match, ` +
          `${report.matched_skills.length} matched, ` +
          `${report.missing_skills.length} missing`
        );

        return report;
      }
    }

    console.warn(
      "[analyzer] Gemini response was not usable — using fallback"
    );
  } catch (error) {
    console.warn(
      "[analyzer] Gemini error:",
      error.message,
      "— using fallback"
    );
  }

  return deterministicAnalysis(
    resumeText,
    jobDescription
  );
}

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  analyzeSkillGap
};