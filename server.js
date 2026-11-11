// Simple server: serves index.html and a small /api/ai endpoint that calls Gemini.
// Run:  GEMINI_API_KEY=your_key node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8000;
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const cut = (s, n) => String(s || "").slice(0, n);

function buildPrompt(task, d) {
  if (task === "summary") {
    return (
      "Write a resume objective of 2 to 3 sentences for this candidate. Professional tone, no first-person 'I', " +
      "do not invent facts, employers or numbers. Output only the objective text, no quotes, no markdown.\n" +
      `Name: ${cut(d.name, 80)}\nTarget role: ${cut(d.role, 80)}\nEducation: ${cut(d.education, 600)}\n` +
      `Experience: ${cut(d.experience, 800)}\nSkills: ${cut(d.skills, 300)}`
    );
  }
  if (task === "experience") {
    return (
      "Rewrite each line below as a concise professional resume bullet that starts with a strong action verb. " +
      "Keep every fact the same and do not invent numbers, tools or employers. " +
      "Output one bullet per line, in the same order, with no bullet symbols and no markdown.\n" +
      cut(d.text, 1500)
    );
  }
  if (task === "skills") {
    return (
      `List 10 skills that suit a ${cut(d.role, 80)} resume. Keep these current skills if relevant: ${cut(d.current, 300)}. ` +
      "Output only one comma-separated line, no numbering, no markdown."
    );
  }
  return null;
}

async function askGemini(prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      (data.error && data.error.message) || "Gemini error " + r.status,
    );
  const parts =
    (data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts) ||
    [];
  const text = parts
    .map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("AI ne kuch nahi likha, dobara try karo");
  return text;
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/ai") {
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 20000) req.destroy();
      });
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json");
        try {
          if (!KEY) throw new Error("GEMINI_API_KEY set nahi hai");
          const { task, data } = JSON.parse(body || "{}");
          const prompt = buildPrompt(task, data || {});
          if (!prompt) throw new Error("Unknown task");
          res.end(JSON.stringify({ text: await askGemini(prompt) }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    if (
      req.method === "GET" &&
      (req.url === "/" || req.url.startsWith("/index.html"))
    ) {
      fs.readFile(path.join(__dirname, "index.html"), (err, buf) => {
        if (err) {
          res.statusCode = 404;
          return res.end("index.html not found");
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(buf);
      });
      return;
    }
    res.statusCode = 404;
    res.end("Not found");
  })
  .listen(PORT, () => console.log("Running on http://localhost:" + PORT));
