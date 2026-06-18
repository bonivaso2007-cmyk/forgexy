
export const API = "/api/groq-proxy";
export const MODEL = "llama-3.1-8b-instant";

let lastCallTime = 0;

async function enforceRateLimit() {
  const now = Date.now();
  const diff = now - lastCallTime;
  if (diff < 800) {
    await new Promise(r => setTimeout(r, 800 - diff));
  }
  lastCallTime = Date.now();
}

export async function geminiStream(system: string, user: string, onChunk: (chunk: string) => void, maxTok = 1400, useSearch = false, responseMimeType?: string) {
  const res = await fetch("/api/ai-proxy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_tokens: maxTok, system, messages: [{ role: "user", content: user }], useSearch, responseMimeType })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No reader");
  const dec = new TextDecoder("utf-8");
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try { const d = JSON.parse(raw); const t = d?.delta?.text || ""; if (t) { full += t; onChunk(full); } } catch {}
    }
  }
  return full;
}

export async function geminiAi(sys: string, usr: string, asJSON = false, maxTok = 1400, retries = 2, useSearch = false) {
  for (let i = 0; i <= retries; i++) {
    try {
      let full = "";
      await geminiStream(sys, usr, t => { full = t; }, maxTok, useSearch, asJSON ? "application/json" : undefined);
      if (!full) throw new Error("Empty");
      if (!asJSON) return full;
      let s = full.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const st = s.indexOf("{"), en = s.lastIndexOf("}");
      if (st === -1 || en === -1) throw new Error("No JSON");
      s = s.slice(st, en + 1).replace(/,\s*([}\]])/g, "$1").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      return JSON.parse(s);
    } catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
  }
}

export async function aiStream(system: string, user: string, onChunk: (chunk: string) => void, maxTok = 1400, useSearch: boolean | string = false, responseMimeType?: string) {
  await enforceRateLimit();
  
  let finalUser = user;
  if (useSearch) {
     const q = typeof useSearch === "string" ? useSearch : "startup market trends";
     try {
       const sr = await fetch("/api/search", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({q}) }).then(r=>r.json());
       if (sr && sr.snippets && sr.snippets.length) {
         finalUser = user + `\n\n### LIVE WEB DATA (LATEST):\n` + sr.snippets.join("\n\n");
       }
     } catch(e) { console.warn("Web search failed", e); }
  }

  const res = await fetch(API, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTok, system, stream: true, messages: [{ role: "user", content: finalUser }] })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No reader");
  const dec = new TextDecoder("utf-8");
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try { const d = JSON.parse(raw); const t = d?.delta?.text || ""; if (t) { full += t; onChunk(full); } } catch {}
    }
  }
  return full;
}

export async function ai(sys: string, usr: string, asJSON = false, maxTok = 1400, retries = 2, useSearch: boolean | string = false) {
  for (let i = 0; i <= retries; i++) {
    try {
      let full = "";
      await aiStream(sys, usr, t => { full = t; }, maxTok, useSearch, asJSON ? "application/json" : undefined);
      if (!full) throw new Error("Empty");
      if (!asJSON) return full;
      let s = full.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const st = s.indexOf("{"), en = s.lastIndexOf("}");
      if (st === -1 || en === -1) throw new Error("No JSON");
      s = s.slice(st, en + 1).replace(/,\s*([}\]])/g, "$1").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      return JSON.parse(s);
    } catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, 400 * (i + 1))); }
  }
}
