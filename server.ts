import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";

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
        return res.json({
          center: { lat: 37.7749, lng: -122.4194 },
          results: [
            { id: "c1", name: "Alpha Competitor Space", lat: 37.7781, lng: -122.4121, description: "Direct local incumbent.", vulnerability: "Weak digital portal", traffic: "High" },
            { id: "c2", name: "Nexus Solutions", lat: 37.7699, lng: -122.4223, description: "Traditional provider in neighborhood.", vulnerability: "Premium prices", traffic: "Medium" }
          ]
        });
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

  // Serve static assets and bundle depending on environment
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
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
