const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
require("dotenv").config();

const app = express();
const port = 3000;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: message }],
      model: "llama-3.3-70b-versatile",
    });
    res.json({ reply: response.choices[0]?.message?.content || "No response" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debate Argument Checker endpoint
app.post("/checkargument", async (req, res) => {
  try {
    const { argument } = req.body;
    if (!argument) return res.json({ error: "Please provide an argument." });

    const prompt = `Evaluate the following debate argument for its logic, evidence, and persuasiveness.
Return your evaluation as a valid JSON object with exactly two keys:
  "rating": an integer between 1 and 5 (1 means "very bad argument" and 5 means "excellent argument"),
  "explanation": a brief explanation of your rating.
Return ONLY the JSON object with no additional text.
Argument: "${argument}"`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
    });
    const content = response.choices[0]?.message?.content || "";
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      result = { rating: 3, explanation: "Could not parse model response. Please try again." };
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DuckDuckGo Sources endpoint
const { JSDOM } = require("jsdom");

async function getDuckDuckGoSources(query) {
  try {
    const duckDuckGoUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const response = await fetch(duckDuckGoUrl);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const allLinks = Array.from(document.querySelectorAll("a"));
    const filteredLinks = allLinks.filter(link => link.href && link.href.includes("uddg="));
    const sources = filteredLinks.slice(0, 5).map(link => {
      const base = "https://lite.duckduckgo.com";
      const urlObj = new URL(link.href, base);
      const uddg = urlObj.searchParams.get("uddg");
      return {
        title: link.textContent.trim() || "No Title",
        url: uddg ? decodeURIComponent(uddg) : link.href
      };
    });
    return sources;
  } catch (error) {
    console.error("DuckDuckGo API Error:", error);
    return [];
  }
}

app.post("/searchsources", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.json({ error: "Please provide a search query." });
    const sources = await getDuckDuckGoSources(query);
    res.json({ sources });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Automatic Correction endpoint
app.post("/correct", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.json({ error: "Please provide text to correct." });
    // The prompt instructs the model to output only the corrected text with no extra comments.
    const prompt = `Correct the following text in any language. Provide only the corrected text, with no extra commentary.
Text: "${text}"`;
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
    });
    const corrected = response.choices[0]?.message?.content.trim() || "";
    res.json({ corrected });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html when visiting "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
