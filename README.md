# Resume Skill Gap Analyzer

A beginner-friendly web app that compares your resume against a job description and generates an AI-powered skill-gap report — instantly, in your browser.

![App screenshot placeholder](https://via.placeholder.com/860x420?text=Resume+Skill+Gap+Analyzer+Dashboard)

---

## What It Does

1. You upload a **resume PDF** and paste a **job description**.
2. The server extracts your resume text and sends both to **OpenAI GPT-4o-mini**.
3. The AI returns a structured JSON report with:
   - ✅ Skills you already have
   - ❌ Skills you are missing
   - 📊 A match percentage score (0–100 %)
   - 💡 3–5 recommended skills to learn next, with free resources
4. Results are displayed in a clean, animated dashboard — no account needed.

---

## Project Structure

```
resume-skill-analyzer/
│
├── server/                     # Node.js / Express back-end
│   ├── index.js                # Entry point — starts the Express server
│   ├── routes/
│   │   └── analyze.js          # POST /api/analyze — handles upload & orchestrates analysis
│   └── services/
│       ├── pdfExtractor.js     # Reads a PDF buffer and returns plain text (pdf-parse)
│       └── aiAnalyzer.js       # Sends texts to OpenAI and parses the JSON report
│
├── public/                     # Static front-end (served by Express)
│   ├── index.html              # Single-page dashboard HTML
│   ├── styles.css              # All visual styling (responsive, CSS custom properties)
│   └── app.js                  # Client-side JS — drag-and-drop, fetch, results rendering
│
├── samples/                    # Sample input files for testing
│   ├── sample-resume.txt           # Plain-text version of the sample resume
│   ├── sample-job-description.txt  # Sample Full-Stack Engineer job posting
│   └── create-sample-pdf.js        # Helper script to generate sample-resume.pdf
│
├── uploads/                    # Temporary PDF uploads (auto-cleared after analysis)
│
├── .env.example                # Template for environment variables
├── .gitignore                  # Excludes .env, node_modules, uploads, etc.
├── package.json                # Dependencies and npm scripts
└── README.md                   # This file
```

---

## Quick Start

### Prerequisites

| Tool | Minimum version | Check with |
|------|----------------|-----------|
| Node.js | 18.x | `node -v` |
| npm | 9.x | `npm -v` |
| OpenAI API key | — | [platform.openai.com](https://platform.openai.com/api-keys) |

> **Cost note:** The app uses `gpt-4o-mini`, one of OpenAI's most affordable models. A typical analysis costs less than $0.01.

---

### Step 1 — Clone & install

```bash
git clone <your-repo-url>
cd resume-skill-analyzer
npm install
```

---

### Step 2 — Add your OpenAI API key

```bash
# Copy the template
cp .env.example .env    # Mac / Linux
copy .env.example .env  # Windows
```

Open `.env` and replace the placeholder:

```
OPENAI_API_KEY=sk-...your-real-key-here...
PORT=3000
```

⚠️ **Never commit `.env` to Git.** It is already listed in `.gitignore`.

---

### Step 3 — Start the server

```bash
npm start
```

You should see:

```
✅  Resume Skill Analyzer running at http://localhost:3000
```

For auto-restart during development:

```bash
npm run dev    # uses nodemon
```

---

### Step 4 — Open the app

Visit **http://localhost:3000** in your browser.

---

## Testing with Sample Files

The `samples/` folder contains ready-made inputs:

| File | Purpose |
|------|---------|
| `sample-resume.txt` | Alex Morgan's front-end developer resume |
| `sample-job-description.txt` | Full-Stack Engineer job posting at TechNova Inc. |

### Generate the sample PDF

The app only accepts PDFs. Run this once to create `sample-resume.pdf`:

```bash
npm install pdfkit --save-dev
node samples/create-sample-pdf.js
```

Then in the browser:
1. Upload `samples/sample-resume.pdf`
2. Paste the contents of `samples/sample-job-description.txt` into the job description box
3. Click **Analyze My Resume**

Expected result: ~50–65% match score, with TypeScript, PostgreSQL, Docker, and Redux listed as missing skills.

---

## How It Works (Flow Diagram)

```
Browser                     Express Server                OpenAI API
  │                               │                            │
  │── POST /api/analyze ─────────>│                            │
  │   (PDF + job description)     │                            │
  │                               │── pdf-parse ──> text       │
  │                               │── build prompt             │
  │                               │── chat.completions ───────>│
  │                               │                    JSON <──│
  │<── JSON report ───────────────│                            │
  │                               │── delete temp file         │
  │── render dashboard            │
```

---

## API Reference

### `POST /api/analyze`

**Request** (`multipart/form-data`):

| Field | Type | Description |
|-------|------|-------------|
| `resume` | File (PDF, ≤ 5 MB) | The candidate's resume |
| `jobDescription` | String (≥ 50 chars) | The job posting text |

**Success Response** (`200 OK`):

```json
{
  "matchPercentage": 58,
  "matchingSkills": ["JavaScript", "React", "Node.js", "Git", "REST APIs"],
  "missingSkills": ["TypeScript", "PostgreSQL", "Docker", "Redux", "Jest"],
  "recommendations": [
    {
      "skill": "TypeScript",
      "reason": "Required by the job and extends your existing JavaScript knowledge.",
      "resource": "TypeScript Handbook – typescriptlang.org/docs"
    }
  ],
  "summary": "Your resume shows strong front-end skills with React and Node.js basics. The main gaps are TypeScript, a relational database (PostgreSQL), and containerisation (Docker), which are all listed as requirements."
}
```

**Error Response** (`4xx / 5xx`):

```json
{ "error": "Human-readable error message." }
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ Yes | — | Your OpenAI secret key |
| `PORT` | No | `3000` | Port the server listens on |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `OPENAI_API_KEY is not set` | Create `.env` from `.env.example` and add your key |
| `Could not extract readable text` | The PDF may be a scanned image. Use a text-based PDF. |
| `Only PDF files are accepted` | Convert your resume to PDF before uploading. |
| Analysis returns unexpected JSON | The AI occasionally formats its response differently — retry. |
| `npm install` fails | Make sure you are running Node.js 18 or later (`node -v`). |

---

## Security Notes

- Uploaded files are deleted from the server immediately after analysis.
- Resume text is only sent to OpenAI for analysis — it is not logged or stored.
- API keys are read from environment variables and never exposed to the browser.

---

## License

MIT — free to use and modify.
