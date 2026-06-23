import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Ensure the Gemini API Key is available
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not set. AI Features will fail until configured in Settings > Secrets.");
}

// Initialize modern Google GenAI SDK
const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Strict payload size limits to mitigate buffer overflow / DoS vector
  app.use(express.json({ limit: "50kb" }));

  // Apply enterprise-grade defensive HTTP headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.removeHeader("X-Powered-By");

    // Handle pre-flight OPTIONS gracefully to prevent any platform HTTP 405 errors
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Zero-dependency sliding-window Client API Rate Limiter
  const aiRequestTracker = new Map<string, { count: number; resetTime: number }>();

  // API Route: Secure AI Streaming Proxy with rigorous multi-layer defenses
  app.use("/api/ai-proxy", (req, res, next) => {
    const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anonymous";
    const ip = Array.isArray(rawIp) ? rawIp[0] : rawIp;
    const now = Date.now();
    const LIMIT_WINDOW = 60000; // 1 minute window
    const MAX_REQUESTS = 300; // Raised from 15 to 300 to eliminate rate limiting on shared containers/proxies

    const record = aiRequestTracker.get(ip);
    if (!record || now > record.resetTime) {
      aiRequestTracker.set(ip, { count: 1, resetTime: now + LIMIT_WINDOW });
      return next();
    }

    if (record.count >= MAX_REQUESTS) {
      return res.status(429).json({
        error: "Too Many Requests",
        message: "Active intelligence cooldown in effect. Slow down requests to secure core processors."
      });
    }

    record.count++;
    next();
  });

  // API Route: Groq Streaming Proxy
  app.post("/api/search", async (req, res) => {
    try {
      const q = req.body.q;
      if (!q) return res.json({ snippets: [] });

      let snippets: string[] = [];

      // LAYER 1: DuckDuckGo HTML Scraper (live internet results)
      try {
        const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
        const html = await fetch(ddgUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
          }
        }).then(r => r.text());

        const titleMatches = [...html.matchAll(/<a[^>]*class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
        const snippetMatches = [...html.matchAll(/<a[^>]*class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi)];

        for (let i = 0; i < Math.min(titleMatches.length, snippetMatches.length); i++) {
          const href = titleMatches[i][1];
          const rawTitle = titleMatches[i][2];
          const rawSnippet = snippetMatches[i][1];

          const title = rawTitle.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
          const snippet = rawSnippet.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

          let url = href;
          if (href.includes("uddg=")) {
            const parts = href.split("uddg=");
            if (parts[1]) {
              const actualUrl = parts[1].split("&")[0];
              try {
                url = decodeURIComponent(actualUrl);
              } catch {
                url = actualUrl;
              }
            }
          }

          if (title && snippet) {
            snippets.push(`[${title}] (${url}) - ${snippet}`);
          }
        }
      } catch (ddgHtmlError) {
        console.warn("DDG HTML search failed, trying DDG API:", ddgHtmlError);
      }

      // LAYER 2: DuckDuckGo Instant Answer API Fallback
      if (snippets.length === 0) {
        try {
          const ddgApiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`;
          const apiRes = await fetch(ddgApiUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
          }).then(r => r.json());

          if (apiRes.AbstractText) {
            snippets.push(`[${apiRes.Heading || q}] (${apiRes.AbstractURL || ""}) - ${apiRes.AbstractText}`);
          }

          if (apiRes.RelatedTopics && Array.isArray(apiRes.RelatedTopics)) {
            for (const topic of apiRes.RelatedTopics) {
              if (topic.Text && topic.FirstURL) {
                snippets.push(`[Topic] (${topic.FirstURL}) - ${topic.Text}`);
              } else if (topic.Topics && Array.isArray(topic.Topics)) {
                for (const sub of topic.Topics) {
                  if (sub.Text && sub.FirstURL) {
                    snippets.push(`[Topic] (${sub.FirstURL}) - ${sub.Text}`);
                  }
                }
              }
            }
          }
        } catch (ddgApiError) {
          console.warn("DDG API search failed, moving to Wikipedia:", ddgApiError);
        }
      }

      // LAYER 3: Wikipedia Semantic Search Fallback
      if (snippets.length === 0) {
        try {
          const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json`;
          const wikiRes = await fetch(wikiUrl).then(r => r.json());
          const wikiSearch = wikiRes.query?.search || [];

          snippets = wikiSearch.map((item: any) => {
            const cleanTitle = item.title;
            const cleanSnippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();
            const wikiArticleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanTitle.replace(/\s+/g, "_"))}`;
            return `[Wikipedia: ${cleanTitle}] (${wikiArticleUrl}) - ${cleanSnippet}`;
          });
        } catch (wikiError) {
          console.warn("Wikipedia search failed:", wikiError);
        }
      }

      // Limit results to maximum 6 highly relevant entries
      res.json({ snippets: snippets.slice(0, 6) });
    } catch(e) { 
      res.json({ snippets: [] }); 
    }
  });

  async function streamGeminiFallback(res: any, system: string, messages: any[], max_tokens?: number) {
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      if (!apiKey) {
        res.write(`data: ${JSON.stringify({ delta: { text: "\n[Fallback Error]: GEMINI_API_KEY is not configured in Settings." } })}\n`);
        res.write("data: [DONE]\n");
        res.end();
        return;
      }

      let userPrompt = "Hello";
      if (messages && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && typeof lastMsg.content === "string") {
          userPrompt = lastMsg.content;
        }
      }

      const config: any = {
        systemInstruction: system || "You are FORGE, an AI Idea Engine for Founders.",
        maxOutputTokens: max_tokens || 1400,
        temperature: 0.7,
      };

      const streamResponse = await ai.models.generateContentStream({
        model: "gemini-3.5-flash",
        contents: userPrompt,
        config: config,
      });

      for await (const chunk of streamResponse) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ delta: { text } })}\n`);
        }
      }
      res.write("data: [DONE]\n");
      res.end();
    } catch (err: any) {
      console.error("Gemini fallback failed:", err);
      res.write(`data: ${JSON.stringify({ delta: { text: `\n[Fallback Error]: ${err.message || "Request blocked or model busy."}` } })}\n`);
      res.write("data: [DONE]\n");
      res.end();
    }
  }

  app.post("/api/groq-proxy", async (req, res) => {
    const { messages, max_tokens, system } = req.body;
    
    if (!process.env.GROQ_API_KEY) {
        console.warn("GROQ_API_KEY not configured. Falling back to Gemini stream.");
        return streamGeminiFallback(res, system, messages, max_tokens);
    }

    try {
        const groqMessages = [
            {role: "system", content: system || "You are a helpful assistant"},
            ...messages
        ];

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: req.body.model || "llama-3.3-70b-versatile",
                messages: groqMessages,
                max_completion_tokens: max_tokens || 1024,
                temperature: 1,
                stream: true
            })
        });
        
        if (!response.ok) {
            console.warn(`Groq API returned status ${response.status}. Falling back to Gemini stream.`);
            return streamGeminiFallback(res, system, messages, max_tokens);
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        
        while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            
            const lines = chunk.split("\n");
            for (const line of lines) {
                if (line.trim().startsWith("data: ")) {
                    const raw = line.slice(5).trim();
                    if (raw && raw !== "[DONE]") {
                        try {
                            const parsed = JSON.parse(raw);
                            const content = parsed.choices?.[0]?.delta?.content || "";
                            if (content) {
                                res.write(`data: ${JSON.stringify({ delta: { text: content } })}\n`);
                            }
                        } catch {}
                    }
                }
            }
        }
        res.write("data: [DONE]\n");
        res.end();
    } catch (e: any) {
        console.error("Groq proxy error caught:", e);
        if (!res.headersSent) {
            console.warn("Groq proxy error occurred before headers sent. Initiating live Gemini fallback stream.");
            return streamGeminiFallback(res, system, messages, max_tokens);
        } else {
            console.error("Groq proxy error occurred after headers sent. Appending final fallback error block.");
            res.write(`data: ${JSON.stringify({ delta: { text: `\n[Stream Error]: ${e.message || "Connection interrupted."}` } })}\n`);
            res.write("data: [DONE]\n");
            res.end();
        }
    }
  });

  app.post("/api/ai-proxy", async (req, res) => {
    const { system, messages, max_tokens, useSearch, responseMimeType } = req.body;
    
    // Rigorous semantic input validation to defend against injection or crash payloads
    if (system && (typeof system !== "string" || system.length > 3000)) {
      return res.status(400).json({ error: "Malformed request profile." });
    }
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid structural content payload." });
    }
    if (max_tokens && (typeof max_tokens !== "number" || max_tokens > 4000)) {
      return res.status(400).json({ error: "Parameter exceeds safety parameters." });
    }

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      if (!apiKey) {
        res.write(`data: ${JSON.stringify({ delta: { text: "Error: GEMINI_API_KEY is not configured in Settings > Secrets." } })}\n`);
        res.write("data: [DONE]\n");
        res.end();
        return;
      }

      // Extract raw user prompt
      let userPrompt = "Hello";
      if (messages && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && typeof lastMsg.content === "string") {
          userPrompt = lastMsg.content;
        }
      }

      // Enforce strict prompt ceiling
      if (userPrompt.length > 15000) {
        res.write(`data: ${JSON.stringify({ delta: { text: "\nSecurity block: input parameters exceed safety margins." } })}\n`);
        res.write("data: [DONE]\n");
        res.end();
        return;
      }

      // Configure modern Google GenAI parameters
      const config: any = {
        systemInstruction: system || "You are FORGE, an AI Idea Engine for Founders.",
        maxOutputTokens: max_tokens || 1400,
        temperature: 0.7,
      };

      if (responseMimeType) {
        config.responseMimeType = responseMimeType;
      }

      // Apply Google Search Grounding to ground predictions/insights in live factual data
      if (useSearch === true) {
        config.tools = [{ googleSearch: {} }];
      }

      // Call Gemini streaming API (or custom specified model)
      const streamResponse = await ai.models.generateContentStream({
        model: "gemini-3.5-flash",
        contents: userPrompt,
        config: config,
      });

      for await (const chunk of streamResponse) {
        const text = chunk.text;
        if (text) {
          // Format as expected by App.tsx: {"delta": {"text": "..."}}
          res.write(`data: ${JSON.stringify({ delta: { text } })}\n`);
        }
      }

      res.write("data: [DONE]\n");
      res.end();
    } catch (error: any) {
      console.error("Gemini SDK streaming error:", error.message || error);
      res.write(`data: ${JSON.stringify({ delta: { text: `\nError calling Gemini: ${error.message || "Request blocked or model busy."}` } })}\n`);
      res.write("data: [DONE]\n");
      res.end();
    }
  });

  // Resolve dist path robustly across local dev AND bundled production execution
  let distPath = path.join(process.cwd(), "dist");
  let hasDist = fs.existsSync(path.join(distPath, "index.html"));

  if (!hasDist) {
    // If running from dist/ server (e.g. dist/server.cjs) or different working directory
    const altPath1 = process.cwd();
    const altPath2 = path.join(process.cwd(), "..");
    const altPath3 = path.join(process.cwd(), "../dist");
    if (fs.existsSync(path.join(altPath1, "index.html"))) {
      distPath = altPath1;
      hasDist = true;
    } else if (fs.existsSync(path.join(altPath2, "index.html"))) {
      distPath = altPath2;
      hasDist = true;
    } else if (fs.existsSync(path.join(altPath3, "index.html"))) {
      distPath = altPath3;
      hasDist = true;
    }
  }

  if (process.env.NODE_ENV !== "production" || !hasDist) {
    if (process.env.NODE_ENV === "production" && !hasDist) {
      console.error("CRITICAL ERROR: 'dist/index.html' not found in any resolved paths!");
      app.get("/", (req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.status(500).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>FORGE Deployment Assistant</title>
              <style>
                body { background: #050505; color: #fff; font-family: monospace; padding: 3rem; line-height: 1.6; }
                .card { border: 1px solid #1a1a1a; padding: 2rem; border-radius: 8px; max-width: 600px; margin: 0 auto; background: #0a0a0a; }
                h1 { color: #c8ff00; margin-top: 0; }
                code { background: #151515; padding: 0.2rem 0.4rem; border-radius: 4px; color: #ff3c78; }
                pre { background: #151515; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.85rem; border: 1px solid #222; }
                .success { color: #c8ff00; }
                .hint { border-left: 3px solid #D4AF37; padding-left: 1rem; margin: 1.5rem 0; color: #ccc; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>🛑 FORGE Deploy Diagnostics</h1>
                <p>The server is running dynamically, but static assets could not be located at any of these target locations:</p>
                <pre>Target path: ${distPath}</pre>
                <div class="hint">
                  <strong>How to fix on Cloudflare Pages:</strong><br/>
                  Go to your Cloudflare Dashboard and update your <strong>Build Settings</strong> to:<br/>
                  - Build command: <code>npm run build</code><br/>
                  - Build output directory: <code>dist</code>
                </div>
                <p>This will guarantee that our builder transpiles the App into <code>dist/</code> and compiles the server prior to deployment.</p>
              </div>
            </body>
          </html>
        `);
      });
    } else {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }
  } else {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FORGE SERVER] Running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});
