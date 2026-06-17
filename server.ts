import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";
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
    res.removeHeader("X-Powered-By");
    next();
  });

  // Zero-dependency sliding-window Client API Rate Limiter
  const aiRequestTracker = new Map<string, { count: number; resetTime: number }>();

  // API Route: Secure GEO Competitor Intelligence (Google Maps / Places simulation or Grounded AI)
  app.post("/api/market-places", async (req, res) => {
    const { city, niche } = req.body;
    if (!city || !niche) {
      return res.status(400).json({ error: "Missing parameters." });
    }
    try {
      if (!apiKey) {
        return res.status(500).json({ error: "AI provider not configured. Contact support." });
      }

      const sys = `Generate accurate or highly relevant competitor map data for a startup pitch mapping competitors in ${city} for the niche: "${niche}". Return ONLY a valid JSON object matching this schema:
      {
        "center": {"lat": number, "lng": number},
        "results": [
          {"id": "string", "name": "string", "lat": number, "lng": number, "description": "1 sentence description", "vulnerability": "1 key weakness", "strength": "1 key strength", "traffic": "High" | "Medium" | "Low"}
        ]
      }`;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Locate 4-6 competitors in or near ${city} offering "${niche}". Place their coordinates closely clustered around the center coordinates of ${city}. Return JSON only.`,
        config: { systemInstruction: sys, temperature: 0.2, responseMimeType: "application/json" }
      });
      const responseText = response.text || "";
      const cleanJson = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      res.json(JSON.parse(cleanJson));
    } catch (error: any) {
      console.error("Market places intelligence resolution failed:", error);
      res.status(500).json({ error: "Could not fetch geo-market indices." });
    }
  });

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
  app.post("/api/groq-proxy", async (req, res) => {
    const { messages, max_tokens, system } = req.body;
    
    if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({ error: "GROQ_API_KEY not configured" });
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
                model: "llama-3.3-70b-versatile",
                messages: groqMessages,
                max_completion_tokens: max_tokens || 1024,
                temperature: 1,
                stream: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`Groq API error ${response.status}`);
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
    } catch (e) {
        console.error("Groq proxy error:", e);
        res.status(500).json({ error: "Groq proxy error" });
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

      // Call Gemini 3.5 Flash streaming API (or custom specified model)
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
      console.error("Gemini SDK streaming error:", error);
      res.write(`data: ${JSON.stringify({ delta: { text: `\nError calling Gemini: Request blocked or model busy.` } })}\n`);
      res.write("data: [DONE]\n");
      res.end();
    }
  });

  // Resolve dist path robustly across local dev AND bundled production execution
  let distPath = path.join(process.cwd(), "dist");
  let hasDist = fs.existsSync(path.join(distPath, "index.html"));

  if (!hasDist) {
    // If running from dist/ server (e.g. dist/server.cjs) or different working directory
    const altPath1 = __dirname;
    const altPath2 = path.join(__dirname, "..");
    const altPath3 = path.join(__dirname, "../dist");
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
                  <strong>How to fix on Render:</strong><br/>
                  Go to your Render Dashboard settings and update your <strong>Build Command</strong> to:<br/>
                  <code>npm run build</code>
                </div>
                <p>This will guarantee that our builder transpiles the App into <code>dist/</code> and compiles the server into <code>dist/server.cjs</code> prior to launching <code>npm start</code>.</p>
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FORGE SERVER] Running at http://localhost:${PORT}`);
  });

  // Zero-dependency native WebSocket collaboration registry
  const wss = new WebSocketServer({ server });

  interface WSMessage {
    type: string;
    room?: string;
    name?: string;
    role?: string;
    text?: string;
    points?: any;
    x?: number;
    y?: number;
    swot?: any;
    blueprint?: any;
  }

  // Store active rooms and their client sockets
  const activeRooms = new Map<string, Set<WebSocket>>();
  // Track meta information of connected client sockets
  const clientRegistry = new Map<WebSocket, { room: string; name: string; role: string }>();

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (rawMessage) => {
      try {
        const payload: WSMessage = JSON.parse(rawMessage.toString());
        
        if (payload.type === "join") {
          const { room, name, role } = payload;
          if (room && name && role) {
            if (!activeRooms.has(room)) {
              activeRooms.set(room, new Set());
            }
            activeRooms.get(room)!.add(ws);
            clientRegistry.set(ws, { room, name, role });

            // Notify everyone in the room about the updated member list
            broadcastToRoom(room, {
              type: "presence",
              users: Array.from(activeRooms.get(room)!).map(socket => {
                const client = clientRegistry.get(socket);
                return { name: client?.name, role: client?.role };
              })
            });
          }
        } else {
          // General room broadcast for updates, cursors, chats, or document state
          const clientMeta = clientRegistry.get(ws);
          if (clientMeta) {
            broadcastToRoom(clientMeta.room, {
              ...payload,
              senderName: clientMeta.name,
              senderRole: clientMeta.role
            }, ws); // exclude sender to protect local state cursor loops
          }
        }
      } catch (err) {
        console.error("Failed to parse socket message:", err);
      }
    });

    ws.on("close", () => {
      const clientMeta = clientRegistry.get(ws);
      if (clientMeta) {
        const { room } = clientMeta;
        const roomSockets = activeRooms.get(room);
        if (roomSockets) {
          roomSockets.delete(ws);
          if (roomSockets.size === 0) {
            activeRooms.delete(room);
          } else {
            // Update remaining attendees
            broadcastToRoom(room, {
              type: "presence",
              users: Array.from(roomSockets).map(socket => {
                const m = clientRegistry.get(socket);
                return { name: m?.name, role: m?.role };
              })
            });
          }
        }
        clientRegistry.delete(ws);
      }
    });
  });

  function broadcastToRoom(roomName: string, event: any, excludeSocket?: WebSocket) {
    const sockets = activeRooms.get(roomName);
    if (sockets) {
      const serialized = JSON.stringify(event);
      for (const socket of sockets) {
        if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
          socket.send(serialized);
        }
      }
    }
  }
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});
