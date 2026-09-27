/**
 * test-pipeline.js
 * Run with: node test-pipeline.js
 * Tests the full flow: PDF -> text extraction -> Ollama/fallback -> report validation
 */
"use strict";

const { extractTextFromPDF } = require("./server/services/pdfExtractor");
const { analyzeSkillGap }    = require("./server/services/aiAnalyzer");
const fs   = require("fs");
const path = require("path");

const pdfPath = path.resolve("./samples/sample-resume.pdf");
const jdPath  = path.resolve("./samples/sample-job-description.txt");

if (!fs.existsSync(pdfPath)) {
  console.error("ERROR: samples/sample-resume.pdf not found. Run: node samples/create-sample-pdf.js");
  process.exit(1);
}

const jd = fs.readFileSync(jdPath, "utf8");

console.log("═══════════════════════════════════════════");
console.log("  Resume Skill Gap Analyzer — Pipeline Test");
console.log("═══════════════════════════════════════════\n");

console.log("STEP 1: Extracting PDF text...");
extractTextFromPDF(pdfPath)
  .then((text) => {
    console.log(`  ✔ Extracted ${text.length} characters`);
    console.log(`  Preview: ${text.slice(0, 80).replace(/\n/g, " ")}...\n`);

    console.log("STEP 2: Running analysis (Ollama → fallback if needed)...");
    return analyzeSkillGap(text, jd);
  })
  .then((report) => {
    console.log("\n─── REPORT ────────────────────────────────");

    // Validate required fields
    const checks = [
      ["match_percentage is a number",    typeof report.match_percentage === "number"],
      ["match_percentage 0-100",          report.match_percentage >= 0 && report.match_percentage <= 100],
      ["matched_skills is array",         Array.isArray(report.matched_skills)],
      ["missing_skills is array",         Array.isArray(report.missing_skills)],
      ["recommendations is array",        Array.isArray(report.recommendations)],
      ["recommendations has items",       report.recommendations.length > 0],
      ["first reco has skill field",      !!report.recommendations[0]?.skill],
      ["first reco has reason field",     !!report.recommendations[0]?.reason],
      ["first reco has resource field",   !!report.recommendations[0]?.resource],
      ["summary is a string",             typeof report.summary === "string"],
      ["summary is non-empty",            report.summary.length > 0],
    ];

    let allPassed = true;
    for (const [label, ok] of checks) {
      console.log(`  ${ok ? "✔" : "✘"} ${label}`);
      if (!ok) allPassed = false;
    }

    console.log("\n─── VALUES ─────────────────────────────────");
    console.log(`  match_percentage : ${report.match_percentage}%`);
    console.log(`  matched_skills   : ${JSON.stringify(report.matched_skills)}`);
    console.log(`  missing_skills   : ${JSON.stringify(report.missing_skills.slice(0, 5))}${report.missing_skills.length > 5 ? "…" : ""}`);
    console.log(`  recommendations  : ${report.recommendations.length} items`);
    report.recommendations.forEach((r, i) => {
      console.log(`    [${i + 1}] ${r.skill}`);
      console.log(`        reason  : ${r.reason.slice(0, 80)}`);
      console.log(`        resource: ${r.resource.slice(0, 80)}`);
    });
    console.log(`  summary          : ${report.summary.slice(0, 120)}`);
    console.log(`  source           : ${report._source || "ollama"}`);

    console.log("\n═══════════════════════════════════════════");
    if (allPassed) {
      console.log("  ALL CHECKS PASSED ✔  App is ready.");
    } else {
      console.log("  SOME CHECKS FAILED ✘  See above.");
      process.exitCode = 1;
    }
    console.log("═══════════════════════════════════════════\n");
  })
  .catch((err) => {
    console.error("\nPIPELINE FAILED:", err.message);
    process.exitCode = 1;
  });
