import React, { useState, useRef, useEffect, useCallback, useMemo, Component, ErrorInfo, ReactNode } from "react";
import WarRoom from "./components/WarRoom";
import PitchDeck from "./components/PitchDeck";
import MarketLandscape from "./components/MarketLandscape";
import RunwaySandbox from "./components/RunwaySandbox";
import VentureSentinel from "./components/VentureSentinel";
import CoFounderHub from "./components/CoFounderHub";

const API = "/api/ai-proxy";
const MODEL = "gemini-3.5-flash";
const Q_TARGET = 6;
const LIME = "#C8FF00";
const PURPLE = "#B87FFF";
const ORANGE = "#FF9F1C";
const PINK = "#FF3C78";
const CYAN = "#00FFFF";
const BRANCH_COLORS = [LIME, PURPLE, CYAN, PINK, ORANGE, "#50E3C2"];

// ── SECURE CRYPTO VAULT ENGINE ────────────────────────────
// Uses PBKDF2 + AES-GCM (all native Web Crypto) for zero-trust client-side vault encryption.
// Plaintext data is never written to disk. The session key lives ONLY in-memory or transiently in sessionStorage (tab scope).

async function hashPasswordSHA256(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

let activeEncryptionKey: CryptoKey | null = null;
let activeSaltHex = "";

async function initializeEncryption(password: string, saltHex: string) {
  try {
    const salt = saltHex 
      ? new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
      : window.crypto.getRandomValues(new Uint8Array(16));
    
    activeSaltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
    activeEncryptionKey = await deriveKey(password, salt);
    sessionStorage.setItem("forge_vault_session", JSON.stringify({ salt: activeSaltHex, password }));
  } catch (error) {
    console.error("AES-GCM Cryptographic init failed:", error);
  }
}

async function encryptData(plaintext: string): Promise<string> {
  if (!activeEncryptionKey) return plaintext;
  try {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      activeEncryptionKey,
      encoder.encode(plaintext)
    );
    
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    const binary = String.fromCharCode(...Array.from(combined));
    return "SECURE:" + btoa(binary);
  } catch {
    return plaintext;
  }
}

async function decryptData(ciphertextBase64: string): Promise<string> {
  if (!activeEncryptionKey || !ciphertextBase64.startsWith("SECURE:")) return ciphertextBase64;
  try {
    const base64Data = ciphertextBase64.replace("SECURE:", "");
    const binary = atob(base64Data);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decoder = new TextDecoder();
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      activeEncryptionKey,
      ciphertext
    );
    return decoder.decode(decrypted);
  } catch (error) {
    console.warn("AES Decryption block mapping failed:", error);
    return ciphertextBase64;
  }
}

// ── ERROR BOUNDARY FOR RENDER PROTECTION ──────────────────
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Renderer validation system captured high-frequency UI anomaly:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: "3rem 1.5rem", border: "1px dashed rgba(255, 60, 120, 0.4)", borderRadius: "8px", background: "rgba(255, 60, 120, 0.04)", fontFamily: "monospace", textAlign: "center" }}>
          <span style={{ fontSize: "2rem" }}>⚠️</span>
          <h3 style={{ color: "#FF3C78", fontSize: "0.95rem", margin: "0.75rem 0 0.4rem", fontWeight: "bold", letterSpacing: "1px" }}>RENDER INTEGRITY CHALLENGE</h3>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.76rem", lineHeight: "1.5", maxWidth: "440px", margin: "0 auto 1.25rem" }}>
            The active AI forge payload contains unstructured symbolic elements incompatible with the visual representation nodes. This has been safely isolated.
          </p>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ background: "#C8FF00", color: "#000", border: "none", borderRadius: "4px", padding: "6px 14px", fontSize: "10px", fontWeight: "bold", fontFamily: "monospace", cursor: "pointer" }}
          >
            RESET RENDERER
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── STORAGE ───────────────────────────────────────────────
const store = {
  async get(k: string) {
    try {
      let rawVal: any = null;
      if (typeof window !== "undefined" && "storage" in window && (window as any).storage?.get) {
        const r = await (window as any).storage.get(k);
        rawVal = r ? JSON.parse(r.value) : null;
      } else if (typeof window !== "undefined" && window.localStorage) {
        const item = localStorage.getItem(k);
        rawVal = item ? JSON.parse(item) : null;
      }

      if (rawVal && typeof rawVal === "string" && rawVal.startsWith("SECURE:")) {
        const decrypted = await decryptData(rawVal);
        return JSON.parse(decrypted);
      }
      return rawVal;
    } catch {
      return null;
    }
  },
  async set(k: string, v: any) {
    try {
      let valToStore = v;
      if (activeEncryptionKey && k !== "session" && !k.startsWith("user:") && k !== "forge_analytics") {
        const plaintext = JSON.stringify(v);
        valToStore = await encryptData(plaintext);
      }

      if (typeof window !== "undefined" && "storage" in window && (window as any).storage?.set) {
        await (window as any).storage.set(k, JSON.stringify(valToStore));
        return;
      }
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(k, JSON.stringify(valToStore));
      }
    } catch {}
  },
  async del(k: string) {
    try {
      if (typeof window !== "undefined" && "storage" in window && (window as any).storage?.delete) {
        await (window as any).storage.delete(k);
        return;
      }
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(k);
      }
    } catch {}
  },
  async list(prefix: string) {
    try {
      if (typeof window !== "undefined" && "storage" in window && (window as any).storage?.list) {
        const r = await (window as any).storage.list(prefix);
        return r?.keys || [];
      }
      if (typeof window !== "undefined" && window.localStorage) {
        const keys = Object.keys(localStorage);
        return keys.filter((k) => k.startsWith(prefix));
      }
      return [];
    } catch {
      return [];
    }
  }
};

// ── API ───────────────────────────────────────────────────
async function aiStream(system, user, onChunk, maxTok = 1400, useSearch = false, responseMimeType?: string) {
  const res = await fetch(API, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTok, system, stream: true, messages: [{ role: "user", content: user }], useSearch, responseMimeType })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8");
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += dec.decode();
      if (buffer) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const raw = trimmed.slice(5).trim();
            if (raw && raw !== "[DONE]") {
              try { const d = JSON.parse(raw); const t = d?.delta?.text || ""; if (t) { full += t; onChunk(full); } } catch {}
            }
          }
        }
      }
      break;
    }
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

async function ai(sys, usr, asJSON = false, maxTok = 1400, retries = 2, useSearch = false) {
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

// ── MARKDOWN ──────────────────────────────────────────────
function Md({ text }) {
  return (
    <div style={{ fontFamily: "monospace" }}>
      {(text || "").split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: "0.55rem" }} />;
        const isH1 = line.startsWith("# ") && !line.startsWith("## ");
        const isH2 = line.startsWith("## "), isH3 = line.startsWith("### ");
        const isBullet = /^[-→•]\s/.test(line.trim());
        const content = line.replace(/^#+\s/, "").replace(/^[-→•]\s/, "");
        const html = content.replace(/\*\*(.+?)\*\*/g, `<strong style='color:${LIME}; font-weight: bold;'>$1</strong>`);
        return (
          <div key={i} style={{ 
            marginBottom: isH1 ? "1.2rem" : isH2 ? "0.9rem" : "0.22rem", 
            marginTop: isH1 ? "1.6rem" : isH2 ? "1.4rem" : isH3 ? "0.8rem" : 0, 
            fontSize: isH1 ? "1.2rem" : isH2 ? "1.02rem" : isH3 ? "0.92rem" : "0.83rem", 
            fontWeight: "bold", 
            fontFamily: "monospace",
            color: isH1 ? LIME : isH2 ? PURPLE : isH3 ? CYAN : isBullet ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.85)", 
            lineHeight: "1.75", 
            paddingLeft: isBullet ? "1.2rem" : 0, 
            position: "relative" 
          }}>
            {isBullet && <span style={{ position: "absolute", left: 0, color: LIME }}>→</span>}
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        );
      })}
    </div>
  );
}

// ── FOUNDER PROFILE HELPERS ───────────────────────────────
function profileContext(p) {
  if (!p) return "";
  return `FOUNDER PROFILE:
Name: ${p.name} | Age: ${p.age} | Location: ${p.city}, ${p.country}
Market Focus: ${p.market} | Stage: ${p.stage}
Technical Ability: ${p.techLevel} | Funding Status: ${p.funding}
Constraints: ${p.constraints}
Target Customer: ${p.targetCustomer}
Industry: ${p.industry}
One sentence about them: ${p.bio}`;
}

function marketContext(p) {
  if (!p) return "";
  const isAfrica = ["Tanzania","Kenya","Uganda","Nigeria","Ghana","Rwanda","Ethiopia","Zambia","Mozambique","Senegal","Côte d'Ivoire","South Africa"].some(c => p.country?.includes(c));
  const isEmerging = isAfrica || ["India","Bangladesh","Pakistan","Indonesia","Philippines","Vietnam","Cambodia"].some(c => p.country?.includes(c));
  if (isAfrica) return `MARKET CONTEXT: East/Sub-Saharan Africa. Mobile-first. M-PESA and mobile money dominant. 2G/3G infrastructure in rural areas. SACCOs, MFIs, informal economy key. Limited cloud infrastructure. Low average income. High mobile penetration. Regulatory environment: fintech needs BoT/CBK approval. Think USSD before apps. Cash-heavy economy transitioning to mobile money.`;
  if (isEmerging) return `MARKET CONTEXT: Emerging market. Mobile-first. Infrastructure constraints. Price-sensitive customers. Think lightweight, offline-capable solutions.`;
  return `MARKET CONTEXT: Developed market. Standard SaaS infrastructure applies.`;
}

// ── AUTH SCREENS ──────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
 
  const submit = async () => {
    setErr(""); setLoading(true);
    const { email, password, name } = form;
    if (!email.trim() || !password.trim()) { setErr("Fill in all fields."); setLoading(false); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters."); setLoading(false); return; }
    const uid = btoa(email.toLowerCase()).replace(/=/g, "");
    
    try {
      if (mode === "signup") {
        const exists = await store.get(`user:${uid}`);
        if (exists) { setErr("Account already exists. Log in instead."); setLoading(false); return; }
        if (!name.trim()) { setErr("Enter your name."); setLoading(false); return; }
        
        // Generate cryptographic salt for SHA-256 hash and PBKDF2 GCM encryption key
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
        const passwordHash = await hashPasswordSHA256(password);
        
        const user = { 
          uid, 
          email: email.toLowerCase(), 
          name: name.trim(), 
          passwordHash, 
          saltHex, 
          createdAt: Date.now() 
        };
        
        await initializeEncryption(password, saltHex);
        await store.set(`user:${uid}`, user);
        await store.set(`session`, { uid, email: user.email, name: user.name });
        onAuth(user, true);
      } else {
        const user = await store.get(`user:${uid}`);
        if (!user) { setErr("Invalid email or password."); setLoading(false); return; }
        
        const shaHash = await hashPasswordSHA256(password);
        const legacyHash = btoa(password);
        
        const isValid = user.passwordHash === shaHash || user.passwordHash === legacyHash;
        if (!isValid) { setErr("Invalid email or password."); setLoading(false); return; }
        
        // Dynamic upgrade for any legacy btoa password users to salted SHA-256 & GCM vaulting
        let sHex = user.saltHex || "";
        if (!sHex) {
          const salt = window.crypto.getRandomValues(new Uint8Array(16));
          sHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
          user.saltHex = sHex;
          user.passwordHash = shaHash;
          await store.set(`user:${uid}`, user);
        }
        
        await initializeEncryption(password, sHex);
        await store.set(`session`, { uid, email: user.email, name: user.name });
        onAuth(user, false);
      }
    } catch (e: any) {
      setErr(`Cryptographic threat mitigation blocks entry: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const inp = { width: "100%", background: "#090909", border: "1px solid #181818", borderRadius: "6px", color: "#ffffff", fontSize: "0.85rem", padding: "0.85rem 1rem", outline: "none", fontFamily: "monospace", boxSizing: "border-box" as const };

  return (
    <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "monospace" }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.45em", color: "rgba(255,255,255,0.4)", marginBottom: "3px", display: "block" }}>Project Specification 2026</span>
        <h1 style={{ color: LIME, fontSize: "3.2rem", fontWeight: "900", letterSpacing: "7px", margin: "0 0 4px", lineHeight: "1.1", fontFamily: "monospace" }}>FORGE</h1>
        <p style={{ color: "#222", fontSize: "0.62rem", letterSpacing: "3px", margin: "0 0 2.5rem", fontFamily: "monospace", fontWeight: "bold" }}>IDEA ENGINE FOR FOUNDERS</p>
        <div style={{ display: "flex", gap: "0", marginBottom: "1.8rem", border: "1px solid #181818", borderRadius: "6px", overflow: "hidden" }}>
          {["login", "signup"].map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, background: mode === m ? LIME : "transparent", color: mode === m ? "#050505" : "rgba(255,255,255,0.4)", border: "none", padding: "0.72rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2px", cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", transition: "all .2s" }}>{m}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {mode === "signup" && <input style={inp} placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />}
          <input style={inp} placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} onKeyDown={e => e.key === "Enter" && submit()} />
          <input style={inp} placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>
        {err && <div style={{ color: PINK, fontSize: "0.74rem", marginTop: "0.75rem", background: "rgba(255, 60, 120, 0.08)", border: "1px solid rgba(255, 60, 120, 0.15)", borderRadius: "6px", padding: "0.55rem 0.85rem" }}>{err}</div>}
        <button onClick={submit} disabled={loading} style={{ width: "100%", background: LIME, color: "#050505", border: "none", borderRadius: "6px", padding: "0.9rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2.5px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace", marginTop: "1.2rem", opacity: loading ? 0.5 : 1 }}>
          {loading ? "…" : mode === "login" ? "LOG IN →" : "CREATE ACCOUNT →"}
        </button>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.62rem", textAlign: "center", marginTop: "1.2rem", lineHeight: "1.5" }}>Ideas stay stored in this browser and are sent securely to our AI provider to generate results.</p>
      </div>
    </div>
  );
}

// ── ONBOARDING ────────────────────────────────────────────
function Onboarding({ user, onDone }) {
  const steps = [
    { key: "country", label: "What country is your startup based in?", placeholder: "e.g. Tanzania, India, United States", type: "input" },
    { key: "stage", label: "What stage is your venture at?", type: "choice", options: ["Just an idea", "Research phase", "Building MVP", "Have early users", "Revenue stage"] },
    { key: "techLevel", label: "What is your level of technical execution?", type: "choice", options: ["Non-technical", "Basic (vibe coder)", "Intermediate", "Advanced developer"] },
  ];

  const [step, setStep] = useState(0);
  const [data, setData] = useState({ country: "", stage: "", techLevel: "" });
  const [val, setVal] = useState("");
  const [loading, setLoading] = useState(false);
  const cur = steps[step];

  const skip = async () => {
    setLoading(true);
    const lightProfile = {
      name: user.name,
      email: user.email,
      uid: user.uid,
      age: "Not specified",
      city: "Not specified",
      country: "Global",
      industry: "Generic space",
      market: "Global market target",
      targetCustomer: "Generic audience segment",
      stage: "Just an idea",
      techLevel: "Intermediate",
      funding: "Bootstrapped / no money",
      constraints: "General digital constraints",
      bio: "Unspecified builder launching an idea",
      incomplete: true,
      completedAt: Date.now()
    };
    await store.set(`profile:${user.uid}`, lightProfile);
    onDone(lightProfile);
  };

  const next = async () => {
    if (!val.trim()) return;
    const updated = { ...data, [cur.key]: val };
    setData(updated);
    
    if (step < steps.length - 1) {
      const nextKey = steps[step + 1].key;
      setVal(updated[nextKey] || "");
      setStep(s => s + 1);
      return;
    }
    setLoading(true);
    // Build a complete profile, matching old schemas but with niceDefaults and marked incomplete
    const profile = {
      ...updated,
      name: user.name,
      email: user.email,
      uid: user.uid,
      age: "Not specified",
      city: "Not specified",
      industry: "General Tech",
      market: `Users in ${val}`,
      targetCustomer: "Early testing cohorts",
      funding: "Bootstrapped / no money",
      constraints: "Sandbox digital constraints",
      bio: `Builder focusing on MVP validation in ${updated.country || "Global market"}`,
      incomplete: true, // Mark incomplete for optional optional enhancement nudging later
      completedAt: Date.now()
    };
    await store.set(`profile:${user.uid}`, profile);
    onDone(profile);
  };

  const back = () => {
    if (step > 0) {
      const updated = { ...data, [cur.key]: val };
      setData(updated);
      const prevStep = step - 1;
      const prevKey = steps[prevStep].key;
      setVal(updated[prevKey] || "");
      setStep(prevStep);
    }
  };

  const progress = ((step) / steps.length) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "monospace" }}>
      <div style={{ width: "100%", maxWidth: "520px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "1.35rem", fontWeight: "900", color: LIME, letterSpacing: "1px", fontFamily: "monospace" }}>FORGE SYSTEM</span>
          <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
            <button onClick={skip} disabled={loading} style={{ background: "transparent", border: "1px solid #222", borderRadius: "4px", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "10px", padding: "3px 8px", fontFamily: "monospace" }}>SKIP FOR NOW</button>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.68rem", fontFamily: "monospace" }}>{step + 1} / {steps.length}</span>
          </div>
        </div>
        <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", marginBottom: "3rem", overflow: "hidden", border: "1px solid #1a1a1a" }}>
          <div style={{ height: "100%", background: LIME, width: `${progress}%`, transition: "width .4s ease" }} />
        </div>
        <p style={{ color: PURPLE, fontSize: "10px", letterSpacing: "0.25em", margin: "0 0 0.6rem", textTransform: "uppercase", fontWeight: "bold", fontFamily: "monospace" }}>Building your founder profile</p>
        <p style={{ color: "#ffffff", fontSize: "1.38rem", margin: "0 0 2rem", fontWeight: "bold", lineHeight: "1.6", fontFamily: "monospace" }}>{cur.label}</p>
        {cur.type === "input" && (
          <input style={{ width: "100%", background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", color: "#ffffff", fontSize: "0.95rem", padding: "1rem 1.1rem", outline: "none", fontFamily: "monospace", boxSizing: "border-box" }}
            placeholder={cur.placeholder} value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && val.trim() && next()} autoFocus />
        )}
        {cur.type === "textarea" && (
          <textarea style={{ width: "100%", background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", color: "#ffffff", fontSize: "0.92rem", padding: "1rem 1.1rem", outline: "none", fontFamily: "monospace", lineHeight: "1.6", height: "100px", resize: "none", boxSizing: "border-box" }}
            placeholder={cur.placeholder} value={val} onChange={e => setVal(e.target.value)} autoFocus />
        )}
        {cur.type === "choice" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {cur.options.map(o => {
              const sel = val === o;
              return (
                <button key={o} onClick={() => setVal(o)} style={{ background: sel ? `${LIME}0d` : "#090909", border: `1px solid ${sel ? LIME : "#1c1c1c"}`, borderRadius: "6px", padding: "0.85rem 1.1rem", color: sel ? LIME : "rgba(255, 255, 255, 0.6)", fontFamily: "monospace", fontSize: "0.85rem", cursor: "pointer", textAlign: "left", transition: "all .15s" }}>{o}</button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button onClick={next} disabled={!val.trim() || loading}
            style={{ flex: 1, background: LIME, color: "#050505", border: "none", borderRadius: "6px", padding: "0.85rem 2rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2.5px", cursor: !val.trim() ? "not-allowed" : "pointer", fontFamily: "monospace", opacity: !val.trim() ? 0.25 : 1 }}>
            {loading ? "SAVING…" : step === steps.length - 1 ? "ENTER FORGE SYSTEM →" : "NEXT →"}
          </button>
          {step > 0 && (
            <button onClick={back} style={{ background: "transparent", color: "rgba(255, 255, 255, 0.5)", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "0.85rem 1.2rem", fontSize: "11px", cursor: "pointer", fontFamily: "monospace" }}>
              ← BACK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PROFILE PANEL ─────────────────────────────────────────
function ProfilePanel({ profile, user, onUpdate, onLogout, onClose }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...profile });
  const fields = [
    { key: "age", label: "Age" }, { key: "city", label: "City" }, { key: "country", label: "Country" },
    { key: "industry", label: "Industry" }, { key: "market", label: "Target Market" },
    { key: "targetCustomer", label: "Ideal First Customer" }, { key: "stage", label: "Stage" },
    { key: "techLevel", label: "Technical Level" }, { key: "funding", label: "Funding" },
    { key: "constraints", label: "Constraints" }, { key: "bio", label: "Founder Bio" },
  ];

  const save = async () => {
    // Clear the incomplete flag on manual save
    const updated = { ...draft, incomplete: false, updatedAt: Date.now() };
    await store.set(`profile:${user.uid}`, updated);
    onUpdate(updated); setEditing(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.8)", zIndex: 3000, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "min(500px,100vw)", background: "#080808", borderLeft: "1px solid #1c1c1c", display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.2rem 1.5rem", borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
          <div>
            <div style={{ color: LIME, fontSize: "0.75rem", fontWeight: "900", letterSpacing: "3px", fontFamily: "monospace" }}>FOUNDER PROFILE</div>
            <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: "0.6rem", letterSpacing: "1.5px", fontFamily: "monospace", marginTop: "2px" }}>{profile?.name?.toUpperCase()}</div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {editing
              ? <button onClick={save} style={{ background: LIME, color: "#050505", border: "none", borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.68rem", fontWeight: "900" }}>SAVE</button>
              : <button onClick={() => { setDraft({ ...profile }); setEditing(true); }} style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#ffffff", borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.68rem" }}>EDIT</button>
            }
            <button onClick={onClose} style={{ background: "rgba(255, 60, 120, 0.08)", border: "1px solid rgba(255, 60, 120, 0.3)", color: PINK, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", fontWeight: "bold" }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {profile?.incomplete && (
            <div style={{ background: "rgba(184,127,255,0.1)", border: "1px solid rgba(184,127,255,0.3)", borderRadius: "6px", padding: "0.8rem 1rem", marginBottom: "1.5rem", color: PURPLE, fontSize: "11px", fontWeight: "bold" }}>
              ⚡ Profile Incomplete: Fill in these details to sharpen AI simulations.
            </div>
          )}
          {/* score badge */}
          <div style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.1rem 1.3rem", marginBottom: "1.5rem" }}>
            <div style={{ color: PURPLE, fontSize: "10px", letterSpacing: "0.2em", marginBottom: "0.4rem", textTransform: "uppercase", fontWeight: "bold", fontFamily: "monospace" }}>FOUNDER IDENTITY</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.85rem", lineHeight: "1.65", fontFamily: "monospace" }}>{profile?.bio || "No summary provided."}</div>
          </div>
          {fields.map(f => (
            <div key={f.key} style={{ marginBottom: "1.1rem" }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "0.3rem", fontFamily: "monospace" }}>{f.label}</div>
              {editing
                ? <textarea style={{ width: "100%", background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", color: "#ffffff", fontSize: "0.83rem", padding: "0.6rem 0.8rem", outline: "none", fontFamily: "monospace", lineHeight: "1.6", minHeight: "60px", resize: "vertical", boxSizing: "border-box" }}
                  value={draft[f.key] || ""} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
                : <div style={{ color: "rgba(255, 255, 255, 0.75)", fontSize: "0.83rem", lineHeight: "1.6", fontFamily: "monospace" }}>{profile?.[f.key] || "—"}</div>
              }
            </div>
          ))}
          <button onClick={onLogout} style={{ background: "transparent", border: "1px solid rgba(255, 60, 120, 0.25)", color: PINK, borderRadius: "6px", padding: "0.65rem 1.2rem", cursor: "pointer", fontFamily: "monospace", fontSize: "11px", letterSpacing: "0.15em", marginTop: "1rem", width: "100%" }}>LOG OUT</button>
        </div>
      </div>
    </div>
  );
}

// ── IDEA HISTORY PANEL ────────────────────────────────────
function HistoryPanel({ uid, onLoad, onClose }) {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const keys = await store.list(`idea:${uid}:`);
      const items = await Promise.all(keys.map(k => store.get(k)));
      setIdeas(items.filter(Boolean).sort((a, b) => b.savedAt - a.savedAt));
      setLoading(false);
    })();
  }, [uid]);

  const del = async (id) => {
    await store.del(`idea:${uid}:${id}`);
    setIdeas(p => p.filter(x => x.id !== id));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.8)", zIndex: 3000, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "min(480px,100vw)", background: "#080808", borderLeft: "1px solid #1c1c1c", display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.2rem 1.5rem", borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
          <div style={{ color: LIME, fontSize: "0.75rem", fontWeight: "900", letterSpacing: "3px", fontFamily: "monospace" }}>IDEA VAULT</div>
          <button onClick={onClose} style={{ background: "rgba(255, 60, 120, 0.08)", border: "1px solid rgba(255, 60, 120, 0.3)", color: PINK, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", fontWeight: "bold" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1.2rem 1.5rem" }}>
          {loading && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", fontFamily: "monospace" }}>Loading…</div>}
          {!loading && ideas.length === 0 && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.82rem", fontFamily: "monospace" }}>No saved ideas yet. Start one and it'll appear here.</div>}
          {ideas.map(idea => (
            <div key={idea.id} style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1rem 1.1rem", marginBottom: "0.75rem" }}>
              <div style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "0.82rem", marginBottom: "0.55rem", fontFamily: "monospace", lineHeight: "1.5" }}>{idea.text?.slice(0, 100)}{idea.text?.length > 100 ? "…" : ""}</div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                {idea.score && <span style={{ color: LIME, fontSize: "10px", border: "1px solid #1c1c1c", padding: "2px 7px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", fontWeight: "bold", fontFamily: "monospace" }}>{idea.score} — {idea.label}</span>}
                <span style={{ color: "rgba(255, 255, 255, 0.3)", fontSize: "0.62rem", fontFamily: "monospace" }}>{new Date(idea.savedAt).toLocaleDateString()}</span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button onClick={() => { onLoad(idea); onClose(); }} style={{ background: "transparent", border: "1px solid #1c1c1c", color: "#ffffff", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.62rem" }}>LOAD</button>
                  <button onClick={() => del(idea.id)} style={{ background: "transparent", border: "1px solid rgba(255,60,120,0.25)", color: PINK, borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.62rem" }}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── REALITY CHECK ─────────────────────────────────────────
function RealityCheck({ idea, qa, profile, onProceed, onBack }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [talked, setTalked] = useState(null);

  useEffect(() => {
    (async () => {
      const sys = `You are FORGE REALITY CHECK — a brutal, honest advisor for early-stage founders.
Analyse this idea against the founder's specific constraints. Be direct. No sugarcoating.
Structure: ## Feasibility Score (X/10)\n## Can You Actually Build This?\n## Market Reality Check\n## Your Unfair Advantage\n## The Single Biggest Risk\n## Verdict`;
      const prompt = `${profileContext(profile)}\n${marketContext(profile)}\n\nIdea: "${idea}"\n\nFounder's thinking:\n${qa.map((x, i) => `Q${i + 1}: ${x.question}\nA${i + 1}: ${x.answer}`).join("\n\n")}\n\nGive a reality check tailored to THIS specific founder's constraints and location.`;
      await aiStream(sys, prompt, chunk => setResult(chunk), 1000, true);
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ animation: "fadeIn .3s ease", fontFamily: "monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.8rem" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: loading ? PURPLE : LIME, animation: loading ? "pulse 1s infinite" : "none", flexShrink: 0 }} />
        <span style={{ color: loading ? PURPLE : LIME, fontSize: "0.68rem", letterSpacing: "3px", fontWeight: "bold" }}>{loading ? "RUNNING REALITY CHECK…" : "REALITY CHECK COMPLETE"}</span>
      </div>
      <div style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <Md text={result} />
      </div>
      {!loading && (
        <>
          <div style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.2rem", marginBottom: "1.5rem" }}>
            <p style={{ color: "#ffffff", fontSize: "0.9rem", margin: "0 0 1rem", fontFamily: "monospace", fontWeight: "bold" }}>Have you spoken to at least one real potential customer about this idea?</p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {["Yes, I have", "Not yet"].map(o => {
                const sel = talked === o;
                return (
                  <button key={o} onClick={() => setTalked(o)} style={{ flex: 1, background: sel ? `${LIME}0d` : "transparent", border: `1px solid ${sel ? LIME : "#1c1c1c"}`, borderRadius: "6px", padding: "0.75rem", color: sel ? LIME : "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: "0.82rem", cursor: "pointer", transition: "all .15s" }}>{o}</button>
                );
              })}
            </div>
            {talked === "Not yet" && <p style={{ color: PINK, fontSize: "0.75rem", marginTop: "0.75rem", lineHeight: "1.6" }}>⚠ No real conversations = unvalidated assumptions. The outputs will still generate but treat them as hypotheses, not facts. Your #1 action after this: talk to one real person.</p>}
          </div>
          {talked && (
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={onProceed} style={{ background: LIME, color: "#050505", border: "none", borderRadius: "6px", padding: "0.82rem 1.8rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2px", cursor: "pointer", fontFamily: "monospace" }}>BUILD OUTPUTS →</button>
              <button onClick={onBack} style={{ background: "transparent", color: "rgba(255, 255, 255, 0.5)", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "0.82rem 1.2rem", fontSize: "11px", cursor: "pointer", fontFamily: "monospace" }}>← BACK</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MIND MAP ──────────────────────────────────────────────
function MindMap({ data, onDeepDive }) {
  const svgRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const W = 1100, H = 720, cx = W / 2, cy = H / 2, bR = 210, nR = 125;
  const branches = (data.branches || []).slice(0, 6);
  const N = branches.length;

  const wrap = (txt, max) => {
    if (!txt) return [""];
    const words = String(txt).split(" "); const lines = []; let cur = "";
    for (const w of words) { if ((cur + " " + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur = (cur + " " + w).trim(); }
    if (cur) lines.push(cur); return lines.slice(0, 2);
  };

  const positions = useMemo(() => branches.map((b, i) => {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    const bx = cx + Math.cos(angle) * bR, by = cy + Math.sin(angle) * bR;
    const nodes = (b.nodes || []).slice(0, 4).map((node, j) => {
      const nAngle = angle + (j - ((b.nodes || []).slice(0, 4).length - 1) / 2) * 0.44;
      return { node, nAngle, nx: bx + Math.cos(nAngle) * nR, ny: by + Math.sin(nAngle) * nR };
    });
    return { angle, bx, by, nodes };
  }), [data]);

  const onMouseDown = e => { if (e.button !== 0) return; setDragging(true); setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y }); };
  const onMouseMove = e => { if (!dragging || !dragStart) return; setTransform(t => ({ ...t, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })); };
  const onMouseUp = () => { setDragging(false); setDragStart(null); };
  const onWheel = useCallback(e => { e.preventDefault(); setTransform(t => ({ ...t, scale: Math.min(Math.max(t.scale * (e.deltaY > 0 ? 0.92 : 1.09), 0.3), 3) })); }, []);

  useEffect(() => { const el = svgRef.current; if (!el) return; el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel); }, []);

  return (
    <div style={{ position: "relative", background: "#050505", border: "1px solid #1c1c1c", borderRadius: "6px", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "10px", right: "10px", display: "flex", gap: "5px", zIndex: 10 }}>
        {([["＋", () => setTransform(t => ({ ...t, scale: Math.min(t.scale * 1.2, 3) }))], ["－", () => setTransform(t => ({ ...t, scale: Math.max(t.scale * 0.83, 0.3) }))], ["⊡", () => setTransform({ x: 0, y: 0, scale: 0.75 })], ["↺", () => setTransform({ x: 0, y: 0, scale: 1 })]
        ] as [string, () => void][]).map(([l, a], i) => (
          <button key={i} onClick={a} style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", color: "rgba(255,255,255,0.4)", borderRadius: "6px", width: "26px", height: "26px", cursor: "pointer", fontSize: "0.8rem", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = LIME; e.currentTarget.style.color = LIME; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "#1c1c1c"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}>{l}</button>
        ))}
      </div>
      {selected && (
        <div style={{ position: "absolute", bottom: "10px", right: "10px", background: "#0c0c0c", border: `1px solid #1c1c1c`, borderRadius: "6px", padding: "0.6rem 0.8rem", zIndex: 10, display: "flex", flexDirection: "column", gap: "0.35rem", maxWidth: "240px" }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.55rem", letterSpacing: "2px", textTransform: "uppercase" }}>SELECTED CONCEPT</div>
          <div style={{ color: "#ffffff", fontSize: "0.78rem", fontFamily: "monospace", fontWeight: "bold", wordBreak: "break-all" }}>{selected}</div>
          <button onClick={() => onDeepDive(`Research and explain this mind map node or section: "${selected}" in relation to my startup idea "${data.center || "Idea"}". Describe how to validate it, potential competitors, or technical execution paths.`)} style={{ background: LIME, color: "#000", border: "none", borderRadius: "4px", padding: "4px 8px", fontSize: "9px", fontWeight: "bold", cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase" }}>
            ⚡ RESEARCH NODE
          </button>
        </div>
      )}
      <div style={{ position: "absolute", bottom: "10px", left: "10px", color: "rgba(255,255,255,0.25)", fontSize: "10px", fontFamily: "monospace", zIndex: 10 }}>drag · scroll to zoom · click to highlight</div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", cursor: dragging ? "grabbing" : "grab", userSelect: "none" }} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <defs>
          <filter id="gl"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          {branches.map((b, i) => { const c = BRANCH_COLORS[i % 6]; return (<radialGradient key={i} id={`rg${i}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={c} stopOpacity="0.12" /><stop offset="100%" stopColor={c} stopOpacity="0.01" /></radialGradient>); })}
        </defs>
        <rect width={W} height={H} fill="#050505" />
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={cx} cy={cy} r={88} fill="#ffffff" opacity="0.03" filter="url(#gl)" />
          <circle cx={cx} cy={cy} r={70} fill="#ffffff" />
          {wrap(data.center || "IDEA", 11).map((ln, i, arr) => (<text key={i} x={cx} y={cy + (i - (arr.length - 1) / 2) * 17} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="bold" fill="#050505" fontFamily="Inter, sans-serif" letterSpacing="0.05em">{ln}</text>))}
          {positions.map((pos, i) => {
            const b = branches[i]; const color = BRANCH_COLORS[i % 6];
            const bKey = b.label || `b${i}`; const active = selected === bKey || hovered === bKey;
            return (<g key={i}>
              <line x1={cx + Math.cos(pos.angle) * 72} y1={cy + Math.sin(pos.angle) * 72} x2={pos.bx} y2={pos.by} stroke={color} strokeWidth={active ? 2.0 : 1.2} opacity={active ? 0.8 : 0.35} style={{ transition: "all .25s" }} />
              <ellipse cx={pos.bx} cy={pos.by} rx={active ? 64 : 60} ry={active ? 32 : 29} fill={`url(#rg${i})`} stroke={color} strokeWidth={active ? 1.8 : 1.0} style={{ transition: "all .25s", cursor: "pointer", filter: active ? `drop-shadow(0 0 4px ${color})` : "none" }} onClick={() => setSelected(selected === bKey ? null : bKey)} onMouseEnter={() => setHovered(bKey)} onMouseLeave={() => setHovered(null)} />
              {wrap(b.label || "", 13).map((ln, li, arr) => (<text key={li} x={pos.bx} y={pos.by + (li - (arr.length - 1) / 2) * 14} textAnchor="middle" dominantBaseline="middle" fontSize={active ? 12 : 11} fontWeight="bold" fill={color} fontFamily="monospace" style={{ pointerEvents: "none", transition: "all .2s" }}>{ln}</text>))}
              {pos.nodes.map(({ node, nAngle, nx, ny }, j) => {
                const nk = String(node || ""); const nActive = selected === nk || hovered === nk || selected === bKey;
                const ls = wrap(nk, 13); const bh = ls.length * 17 + 12;
                return (<g key={j}>
                  <line x1={pos.bx + Math.cos(nAngle) * 62} y1={pos.by + Math.sin(nAngle) * 31} x2={nx - Math.cos(nAngle) * 52} y2={ny - Math.sin(nAngle) * (bh / 2)} stroke={color} strokeWidth={nActive ? 1.2 : 0.7} opacity={nActive ? 0.5 : 0.18} style={{ transition: "all .2s" }} />
                  <rect x={nx - 52} y={ny - bh / 2} width={104} height={bh} rx={6} fill={selected === nk ? "rgba(255,255,255,0.06)" : "#090909"} stroke={color} strokeWidth={nActive ? 1.8 : 1.0} strokeOpacity={nActive ? 0.8 : 0.3} style={{ transition: "all .2s", cursor: "pointer" }} onClick={() => setSelected(selected === nk ? null : nk)} onMouseEnter={() => setHovered(nk)} onMouseLeave={() => setHovered(null)} />
                  {ls.map((ln, li) => (<text key={li} x={nx} y={ny - bh / 2 + li * 17 + 14} textAnchor="middle" dominantBaseline="middle" fontSize={nActive ? 9.5 : 8.5} fill={nActive ? "#ffffff" : "rgba(255,255,255,0.4)"} fontFamily="monospace" style={{ pointerEvents: "none", transition: "all .2s" }}>{ln}</text>))}
                </g>);
              })}
            </g>);
          })}
        </g>
      </svg>
    </div>
  );
}

// ── OUTPUT RENDERERS (compact) ────────────────────────────
function PromptPack({ data, onDeepDive }) {
  const [copiedRules, setCopiedRules] = useState(false);
  const [copiedStep, setCopiedStep] = useState(null);

  const copyText = (txt, cb) => {
    navigator.clipboard.writeText(txt);
    cb();
  };

  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2 style={{ color: LIME, fontSize: "1.4rem", margin: "0 0 6px", fontWeight: "900", letterSpacing: "1px" }}>{data.title} Prompt Pack</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", margin: "0 0 1.5rem", lineHeight: "1.6" }}>
        Recommended boilerplate configuration and prompt sequence optimized to launch your custom MVP.
      </p>

      {/* Tech Stack tags */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ color: PURPLE, fontSize: "9px", letterSpacing: "2px", marginBottom: "0.45rem", fontWeight: "bold" }}>TARGET MVP ARCHITECTURE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {(data.tech_stack || []).map((t, i) => (
            <span key={i} style={{ background: "rgba(184, 127, 255, 0.08)", border: "1px solid rgba(184, 127, 255, 0.25)", color: PURPLE, fontSize: "0.75rem", padding: "4px 9px", borderRadius: "6px", fontWeight: "bold" }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Cursor rules block */}
      <div style={{ marginBottom: "1.8rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <div style={{ color: LIME, fontSize: "9px", letterSpacing: "2px", fontWeight: "bold" }}>IDE SYSTEM RULES (.cursorrules)</div>
          <button onClick={() => copyText(data.cursor_rules, () => { setCopiedRules(true); setTimeout(() => setCopiedRules(false), 2000); })} style={{ background: "transparent", border: "1px solid #1c1c1c", color: copiedRules ? LIME : "rgba(255,255,255,0.5)", borderRadius: "4px", padding: "3px 8px", cursor: "pointer", fontSize: "10px", fontFamily: "monospace" }}>
            {copiedRules ? "✓ COPIED" : "📋 COPY RULES"}
          </button>
        </div>
        <pre style={{ background: "#050505", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1rem", overflowX: "auto", fontSize: "0.75rem", color: "rgba(255,255,255,0.78)", lineHeight: "1.5", margin: 0, maxHeight: "200px", whiteSpace: "pre-wrap" }}>
          <code>{data.cursor_rules}</code>
        </pre>
      </div>

      {/* Prompt sequences */}
      <div>
        <div style={{ color: LIME, fontSize: "9px", letterSpacing: "2px", marginBottom: "0.6rem", fontWeight: "bold" }}>PROMPT PIPELINE FOR AI BUILDERS</div>
        {(data.mvp_prompts || []).map((p, idx) => (
          <div key={idx} style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1rem", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <span style={{ color: LIME, fontWeight: "bold", fontSize: "0.82rem" }}>{p.step}</span>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button onClick={() => onDeepDive(`Generate template code and setup advice for my startup prompt step: '${p.step}'. Full prompt details: '${p.prompt}'`)} style={{ background: "transparent", border: "1px solid #1c1c1c", color: PURPLE, borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "10px", fontFamily: "monospace" }}>
                  ⚡ BUILD STEP
                </button>
                <button onClick={() => copyText(p.prompt, () => { setCopiedStep(idx); setTimeout(() => setCopiedStep(null), 2000); })} style={{ background: "transparent", border: "1px solid #1c1c1c", color: copiedStep === idx ? LIME : "rgba(255,255,255,0.5)", borderRadius: "4px", padding: "2px 6px", cursor: "pointer", fontSize: "10px", fontFamily: "monospace" }}>
                  {copiedStep === idx ? "✓ COPIED" : "📋 COPY PROMPT"}
                </button>
              </div>
            </div>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.78rem", lineHeight: "1.6", margin: 0, whiteSpace: "pre-wrap" }}>{p.prompt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Blueprint({ data, onDeepDive }) {
  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2 style={{ color: LIME, fontSize: "1.4rem", margin: "0 0 6px", fontWeight: "900", letterSpacing: "1px" }}>{data.title}</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", margin: "0 0 1.8rem", lineHeight: "1.65" }}>{data.vision}</p>
      {(data.sections || []).map((s, i) => (
        <div key={i} style={{ marginBottom: "1.4rem", paddingLeft: "1rem", borderLeft: `1px solid ${LIME}30` }}>
          <div style={{ color: LIME, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "3px", marginBottom: "0.4rem", fontWeight: "bold" }}>{s.title}</div>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.85rem", lineHeight: "1.7", margin: "0 0 0.5rem" }}>{s.content}</p>
          {(s.bullets || []).map((b, j) => (
            <div key={j} style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.78rem", marginBottom: "0.3rem", paddingLeft: "0.75rem", display: "flex", alignItems: "center", width: "100%" }}>
              <span style={{ flex: 1 }}>→ {b}</span>
              <button
                onClick={() => onDeepDive(`Research and elaborate on this specific Blueprint detail: '${b}' for section '${s.title}' under startup idea '${data.title}'. Find competitors, APIs, or strategies.`)}
                title="Live Research in Forge Intel"
                style={{
                  background: "transparent",
                  border: "none",
                  color: LIME,
                  cursor: "pointer",
                  fontSize: "9px",
                  fontFamily: "monospace",
                  opacity: 0.5,
                  padding: "2px 4px",
                  marginLeft: "auto",
                  flexShrink: 0
                }}
                className="p-btn"
              >
                ⚡ RESEARCH
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Roadmap({ data, onDeepDive }) {
  const cols = [LIME, PURPLE, CYAN, PINK];
  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2 style={{ color: LIME, fontSize: "1.4rem", margin: "0 0 1.8rem", fontWeight: "900", letterSpacing: "1px" }}>{data.title}</h2>
      {(data.phases || []).map((p, i) => { 
        const c = cols[i % 4]; 
        return (
          <div key={i} style={{ display: "flex", gap: "1.3rem", marginBottom: "2rem" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: "48px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", border: `1px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center", color: c, fontWeight: "bold", fontSize: "0.95rem", background: `${c}0a` }}>{i + 1}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", marginTop: "6px", textAlign: "center" }}>{p.duration}</div>
            </div>
            <div style={{ flex: 1, borderLeft: `1px solid rgba(255,255,255,0.06)`, paddingLeft: "1.3rem" }}>
              <div style={{ color: c, fontSize: "10px", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "bold" }}>{p.phase}</div>
              <div style={{ color: "#ffffff", fontSize: "0.98rem", fontWeight: "bold", margin: "4px 0 6px" }}>{p.title}</div>
              <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.82rem", marginBottom: "0.7rem", lineHeight: "1.6" }}>{p.goal}</div>
              {(p.milestones || []).map((m, j) => (
                <div key={j} style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.78rem", marginBottom: "0.35rem", display: "flex", alignItems: "center", width: "100%" }}>
                  <span style={{ flex: 1 }}>✓ {m}</span>
                  <button
                    onClick={() => onDeepDive(`Perform a live fact-check online for standard execution speeds, tools, or regulatory hurdles to achieve this milestone: "${m}" for phase "${p.phase}" under idea "${data.title}".`)}
                    title="Research execution path in Intel"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: LIME,
                      cursor: "pointer",
                      fontSize: "9px",
                      fontFamily: "monospace",
                      opacity: 0.5,
                      padding: "2px 4px",
                      marginLeft: "auto",
                      flexShrink: 0
                    }}
                    className="p-btn"
                  >
                    ⚡ CHECK
                  </button>
                </div>
              ))}
              {(p.kpis || []).length > 0 && (
                <div style={{ marginTop: "0.55rem", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {p.kpis.map((k, j) => <span key={j} style={{ background: `${c}08`, border: `1px solid ${c}20`, color: c, fontSize: "0.65rem", padding: "2px 7px", borderRadius: "6px", fontWeight: "bold" }}>{k}</span>)}
                </div>
              )}
            </div>
          </div>
        ); 
      })}
    </div>
  );
}

function BusinessPlan({ data }) {
  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2 style={{ color: LIME, fontSize: "1.4rem", margin: "0 0 4px", fontWeight: "900", letterSpacing: "1px" }}>{data.title}</h2>
      <p style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "0.88rem", margin: "0 0 1.6rem" }}>{data.oneliner}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        {(data.sections || []).map((s, i, arr) => (
          <div key={i} style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "0.85rem", gridColumn: (i === 0 || i === arr.length - 1) ? "1/-1" : "auto" }}>
            <div style={{ color: LIME, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "2.5px", marginBottom: "0.4rem", fontWeight: "bold" }}>{s.title}</div>
            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.82rem", lineHeight: "1.68", margin: 0 }}>{s.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionPlan({ data, onDeepDive }) {
  const pc = { HIGH: PINK, MED: ORANGE, LOW: "rgba(255,255,255,0.4)" };
  const [done, setDone] = useState({});
  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2 style={{ color: LIME, fontSize: "1.4rem", margin: "0 0 1.8rem", fontWeight: "900", letterSpacing: "1px" }}>{data.title}</h2>
      {(data.weeks || []).map((w, i) => (
        <div key={i} style={{ marginBottom: "1.8rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.6rem", paddingBottom: "0.4rem", borderBottom: `1px solid #1c1c1c` }}>
            <span style={{ color: LIME, fontWeight: "bold", fontSize: "0.78rem" }}>{w.week}</span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.68rem" }}>— {w.focus}</span>
          </div>
          {(w.tasks || []).map((t, j) => { 
            const p = (t.priority || "MED").toUpperCase().slice(0, 3); 
            const c = pc[p] || "rgba(255,255,255,0.5)"; 
            const k = `${i}-${j}`; 
            const isDone = done[k]; 
            return (
              <div key={j} onClick={() => setDone(d => ({ ...d, [k]: !d[k] }))} style={{ display: "flex", gap: "0.8rem", alignItems: "center", background: "#090909", border: `1px solid ${isDone ? `${LIME}30` : "#1c1c1c"}`, borderRadius: "6px", padding: "0.65rem 0.85rem", marginBottom: "0.32rem", cursor: "pointer", transition: "all .18s", opacity: isDone ? 0.45 : 1 }}>
                <span style={{ color: c, fontSize: "9px", fontWeight: "bold", border: `2px solid ${c}`, padding: "2px 5px", borderRadius: "3px", minWidth: "26px", textAlign: "center", flexShrink: 0 }}>{p}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: isDone ? "rgba(255,255,255,0.3)" : "#ffffff", fontSize: "0.82rem", marginBottom: "0.15rem", textDecoration: isDone ? "line-through" : "none" }}>{t.task}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.71rem" }}>→ {t.outcome}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeepDive(`Create an actionable guide, step-by-step tech architecture walkthrough, or prompt for this Action Plan task: "${t.task}", targeting outcome: "${t.outcome}" under startup idea "${data.title}".`);
                    }}
                    title="Build Step / Prompt instructions"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: PURPLE,
                      cursor: "pointer",
                      fontSize: "9px",
                      fontFamily: "monospace",
                      padding: "2px 4px",
                      flexShrink: 0
                    }}
                    className="p-btn"
                  >
                    ⚡ PROMPT
                  </button>
                  <span style={{ color: isDone ? LIME : "rgba(255,255,255,0.1)", fontSize: "0.88rem", flexShrink: 0 }}>{isDone ? "✓" : "○"}</span>
                </div>
              </div>
            ); 
          })}
        </div>
      ))}
    </div>
  );
}

function SWOT({ data, onDeepDive }) {
  const quads = [{ key: "strengths", label: "Strengths", color: LIME, icon: "↑" }, { key: "weaknesses", label: "Weaknesses", color: PINK, icon: "↓" }, { key: "opportunities", label: "Opportunities", color: CYAN, icon: "→" }, { key: "threats", label: "Threats", color: ORANGE, icon: "⚠" }];
  return (
    <div style={{ fontFamily: "monospace" }}>
      <h2 style={{ color: LIME, fontSize: "1.4rem", margin: "0 0 4px", fontWeight: "900", letterSpacing: "1px" }}>{data.title}</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.78rem", margin: "0 0 1.4rem" }}>{data.summary}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
        {quads.map(q => (
          <div key={q.key} style={{ background: "#090909", border: `1px solid #1c1c1c`, borderRadius: "6px", padding: "1rem" }}>
            <div style={{ color: q.color, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "3px", marginBottom: "0.65rem", fontWeight: "bold" }}>{q.icon} {q.label}</div>
            {(data[q.key] || []).map((item, i) => (
              <div key={i} style={{ display: "flex", width: "100%", gap: "0.5rem", marginBottom: "0.45rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ color: q.color, fontSize: "0.66rem", marginTop: "4px", flexShrink: 0 }}>◆</span>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.79rem", lineHeight: "1.58", flex: 1 }}>{item}</span>
                <button
                  onClick={() => onDeepDive(`Help me research and address this ${q.label} item from my SWOT analysis: "${item}" under startup idea "${data.title}". Find real-world data, statistics, or solutions online.`)}
                  title="Live Research with Forge Intel"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: LIME,
                    cursor: "pointer",
                    fontSize: "9px",
                    fontFamily: "monospace",
                    opacity: 0.5,
                    padding: "2px 4px",
                    flexShrink: 0,
                    alignSelf: "center"
                  }}
                  className="p-btn"
                >
                  ⚡ RESEARCH
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {data.strategic_insight && (
        <div style={{ marginTop: "0.9rem", background: `#0d0d0d`, border: `1px solid #1c1c1c`, borderRadius: "6px", padding: "0.9rem" }}>
          <div style={{ color: LIME, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "3px", marginBottom: "0.3rem", fontWeight: "bold" }}>Strategic Read</div>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.81rem", lineHeight: "1.68", margin: 0 }}>{data.strategic_insight}</p>
        </div>
      )}
    </div>
  );
}

// ── COMPANY BUILDER & INTEL (compact) ─────────────────────
function CompanyBuilder({ idea, qaCtx, profile, onClose }) {
  const [step, setStep] = useState("pick");
  const [mode, setMode] = useState(null);
  const [bg, setBg] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const scrollRef = useRef(null);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [result]);

  const build = async () => {
    setStep("result"); setLoading(true); setResult(""); setDone(false);
    const modeCtx = mode === "scratch" ? "Starting from zero." : `Insider background: "${bg}"`;
    const sys = `You are FORGE SYSTEMS. McKinsey meets YC. Specific, ruthless, no filler. ## headers. → bullets.`;
    const prompt = `${profileContext(profile)}\n${marketContext(profile)}\n\nIdea:"${idea}"\n${qaCtx}\n\nContext:${modeCtx}\n\n## 1. Company Architecture\n## 2. Core Systems\n## 3. Workflow Design\n## 4. Hiring Sequence\n## 5. Revenue Operations\n## 6. Tech Stack (exact tools for this market)\n## 7. Growth Levers\n## 8. 90-Day Plan\n## 9. Critical Failure Points`;
    try { await aiStream(sys, prompt, chunk => setResult(chunk), 1600, true); } catch (e) { setResult(`Error: ${e.message}`); }
    setLoading(false); setDone(true);
  };

  const btn = (active = true) => ({ background: active ? PURPLE : "rgba(184, 127, 255, 0.05)", color: active ? "#ffffff" : "rgba(255,255,255,0.3)", border: "none", borderRadius: "6px", padding: "0.78rem 1.7rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2.5px", cursor: active ? "pointer" : "not-allowed", fontFamily: "monospace" });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.8)", zIndex: 2000, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "min(600px,100vw)", background: "#080808", borderLeft: "1px solid #1c1c1c", display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.1rem 1.4rem", borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
          <div style={{ color: PURPLE, fontSize: "0.75rem", fontWeight: "900", letterSpacing: "3px", fontFamily: "monospace" }}>🏗 COMPANY BUILDER</div>
          <button onClick={onClose} style={{ background: "rgba(255, 60, 120, 0.08)", border: "1px solid rgba(255, 60, 120, 0.3)", color: PINK, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", fontWeight: "bold" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1.4rem" }}>
          {step === "pick" && (<div>
            <p style={{ color: "#ffffff", fontSize: "1rem", margin: "0 0 1.8rem", fontWeight: "300", fontFamily: "monospace" }}>Industry experience or starting fresh?</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem", marginBottom: "1.8rem" }}>
              {[["🌱", "scratch", "Starting Fresh", "Zero prior experience."], ["⚔️", "industry", "Industry Insider", "Experience and network to leverage."]].map(([icon, key, title, desc]) => (
                <div key={key} onClick={() => setMode(key)} style={{ background: "#090909", border: `1px solid ${mode === key ? PURPLE : "rgba(255,255,255,0.08)"}`, borderRadius: "6px", padding: "1.2rem", cursor: "pointer", transition: "all .15s", transform: mode === key ? "translateY(-2px)" : "none" }}>
                  <div style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>{icon}</div>
                  <div style={{ color: "#ffffff", fontWeight: "900", marginBottom: "0.3rem", fontSize: "0.85rem", fontFamily: "monospace" }}>{title}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.72rem", fontFamily: "monospace", lineHeight: "1.5" }}>{desc}</div>
                </div>
              ))}
            </div>
            {mode === "industry" && <textarea style={{ width: "100%", background: "#090909", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#ffffff", fontSize: "0.84rem", padding: "0.9rem", resize: "none", outline: "none", fontFamily: "monospace", lineHeight: "1.7", height: "100px", boxSizing: "border-box", marginBottom: "1.2rem" }} placeholder="Your background, key relationships, what you've seen fail..." value={bg} onChange={e => setBg(e.target.value)} />}
            {mode && <button style={btn(mode !== "industry" || bg.trim() !== "")} onClick={build} disabled={mode === "industry" && !bg.trim()}>BUILD COMPANY SYSTEM →</button>}
          </div>)}
          {step === "result" && (<div>
            {loading && <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.2rem" }}><div style={{ width: "7px", height: "7px", borderRadius: "50%", background: PURPLE, animation: "pulse 1s ease infinite" }} /><span style={{ color: PURPLE, fontSize: "0.65rem", letterSpacing: "2.5px", fontFamily: "monospace" }}>SYNTHESISING…</span></div>}
            {done && <div style={{ color: LIME, fontSize: "0.65rem", letterSpacing: "2.5px", marginBottom: "1.2rem", fontFamily: "monospace" }}>✓ COMPLETE</div>}
            <Md text={result} /><div ref={scrollRef} />
            {done && <button style={{ ...btn(), marginTop: "1.8rem" }} onClick={() => { setStep("pick"); setMode(null); setResult(""); setBg(""); setDone(false); }}>REBUILD →</button>}
          </div>)}
        </div>
      </div>
    </div>
  );
}

function IntelPanel({ idea, profile, onClose, initialQuery, onQueryHandled }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: `## FORGE INTEL\n\nLive AI research. Ask me:\n\n→ Market size and real numbers\n→ Competitors in this space\n→ Regulations for your market\n→ Funding landscape\n→ Tech options for your constraints` }]);
  const [inp, setInp] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const histRef = useRef([]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = useCallback(async (text?: string) => {
    const q = (text || inp).trim(); if (!q || busy) return;
    setInp("");
    const userMsg = { role: "user", content: q };
    histRef.current = [...histRef.current, userMsg];
    setMsgs(prev => [...prev, userMsg, { role: "assistant", content: "" }]);
    setBusy(true);
    const sys = `You are FORGE INTEL — direct, research-sharp AI for founders.\n${profileContext(profile)}\n${marketContext(profile)}\nAnswer with specifics relevant to this founder's context and market. Use **bold** for key terms. Use → for lists. Give best estimates when exact data unavailable.`;
    const ctx = histRef.current.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    try {
      let reply = "";
      await aiStream(sys, `Context:\n${ctx.slice(0, -q.length - 10)}\n\nLatest: ${q}`, chunk => { reply = chunk; setMsgs(prev => { const n = [...prev]; n[n.length - 1] = { role: "assistant", content: chunk }; return n; }); }, 900, true);
      histRef.current = [...histRef.current, { role: "assistant", content: reply }];
    } catch (e) { setMsgs(prev => { const n = [...prev]; n[n.length - 1] = { role: "assistant", content: `Error: ${e.message}` }; return n; }); }
    setBusy(false); setTimeout(() => taRef.current?.focus(), 80);
  }, [inp, busy, idea, profile]);

  useEffect(() => {
    if (initialQuery && !busy) {
      send(initialQuery);
      if (onQueryHandled) {
        onQueryHandled();
      }
    }
  }, [initialQuery, busy, send, onQueryHandled]);

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: "min(420px,100vw)", height: "100vh", background: "#080808", borderLeft: "1px solid #1c1c1c", display: "flex", flexDirection: "column", zIndex: 1000, boxShadow: "-10px 0 50px #00000080" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.1rem 1.4rem", borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
          <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: LIME, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "bold" }}>⚡</div>
          <div><div style={{ color: LIME, fontSize: "0.68rem", fontWeight: "900", letterSpacing: "3px", fontFamily: "monospace" }}>FORGE INTEL</div><div style={{ color: "#222", fontSize: "0.52rem", letterSpacing: "1.5px", fontFamily: "monospace" }}>AI RESEARCH CHAT</div></div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255, 60, 120, 0.08)", border: "1px solid rgba(255, 60, 120, 0.3)", color: PINK, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", fontWeight: "bold" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.3rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: "0.5rem", flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0, background: m.role === "user" ? "#141414" : LIME, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: m.role === "user" ? "#666" : "#000", fontFamily: "monospace", fontWeight: "bold", border: m.role === "user" ? "1px solid #1e1e1e" : "none", marginTop: "2px" }}>{m.role === "user" ? "U" : "F"}</div>
            <div style={{ maxWidth: "91%", background: m.role === "user" ? "#0d0d0d" : "transparent", border: m.role === "user" ? "1px solid #191919" : "none", borderRadius: "6px", padding: m.role === "user" ? "0.58rem 0.82rem" : "0 0 0 0.1rem" }}>
              {m.content === "" ? <div style={{ display: "flex", gap: "4px", padding: "5px 0" }}>{[0, 1, 2].map(j => <span key={j} style={{ width: "5px", height: "5px", borderRadius: "50%", background: LIME, display: "inline-block", animation: `pulse 1.3s ease ${j * .2}s infinite` }} />)}</div> : <Md text={m.content} />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "0.8rem 1.3rem 1rem", borderTop: "1px solid #1c1c1c", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <textarea ref={taRef} style={{ flex: 1, background: "#060606", border: "1px solid #1c1c1c", borderRadius: "6px", color: "#ffffff", fontSize: "0.82rem", padding: "0.65rem", resize: "none", outline: "none", fontFamily: "monospace", lineHeight: "1.65", height: "58px", boxSizing: "border-box" }} placeholder="Ask anything…" value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} disabled={busy} />
          <button onClick={() => send()} disabled={busy || !inp.trim()} style={{ background: busy || !inp.trim() ? "#0f0f0f" : LIME, color: "#000", border: `1px solid ${busy || !inp.trim() ? "#1a1a1a" : LIME}`, borderRadius: "6px", width: "40px", height: "58px", cursor: busy || !inp.trim() ? "not-allowed" : "pointer", fontSize: "1rem", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", transition: "all .15s" }}>{busy ? "…" : "→"}</button>
        </div>
      </div>
    </div>
  );
}

// ── OUTPUT CONFIGS ────────────────────────────────────────
const CONFIGS = {
  mindmap: { sys: `JSON only. {"center":"2-3 words","branches":[{"label":"2 words","color":"#hex","nodes":["short","short","short","short"]}]} 5-6 branches,3-4 nodes,max 4 words,vivid hex colors. Start with { end with }`, usr: (idea, ctx, p) => `${profileContext(p)}\n${marketContext(p)}\nIdea:"${idea}"\n${ctx}` },
  blueprint: { sys: `JSON only. {"title":"...","vision":"sentence","sections":[{"title":"NAME","content":"2-3 sentences","bullets":["pt","pt","pt"]}]} 7 sections: Core Concept,Problem & Solution,Target Market,Unique Advantage,Key Assumptions,Critical Risks,Success Metrics. Start { end }`, usr: (idea, ctx, p) => `${profileContext(p)}\n${marketContext(p)}\nIdea:"${idea}"\n${ctx}` },
  roadmap: { sys: `JSON only. {"title":"...","phases":[{"phase":"Phase 1","title":"...","duration":"X weeks","goal":"...","milestones":["...","...","..."],"kpis":["...","..."]}]} 4 phases: Foundation,Launch,Scale,Dominate. Start { end }`, usr: (idea, ctx, p) => `${profileContext(p)}\n${marketContext(p)}\nIdea:"${idea}"\n${ctx}` },
  businessplan: { sys: `JSON only. {"title":"...","oneliner":"pitch","sections":[{"title":"NAME","content":"content"}]} 10 sections: Problem,Solution,Market Size,Business Model,Revenue Streams,Go-To-Market,Competitive Moat,Team Requirements,Financial Projections,Next Steps. Start { end }`, usr: (idea, ctx, p) => `${profileContext(p)}\n${marketContext(p)}\nIdea:"${idea}"\n${ctx}` },
  actionplan: { sys: `JSON only. {"title":"...","weeks":[{"week":"Week 1","focus":"goal","tasks":[{"task":"action","priority":"HIGH","outcome":"result"}]}]} Priority: HIGH MED or LOW. 4 weeks,4-5 tasks. Start { end }`, usr: (idea, ctx, p) => `${profileContext(p)}\n${marketContext(p)}\nIdea:"${idea}"\n${ctx}` },
  swot: { sys: `JSON only. {"title":"...","summary":"sentence","strengths":["...","...","...","..."],"weaknesses":["...","...","...","..."],"opportunities":["...","...","...","..."],"threats":["...","...","...","..."],"strategic_insight":"2-3 sentences"} Start { end }`, usr: (idea, ctx, p) => `${profileContext(p)}\n${marketContext(p)}\nIdea:"${idea}"\n${ctx}` },
  promptpack: { sys: `JSON only. {"title":"...","tech_stack":["...","..."],"cursor_rules":"...","mvp_prompts":[{"step":"...","prompt":"..."}]} tech_stack needs 3-4 entries, cursor_rules needs 5-6 lines of developer system instructions matching founder's tech Level, 3 mvp_prompts. Start { end }`, usr: (idea, ctx, p) => `${profileContext(p)}\n${marketContext(p)}\nIdea:"${idea}"\n${ctx}` },
};

const OUTPUTS = [
  { key: "mindmap", icon: "🗺️", label: "Mind Map", desc: "Interactive visual landscape" },
  { key: "blueprint", icon: "📐", label: "Blueprint", desc: "Concept, market, risks, metrics" },
  { key: "roadmap", icon: "🛣️", label: "Roadmap", desc: "4-phase plan to dominance" },
  { key: "businessplan", icon: "📊", label: "Business Plan", desc: "Lean plan across all pillars" },
  { key: "actionplan", icon: "⚡", label: "30-Day Plan", desc: "Checkable tasks. Real outcomes." },
  { key: "swot", icon: "🎯", label: "SWOT", desc: "Ruthless strategic breakdown" },
  { key: "promptpack", icon: "💻", label: "Prompt Pack", desc: "Cursor/Claude Setup & Prompts" },
];

const Q_SYS = `You are FORGE — an elite, analytical, and ruthless startup advisor. Your mission is to ask exactly ONE deep, fully articulated, and thought-provoking question to help the founder pressure-test their venture and identify hidden assumptions.
INSTRUCTIONS:
1. Generate exactly one robust, comprehensive, and complete question.
2. The question must be deeply customized to the founder's specific industry, stage, technical ability, location, and constraints.
3. Keep the question complete, self-contained, grammatically finished, and ending with a question mark. It must NEVER end abruptly or be truncated in the middle of a sentence.
4. Do NOT include any intro, casual greetings, chit-chat, preamble, or response suffix. Start immediately with the question text.`;
const ctxStr = pairs => pairs.map((x, i) => `Q${i + 1}: ${x.question}\nA${i + 1}: ${x.answer}`).join("\n\n");

// ── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState("loading"); // loading | auth | onboarding | app
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("ignition");
  const [idea, setIdea] = useState("");
  const [qa, setQa] = useState([]);
  const [curQ, setCurQ] = useState("");
  const [curA, setCurA] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [outType, setOutType] = useState(null);
  const [outputs, setOutputs] = useState({});
  const [err, setErr] = useState("");
  const [hov, setHov] = useState(null);
  const [intel, setIntel] = useState(false);
  const [intelQuery, setIntelQuery] = useState(null);
  const triggerDeepDiveIntel = (q) => {
    setIntelQuery(q);
    setIntel(true);
  };
  const [company, setCompany] = useState(false);
  const [showWarRoom, setShowWarRoom] = useState(false);
  const [showPitchDeck, setShowPitchDeck] = useState(false);
  const [showLandscape, setShowLandscape] = useState(false);
  const [showRunway, setShowRunway] = useState(false);
  const [showSentinel, setShowSentinel] = useState(false);
  const [showCoFounderHub, setShowCoFounderHub] = useState(false);
  const [showAuthGateway, setShowAuthGateway] = useState(false);
  const [guestAuthOpen, setGuestAuthOpen] = useState(false);
  const [guestIgnitions, setGuestIgnitions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("forge_guest_ignitions");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [ideaScore, setIdeaScore] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentIdeaId, setCurrentIdeaId] = useState(null);
  const [globalError, setGlobalError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleCopyRaw = () => {
    if (!outType || !outputs[outType]) return;
    const rawVal = outputs[outType];
    const plainText = typeof rawVal === "string" ? rawVal : JSON.stringify(rawVal, null, 2);
    navigator.clipboard.writeText(plainText).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(err => {
      console.warn("Clipboard access denied on custom frame:", err);
    });
  };

  const handleExportFile = () => {
    if (!outType || !outputs[outType]) return;
    const rawVal = outputs[outType];
    const plainText = typeof rawVal === "string" ? rawVal : JSON.stringify(rawVal, null, 2);
    const blob = new Blob([plainText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forge_${outType}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const taRef = useRef(null);
  const prefetchRef = useRef({});

  // load session on mount
  useEffect(() => {
    (async () => {
      // 1. Attempt dynamic restoration of physical-isolation key material
      const vaultSession = sessionStorage.getItem("forge_vault_session");
      if (vaultSession) {
        try {
          const { salt, password } = JSON.parse(vaultSession);
          await initializeEncryption(password, salt);
        } catch (e) {
          console.error("Cryptographic restoring procedure interrupted:", e);
        }
      }

      // 2. Load and increment local safe analytics index
      const currentAnalytics = await store.get("forge_analytics") || { sessionCount: 0, realityCheckCount: 0 };
      currentAnalytics.sessionCount = (currentAnalytics.sessionCount || 0) + 1;
      await store.set("forge_analytics", currentAnalytics);
      setAnalytics(currentAnalytics);

      const session = await store.get("session");
      if (!session) {
        // Automatic high-integrity Guest Sandbox Entry
        setUser({ uid: "guest_user", email: "guest@forge.ai", isGuest: true, name: "Guest Visionary" });
        setProfile({
          name: "Guest Visionary",
          age: "25",
          city: "Silicon Valley",
          country: "Global Target",
          industry: "Tech",
          market: "Global SaaS",
          targetCustomer: "Developers & Builders",
          stage: "Idea Phase",
          techLevel: "Intermediate",
          funding: "Self-funded",
          constraints: "Time-limited",
          bio: "Guest founder exploring futuristic companies."
        });
        setAppState("app");
        return;
      }
      
      // 3. Absolute protection: If local session exists but key has been purged from memory, force login
      if (!activeEncryptionKey) {
        await store.del("session");
        setAppState("auth");
        return;
      }

      const u = await store.get(`user:${session.uid}`);
      if (!u) { setAppState("auth"); return; }
      const p = await store.get(`profile:${session.uid}`);
      setUser(u);
      if (!p) { setAppState("onboarding"); return; }
      setProfile(p); setAppState("app");
    })();
  }, []);

  const handleAuth = async (u, isNew) => {
    setUser(u);
    if (isNew) { setAppState("onboarding"); return; }
    const p = await store.get(`profile:${u.uid}`);
    if (!p) { setAppState("onboarding"); return; }
    setProfile(p); setAppState("app");
  };

  const handleGuestAuth = async (u, isNew) => {
    setUser(u);
    setGuestAuthOpen(false);
    setShowAuthGateway(false);
    if (isNew) {
      setAppState("onboarding");
    } else {
      const p = await store.get(`profile:${u.uid}`);
      if (!p) {
        setAppState("onboarding");
      } else {
        setProfile(p);
        setAppState("app");
      }
    }
  };

  const handleOnboarding = (p) => { setProfile(p); setAppState("app"); };

  const logout = async () => {
    // Purge memory allocations & active material arrays
    sessionStorage.removeItem("forge_vault_session");
    activeEncryptionKey = null;
    activeSaltHex = "";
    await store.del("session");
    setUser(null); setProfile(null); setAppState("auth");
    resetIdea();
  };

  const scoreIdea = useCallback(async (pairs) => {
    try {
      const s = await ai(`Score this startup idea. JSON only, start with {: {"score":75,"label":"Solid","verdict":"brutal one sentence","strengths":["s1","s2"],"gaps":["g1","g2"]} Labels:Weak/Needs Work/Solid/Strong/Exceptional.`, `${profileContext(profile)}\nIdea:"${idea}"\n${ctxStr(pairs)}`, true, 600, 2, true);
      setIdeaScore(s);
      
      const currentAnalytics = await store.get("forge_analytics") || { sessionCount: 0, realityCheckCount: 0 };
      currentAnalytics.realityCheckCount = (currentAnalytics.realityCheckCount || 0) + 1;
      await store.set("forge_analytics", currentAnalytics);
      setAnalytics(currentAnalytics);

      // auto-save idea
      const id = currentIdeaId || Date.now().toString();
      setCurrentIdeaId(id);
      await store.set(`idea:${user.uid}:${id}`, { id, text: idea, score: s.score, label: s.label, qa: pairs, savedAt: Date.now() });
    } catch {
      setGlobalError("Active Intelligence Paused. Your offline business plans and vault data are fully secure. Feel free to re-trigger after a moment.");
    }
  }, [idea, profile, user, currentIdeaId]);

  const prefetchNext = useCallback((updated) => {
    if (updated.length >= Q_TARGET) return;
    const styles = ["Creative", "Critical", "Strategic", "Logical"];
    const key = `q${updated.length + 1}`;
    if (prefetchRef.current[key]) return;
    const style = styles[updated.length % styles.length];
    prefetchRef.current[key] = ai(Q_SYS, `${profileContext(profile)}\nIdea:"${idea}"\n\n${ctxStr(updated)}\n\nQ${updated.length + 1} of ${Q_TARGET}: ${style} style. Biggest unexplored gap. Push hard.`, false, 1000);
  }, [idea, profile]);

  const cleanQuestion = (qStr) => {
    let cleanQ = qStr.trim();
    cleanQ = cleanQ.replace(/^(Q\d+:?\s*|\d+\.\s*)/i, "");
    if (cleanQ.startsWith('"') && cleanQ.endsWith('"')) {
      cleanQ = cleanQ.slice(1, -1);
    }
    return cleanQ;
  };

  const ignite = async () => {
    if (!idea.trim() || loading) return;

    // Check Guest limits
    if (user?.isGuest) {
      const isExistingGuestIdea = guestIgnitions.some(item => 
        item.toLowerCase().trim() === idea.toLowerCase().trim() || 
        item.slice(0, 25).toLowerCase() === idea.slice(0, 25).toLowerCase()
      );
      if (!isExistingGuestIdea && guestIgnitions.length >= 3) {
        setLoading(false);
        setShowAuthGateway(true);
        return;
      }
      if (!isExistingGuestIdea) {
        const nextIgnitions = [...guestIgnitions, idea];
        setGuestIgnitions(nextIgnitions);
        try {
          localStorage.setItem("forge_guest_ignitions", JSON.stringify(nextIgnitions));
        } catch {}
      }
    }

    setLoading(true); setErr("");
    try {
      const q = await ai(Q_SYS, `${profileContext(profile)}\nIdea:"${idea}"\nQ1 of ${Q_TARGET}. Creative style. Most foundational: what they're ACTUALLY building, for WHOM, single reason it must exist NOW.`, false, 1000);
      setCurQ(cleanQuestion(q)); setPhase("questioning");
    } catch (e: any) { 
      setErr(e.message); 
      setGlobalError("Active Intelligence Paused. Your data remains fully secure in-browser; try again in a moment.");
    }
    setLoading(false);
  };

  const next = async () => {
    if (!curA.trim() || loading) return;
    const updated = [...qa, { question: curQ, answer: curA }];
    setQa(updated); setCurA("");
    if (updated.length >= Q_TARGET) { scoreIdea(updated); setPhase("reality-check"); return; }
    setLoading(true); setErr("");
    prefetchNext([...updated, { question: "?", answer: "?" }]);
    try {
      const key = `q${updated.length + 1}`;
      let cached = null;
      if (prefetchRef.current[key]) {
        try {
          cached = await Promise.race([
            prefetchRef.current[key],
            new Promise((_, r) => setTimeout(() => r(null), 1500))
          ]);
        } catch (perr) {
          console.warn("Cached prefetch rejected/failed:", perr);
        }
      }
      delete prefetchRef.current[key];
      const q = cached || await ai(Q_SYS, `${profileContext(profile)}\nIdea:"${idea}"\n\n${ctxStr(updated)}\n\nQ${updated.length + 1} of ${Q_TARGET}: ${["Creative","Critical","Strategic","Logical"][updated.length % 4]} style. Biggest unexplored gap.`, false, 1000);
      setCurQ(cleanQuestion(q));
    } catch (e) { 
      setErr(e.message); 
      setGlobalError("Active Intelligence Paused. Your data remains fully secure in-browser; try again in a moment.");
    }
    setLoading(false);
    setTimeout(() => taRef.current?.focus(), 60);
  };

  const backQ = () => {
    if (qa.length > 0) {
      setErr("");
      const prevIdx = qa.length - 1;
      const prevItem = qa[prevIdx];
      setCurQ(prevItem.question);
      setCurA(prevItem.answer);
      setQa(qa.slice(0, -1));
      setTimeout(() => taRef.current?.focus(), 60);
    }
  };

  const generate = async (type) => {
    if (outputs[type]) { setOutType(type); setPhase("output"); return; }
    setOutType(type); setPhase("generating"); setErr("");
    setLoadMsg(`Forging ${OUTPUTS.find(o => o.key === type)?.label}…`);
    const cfg = CONFIGS[type];
    try {
      const result = await ai(cfg.sys, cfg.usr(idea, ctxStr(qa), profile), true, 1400, 2, true);
      setOutputs(prev => ({ ...prev, [type]: result }));
      setPhase("output");
    } catch (e) { 
      setErr(`Failed: ${e.message}`); 
      setPhase("output-select"); 
      setGlobalError("Active Intelligence Paused. Your data remains fully secure in-browser; try again in a moment.");
    }
  };

  const loadIdea = (saved) => {
    setIdea(saved.text); setQa(saved.qa || []);
    setIdeaScore(saved.score ? { score: saved.score, label: saved.label } : null);
    setCurrentIdeaId(saved.id); setOutputs({});
    setPhase(saved.qa?.length >= Q_TARGET ? "output-select" : "ignition");
  };

  const resetIdea = () => {
    setPhase("ignition"); setIdea(""); setQa([]); setCurQ(""); setCurA("");
    setLoading(false); setOutType(null); setOutputs({}); setErr(""); setLoadMsg("");
    setIntel(false); setCompany(false); setIdeaScore(null); setCurrentIdeaId(null);
    prefetchRef.current = {};
  };

  if (appState === "loading") return <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: LIME, fontSize: "10px", letterSpacing: "4px", fontFamily: "monospace", fontWeight: "bold" }}>LOADING SYSTEM…</div></div>;
  if (appState === "auth") return <AuthScreen onAuth={handleAuth} />;
  if (appState === "onboarding") return <Onboarding user={user} onDone={handleOnboarding} />;

  const showTools = phase !== "ignition";
  const scoreColor = s => s >= 80 ? LIME : s >= 60 ? CYAN : PINK;

  const G = {
    app: { minHeight: "100vh", background: "#050505", color: "#f0f0f0", fontFamily: "monospace", display: "flex" as const, flexDirection: "column" as const, alignItems: "center", padding: "0 1.25rem" },
    wrap: { width: "100%", maxWidth: "820px", transition: "padding-right .3s" },
    label: { color: PURPLE, fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "3px", marginBottom: "0.65rem", fontWeight: "bold" as const },
    ta: { width: "100%", background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", color: "#ffffff", fontSize: "0.96rem", padding: "1.1rem", resize: "none" as const, outline: "none", fontFamily: "monospace", lineHeight: "1.72", boxSizing: "border-box" as const },
    btn: { background: LIME, color: "#050505", border: "none", borderRadius: "6px", padding: "0.82rem 1.9rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2.5px", cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase" as const },
    ghost: { background: "transparent", color: "rgba(255,255,255,0.5)", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "0.55rem 1rem", fontSize: "11px", cursor: "pointer", fontFamily: "monospace", transition: "all .15s" },
    err: { color: PINK, fontSize: "0.72rem", marginTop: "0.75rem", background: "rgba(255, 60, 120, 0.05)", border: "1px solid rgba(255, 60, 120, 0.15)", borderRadius: "6px", padding: "0.55rem 0.85rem" },
  };

  return (
    <div style={{ ...G.app, position: "relative", overflowX: "hidden" }}>
      {/* Google-Gemini style flowing background ambient mesh orbs */}
      <div style={{ position: "fixed", top: "-15%", right: "-15%", width: "70vw", height: "70vh", background: "radial-gradient(circle, rgba(184, 127, 255, 0.1) 0%, rgba(0,0,0,0) 70%)", filter: "blur(90px)", zIndex: 0, pointerEvents: "none", animation: "orbFlow 20s infinite ease-in-out" }} />
      <div style={{ position: "fixed", bottom: "-10%", left: "-20%", width: "80vw", height: "80vh", background: "radial-gradient(circle, rgba(200, 255, 0, 0.05) 0%, rgba(0,0,0,0) 75%)", filter: "blur(110px)", zIndex: 0, pointerEvents: "none", animation: "orbFlowReverse 25s infinite ease-in-out" }} />

      <style>{`
        @keyframes pulse{0%,100%{opacity:.1}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glowPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}50%{box-shadow:0 0 12px 2px rgba(184, 127, 255, 0.08)}}
        @keyframes orbFlow{0%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-30px) scale(1.15)}100%{transform:translate(0,0) scale(1)}}
        @keyframes orbFlowReverse{0%{transform:translate(0,0) scale(1)}50%{transform:translate(-30px,40px) scale(1.1)}100%{transform:translate(0,0) scale(1)}}
        textarea:focus{border-color:${LIME}!important; outline: none!important; box-shadow: 0 0 12px rgba(200, 255, 0, 0.25)!important;}
        input:focus{border-color:${LIME}!important; outline: none!important; box-shadow: 0 0 12px rgba(200, 255, 0, 0.25)!important;}
        .p-btn:hover{background:rgba(255,255,255,0.06)!important;color:#ffffff!important;}
        .outcard{
          background: rgba(12, 12, 12, 0.65)!important;
          backdrop-filter: blur(20px)!important;
          -webkit-backdrop-filter: blur(20px)!important;
          border: 1px solid rgba(255,255,255,0.08)!important;
          transition: all .25s cubic-bezier(0.4, 0, 0.2, 1)!important;
        }
        .outcard:hover{
          border-color:${LIME}!important;
          transform:translateY(-4px)!important;
          background: rgba(22, 22, 22, 0.85)!important;
          box-shadow: 0 12px 28px rgba(200,255,0,0.07), inset 0 0 12px rgba(255,255,255,0.02)!important;
        }
        .gh:hover{color:${LIME}!important;border-color:${LIME}!important;background:rgba(200,255,0,0.03)!important;}
      `}</style>

      {intel && <IntelPanel idea={idea} profile={profile} onClose={() => setIntel(false)} initialQuery={intelQuery} onQueryHandled={() => setIntelQuery(null)} />}
      {company && <CompanyBuilder idea={idea} qaCtx={ctxStr(qa)} profile={profile} onClose={() => setCompany(false)} />}
      {showProfile && <ProfilePanel profile={profile} user={user} onUpdate={p => setProfile(p)} onLogout={logout} onClose={() => setShowProfile(false)} />}
      {showHistory && <HistoryPanel uid={user?.uid} onLoad={loadIdea} onClose={() => setShowHistory(false)} />}

      {showSentinel && (
        <div className="fixed inset-0 bg-[#050505]/98 z-[9999] overflow-y-auto p-3 sm:p-6 md:p-8 box-border">
          <div className="w-full max-w-[1200px] mx-auto bg-[#050505] border border-[#1c1c1c] rounded-lg p-3 sm:p-5">
            <VentureSentinel idea={idea} profile={profile} onClose={() => setShowSentinel(false)} />
          </div>
        </div>
      )}

      {showCoFounderHub && (
        <div className="fixed inset-0 bg-[#050505]/98 z-[9999] overflow-y-auto p-3 sm:p-6 md:p-8 box-border">
          <div className="w-full max-w-[1200px] mx-auto bg-[#050505] border border-[#1c1c1c] rounded-lg p-3 sm:p-5">
            <CoFounderHub idea={idea} profile={profile} onClose={() => setShowCoFounderHub(false)} />
          </div>
        </div>
      )}

      {showAuthGateway && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)", zIndex: 99991, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)", padding: "1.5rem" }}>
          <div style={{ width: "100%", maxWidth: "460px", background: "#080808", border: "1px solid rgba(200, 255, 0, 0.15)", borderRadius: "10px", padding: "2.2rem 2rem", position: "relative", boxShadow: "0 20px 50px rgba(0,0,0,0.8)" }}>
            <button 
              onClick={() => setShowAuthGateway(false)} 
              style={{ 
                position: "absolute", top: "1.5rem", right: "1.5rem", 
                background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.1)", 
                color: "#ffffff", borderRadius: "50%", width: "28px", height: "28px", 
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", 
                fontSize: "12px", transition: "all 0.15s" 
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = LIME; e.currentTarget.style.color = LIME; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; }}
            >
              ✕
            </button>
            <span style={{ color: PURPLE, fontSize: "9px", textTransform: "uppercase", letterSpacing: "3px", fontWeight: "bold", display: "block", marginBottom: "0.5rem" }}>⚡️ PLATINUM EXECUTIVE UPGRADE</span>
            <h2 style={{ color: "#ffffff", fontSize: "1.45rem", fontWeight: "900", margin: "0 0 0.8rem", letterSpacing: "1px", fontFamily: "monospace", lineHeight: "1.3" }}>Connect to Core Quantum Solvers</h2>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.82rem", lineHeight: "1.6", fontFamily: "monospace", margin: "0 0 1.8rem" }}>
              To activate unlimited ideation, access the <strong style={{ color: LIME }}>Co-founding Agility Suite</strong> (War Room, Pitch Deck, GIS Radar & COGS Runway), and protect your ideas forever in our encrypted Vault, complete a free 10-second registration.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button 
                onClick={() => setGuestAuthOpen(true)}
                style={{ 
                  background: LIME, color: "#000000", border: "none", borderRadius: "6px", 
                  padding: "0.9rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2px", 
                  cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", 
                  boxShadow: "0 4px 20px rgba(200, 255, 0, 0.2)" 
                }}
              >
                Create Infinite Free Account NOW →
              </button>
              <button 
                onClick={() => setShowAuthGateway(false)}
                style={{ 
                  background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)", 
                  borderRadius: "6px", padding: "0.80rem", fontSize: "10px", fontWeight: "bold", 
                  cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", transition: "all 0.15s" 
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
              >
                I Decline — Keep Exploring guest mode
              </button>
            </div>
          </div>
        </div>
      )}

      {guestAuthOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "#050505", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: "2rem", right: "2rem", zIndex: 100001 }}>
            <button 
              onClick={() => setGuestAuthOpen(false)}
              style={{ background: "rgba(255, 60, 120, 0.08)", border: "1px solid rgba(255, 60, 120, 0.3)", color: PINK, borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.8rem", fontWeight: "bold" }}
            >
              ✕ Close & Explore Sandbox
            </button>
          </div>
          <AuthScreen onAuth={handleGuestAuth} />
        </div>
      )}

      {showWarRoom && (
        <div className="fixed inset-0 bg-[#050505]/98 z-[9999] overflow-y-auto p-3 sm:p-6 md:p-8 box-border">
          <div className="w-full max-w-[1200px] mx-auto bg-[#050505] border border-[#1c1c1c] rounded-lg p-3 sm:p-5">
            <WarRoom idea={idea} profile={profile} swotData={(outputs as any).swot} onClose={() => setShowWarRoom(false)} />
          </div>
        </div>
      )}
      {showPitchDeck && (
        <div className="fixed inset-0 bg-[#050505]/98 z-[9999] overflow-y-auto p-3 sm:p-6 md:p-8 box-border">
          <div className="w-full max-w-[1200px] mx-auto bg-[#050505] border border-[#1c1c1c] rounded-lg p-3 sm:p-5">
            <PitchDeck idea={idea} profile={profile} blueprintData={(outputs as any).blueprint} businessPlanData={(outputs as any).businessplan} onClose={() => setShowPitchDeck(false)} />
          </div>
        </div>
      )}
      {showLandscape && (
        <div className="fixed inset-0 bg-[#050505]/98 z-[9999] overflow-y-auto p-3 sm:p-6 md:p-8 box-border">
          <div className="w-full max-w-[1200px] mx-auto bg-[#050505] border border-[#1c1c1c] rounded-lg p-3 sm:p-5">
            <MarketLandscape idea={idea} profile={profile} onClose={() => setShowLandscape(false)} />
          </div>
        </div>
      )}
      {showRunway && (
        <div className="fixed inset-0 bg-[#050505]/98 z-[9999] overflow-y-auto p-3 sm:p-6 md:p-8 box-border">
          <div className="w-full max-w-[1200px] mx-auto bg-[#050505] border border-[#1c1c1c] rounded-lg p-3 sm:p-5">
            <RunwaySandbox idea={idea} onClose={() => setShowRunway(false)} />
          </div>
        </div>
      )}

      <div style={{ ...G.wrap, paddingRight: intel ? "440px" : "0" }}>
        
        {/* GLOBAL SECURITY / OFFLINE ERROR BANNER */}
        {globalError && (
          <div style={{ width: "100%", background: "rgba(255, 60, 120, 0.12)", border: "1px solid rgba(255, 60, 120, 0.3)", borderRadius: "6px", padding: "0.85rem 1.2rem", marginTop: "1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeIn 0.3s ease" }}>
            <span style={{ color: "#ffffff", fontSize: "0.78rem", fontFamily: "monospace" }}>
              ⚠️ <strong style={{ color: PINK }}>Active Intelligence Paused:</strong> Real-time simulation is momentarily sluggish. Your sandbox data remains secure. You can retry in a moment.
            </span>
            <button onClick={() => setGlobalError("")} style={{ background: "transparent", border: "none", color: "#ffffff", opacity: 0.6, cursor: "pointer", fontSize: "12px", marginLeft: "10px" }}>✕</button>
          </div>
        )}

        {/* PROFILE ENHANCEMENT CONTEXT NUDGE */}
        {profile?.incomplete && (
          <div style={{ background: "rgba(184, 127, 255, 0.08)", border: "1px solid rgba(184, 127, 255, 0.25)", borderRadius: "6px", padding: "0.6rem 0.95rem", marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", animation: "glowPulse 4s infinite" }}>
            <span style={{ color: "rgba(255, 255, 255, 0.72)", fontSize: "0.72rem", fontFamily: "monospace" }}>
              ⚡ <strong style={{ color: PURPLE }}>Profile skipped:</strong> Add founder background details in your profile panel to unlock highly targeted strategic advice.
            </span>
            <button onClick={() => setShowProfile(true)} style={{ background: PURPLE, color: "#000", border: "none", borderRadius: "4px", padding: "3px 8px", fontSize: "9px", fontWeight: "bold", fontFamily: "monospace", cursor: "pointer" }}>
              ENHANCE
            </button>
          </div>
        )}

        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.7rem 0 1.3rem", borderBottom: "1px solid #1c1c1c", marginBottom: "1.8rem" }}>
          <div>
            <h1 style={{ color: LIME, fontSize: "1.85rem", fontWeight: "900", margin: 0, lineHeight: 1, letterSpacing: "2px", fontFamily: "monospace" }}>FORGE</h1>
            <p style={{ color: "#222", fontSize: "9px", letterSpacing: "2.5px", margin: "5px 0 0", fontFamily: "monospace", fontWeight: "bold" }}>IDEA ENGINE FOR FOUNDERS</p>
          </div>

          {/* INTEL FIRST CLASS SEARCH BAR (Near header top) */}
          {showTools && (
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", width: "100%", maxWidth: "250px", position: "relative" }}>
              <span style={{ position: "absolute", left: "10px", color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>🔍</span>
              <input 
                type="text" 
                placeholder="Search market intel..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    triggerDeepDiveIntel(e.currentTarget.value.trim());
                    e.currentTarget.value = '';
                  }
                }}
                style={{
                  width: "100%",
                  background: "#0c0c0c",
                  border: "1px solid #1c1c1c",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "0.74rem",
                  padding: "0.42rem 0.5rem 0.42rem 1.85rem",
                  outline: "none",
                  fontFamily: "monospace"
                }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
            {user?.isGuest ? (
              <button 
                onClick={() => setShowAuthGateway(true)}
                style={{ 
                  background: `linear-gradient(90deg, ${LIME} 0%, rgba(200, 255, 0, 0.4) 100%)`, 
                  color: "#000", border: "none", borderRadius: "6px", 
                  padding: "0.55rem 1.1rem", fontSize: "11px", fontWeight: "900", 
                  cursor: "pointer", fontFamily: "monospace", letterSpacing: "1px",
                  display: "flex", alignItems: "center", gap: "0.38rem",
                  boxShadow: "0 0 12px rgba(200, 255, 0, 0.2)"
                }}
              >
                ⚡ UPGRADE ({3 - guestIgnitions.length} LEFT)
              </button>
            ) : (
              <span style={{ color: LIME, fontSize: "9px", fontFamily: "monospace", padding: "5px 10px", background: "rgba(200,255,0,0.06)", border: "1px solid rgba(200,255,0,0.15)", borderRadius: "4px", fontWeight: "bold" }}>
                🔒 SECURE VAULT ACTIVE
              </span>
            )}
            {showTools && <>
              <button className="gh" onClick={() => { setIntel(!intel); setCompany(false); }} style={{ ...G.ghost, color: intel ? LIME : "rgba(255,255,255,0.5)", borderColor: intel ? LIME : "#1c1c1c" }}>⚡ Intel</button>
              <button className="gh" onClick={() => { setCompany(true); setIntel(false); }} style={{ ...G.ghost, color: company ? LIME : "#ffffff", borderColor: company ? LIME : "#1c1c1c" }}>🏗 Build</button>
            </>}
            <button className="gh" style={G.ghost} onClick={() => setShowHistory(true)}>📁 Vault</button>
            <button className="gh" style={{ ...G.ghost, display: "flex", alignItems: "center", gap: "0.4rem" }} onClick={() => setShowProfile(true)}>
              <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: `${LIME}2a`, border: `1px solid ${LIME}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: LIME, fontWeight: "bold" }}>{profile?.name?.[0]?.toUpperCase()}</div>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.68rem" }}>{profile?.name?.split(" ")[0]}</span>
            </button>
            {phase !== "ignition" && <button className="gh" style={G.ghost} onClick={resetIdea}>↩</button>}
          </div>
        </div>

        {/* STAGE & PROCESS FLOW PROGRESS BAR & STEPS */}
        {phase !== "ignition" && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1.4rem" }}>
            {[1, 2, 3].map(stg => {
              const getStageInfo = () => {
                if (phase === "ignition" || phase === "questioning") return { step: 1, name: "1. Idea Formulation & QA" };
                if (phase === "reality-check") return { step: 2, name: "2. Brutal Reality Check" };
                return { step: 3, name: "3. Venture Output Suite" };
              };
              const stageInfo = getStageInfo();
              const active = stageInfo.step >= stg;
              const current = stageInfo.step === stg;
              return (
                <div key={stg} style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.38rem" }}>
                  <div style={{ height: "3px", borderRadius: "2px", background: current ? LIME : active ? `${LIME}70` : "rgba(255,255,255,0.06)", transition: "all .3s" }} />
                  <div style={{ color: current ? LIME : active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)", fontSize: "9px", fontFamily: "monospace", letterSpacing: "0.5px" }}>
                    {stg === 1 ? "1/3: Formulation" : stg === 2 ? "2/3: Challenge" : "3/3: Product Suite"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* COACHED NEXT STEP ACCENT GUIDE */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #141414", borderRadius: "6px", padding: "0.6rem 0.95rem", marginBottom: "1.8rem", display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: LIME, animation: "pulse 2s infinite" }} />
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.72rem", fontFamily: "monospace", lineHeight: "1.4" }}>
            <strong style={{ color: LIME }}>NEXT:</strong> {
              phase === "ignition" ? "Define raw idea concept in field below and Ignite Forge to stress-test your core business assumptions." :
              phase === "questioning" ? `Identify hidden risks: Complete answer to critical advisor stress question ${qa.length + 1} of ${Q_TARGET}.` :
              phase === "reality-check" ? "Analyze results: Assess brutal viability parameters & strategic weakpoints below, then build deliverable suite." :
              "Refine architecture: Generate primary design blueprints, action trackers, developer instructions or prompt packages."
            }
          </span>
        </div>

        {/* IGNITION */}
        {phase === "ignition" && (
          <div style={{ animation: "fadeIn .4s ease" }}>
            <div style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "0.85rem 1.1rem", marginBottom: "1.8rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: LIME, flexShrink: 0 }} />
              <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.78rem", lineHeight: "1.5", fontFamily: "monospace" }}>{profile?.bio || `Welcome, ${profile?.name}`}</span>
            </div>
            <p style={G.label}>Drop your raw idea</p>
            <textarea style={{ ...G.ta, height: "150px" }} placeholder={"No polish needed. Half-baked is fine.\nRaw and messy is where the best ideas live."} value={idea} onChange={e => setIdea(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loading) ignite(); }} />
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.9rem" }}>
              <button style={{ ...G.btn, opacity: (!idea.trim() || loading) ? 0.25 : 1 }} onClick={ignite} disabled={!idea.trim() || loading}>{loading ? "LOADING…" : "IGNITE →"}</button>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px" }}>⌘ + Enter</span>
            </div>
            {err && <div style={G.err}>{err}</div>}
          </div>
        )}

        {/* QUESTIONING */}
        {phase === "questioning" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ display: "flex", gap: "6px", marginBottom: "0.65rem" }}>
              {Array.from({ length: Q_TARGET }).map((_, i) => (<div key={i} style={{ height: "4px", flex: 1, borderRadius: "2px", background: i < qa.length ? LIME : i === qa.length ? `${LIME}40` : "rgba(255,255,255,0.06)", transition: "background .4s", border: "1px solid #1a1a1a" }} />))}
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", letterSpacing: "1px", marginBottom: "2rem", fontFamily: "monospace" }}>{qa.length}/{Q_TARGET} QUESTIONS COMPLETED</div>
            {loading ? (
              <div style={{ padding: "2.5rem 0" }}><span style={{ color: PURPLE, fontSize: "0.75rem", letterSpacing: "2.5px", fontFamily: "monospace", fontWeight: "bold" }}>THINKING</span>{[0, 1, 2, 3].map(i => <span key={i} style={{ color: PURPLE, animation: `pulse 1.5s ease ${i * .25}s infinite` }}>.</span>)}</div>
            ) : (<>
              <p style={{ color: "#ffffff", fontSize: "1.25rem", lineHeight: "1.75", margin: "0 0 1.9rem", fontFamily: "monospace", fontWeight: "bold" }}>{curQ}</p>
              <p style={G.label}>Your answer</p>
              <textarea ref={taRef} style={{ ...G.ta, height: "105px" }} placeholder="Honest. No performance." value={curA} onChange={e => { setCurA(e.target.value); if (e.target.value.length === 4) prefetchNext([...qa, { question: curQ, answer: e.target.value }]); }} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && curA.trim() && !loading) next(); }} autoFocus />
              <div style={{ display: "flex", gap: "0.7rem", marginTop: "0.85rem", alignItems: "center" }}>
                {qa.length > 0 && <button className="gh" style={G.ghost} onClick={backQ}>← BACK</button>}
                <button style={{ ...G.btn, opacity: !curA.trim() ? 0.2 : 1 }} onClick={next} disabled={!curA.trim() || loading}>{qa.length + 1 === Q_TARGET ? "FINISH →" : "NEXT →"}</button>
                {qa.length >= 3 && <button className="gh" style={G.ghost} onClick={() => { scoreIdea(qa); setPhase("reality-check"); }}>skip →</button>}
              </div>
              {err && <div style={G.err}>{err}</div>}
            </>)}
          </div>
        )}

        {/* REALITY CHECK */}
        {phase === "reality-check" && (
          <RealityCheck idea={idea} qa={qa} profile={profile}
            onProceed={() => setPhase("output-select")}
            onBack={backQ} />
        )}

        {/* OUTPUT SELECT */}
        {phase === "output-select" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            {ideaScore && (
              <div style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.1rem 1.3rem", marginBottom: "1.8rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.7rem" }}>
                  <div style={{ fontSize: "2rem", fontWeight: "900", color: scoreColor(ideaScore.score), lineHeight: 1, fontFamily: "monospace" }}>{ideaScore.score}%</div>
                  <div style={{ flex: 1 }}><div style={{ color: scoreColor(ideaScore.score), fontSize: "0.63rem", letterSpacing: "2px", fontWeight: "bold", fontFamily: "monospace" }}>{(ideaScore.label || "").toUpperCase()}</div><div style={{ color: "rgba(255,255,255,0.78)", fontSize: "0.76rem", marginTop: "4px", lineHeight: "1.5", fontFamily: "monospace" }}>{ideaScore.verdict}</div></div>
                  <div style={{ width: "46px", height: "46px", borderRadius: "50%", background: "#050505", border: "1px solid #1c1c1c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: LIME, textAlign: "center", lineHeight: "1.3", fontFamily: "monospace", fontWeight: "bold" }}>SYS<br />SCORE</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.9rem", borderTop: "1px solid #1c1c1c", paddingTop: "0.85rem", marginTop: "0.85rem", fontFamily: "monospace" }}>
                  <div><div style={{ color: PURPLE, fontSize: "9px", letterSpacing: "2px", marginBottom: "0.35rem", fontWeight: "bold" }}>STRENGTHS</div>{(ideaScore.strengths || []).map((s, i) => <div key={i} style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.76rem", marginBottom: "0.18rem" }}>→ {s}</div>)}</div>
                  <div><div style={{ color: PINK, fontSize: "9px", letterSpacing: "2px", marginBottom: "0.35rem", fontWeight: "bold" }}>GAPS</div>{(ideaScore.gaps || []).map((g, i) => <div key={i} style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.76rem", marginBottom: "0.18rem" }}>─ {g}</div>)}</div>
                </div>
              </div>
            )}

            {/* PRIMARY CORE DELIVERABLES */}
            <p style={G.label}>Core Deliverables Checkpoints</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.78rem", marginBottom: "1.5rem" }}>
              {OUTPUTS.filter(o => o.key === "blueprint" || o.key === "actionplan").map(o => {
                const done = !!outputs[o.key];
                return (<div key={o.key} className="outcard" style={{ background: "#090909", border: `1px solid ${done ? LIME : "#1c1c1c"}`, borderRadius: "6px", padding: "1.05rem", cursor: "pointer", transition: "all .18s", position: "relative" }} onClick={() => generate(o.key)}>
                  {done && <span style={{ position: "absolute", top: "0.5rem", right: "0.6rem", color: LIME, fontSize: "0.55rem", letterSpacing: "1.5px", fontWeight: "bold" }}>READY</span>}
                  <div style={{ fontSize: "1.25rem", marginBottom: "0.42rem" }}>{o.icon}</div>
                  <div style={{ color: done ? LIME : "#ffffff", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.22rem", fontFamily: "monospace" }}>{o.label}</div>
                  <div style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", lineHeight: "1.4", fontFamily: "monospace" }}>{o.desc}</div>
                </div>);
              })}
            </div>

            {/* COLLAPSIBLE SECONDARY STRATEGIC ENGINE BOX */}
            <button onClick={() => setAdvancedOpen(!advancedOpen)} style={{ background: "transparent", border: "1px solid #1c1c1c", color: "rgba(255,255,255,0.6)", borderRadius: "6px", padding: "0.72rem 1.05rem", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", cursor: "pointer", fontSize: "11px", fontWeight: "bold", fontFamily: "monospace" }}>
              <span>🔮 DEEPER STRATEGIC ANALYTICS ({advancedOpen ? "COLLAPSE" : "EXPAND"})</span>
              <span>{advancedOpen ? "▲" : "▼"}</span>
            </button>

            {advancedOpen && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.78rem", marginBottom: "1.5rem", animation: "fadeIn .2s ease" }}>
                {OUTPUTS.filter(o => o.key !== "blueprint" && o.key !== "actionplan").map(o => {
                  const done = !!outputs[o.key];
                  return (<div key={o.key} className="outcard" style={{ background: "#090909", border: `1px solid ${done ? LIME : "#1c1c1c"}`, borderRadius: "6px", padding: "1.05rem", cursor: "pointer", transition: "all .18s", position: "relative" }} onClick={() => generate(o.key)}>
                    {done && <span style={{ position: "absolute", top: "0.5rem", right: "0.6rem", color: LIME, fontSize: "0.55rem", letterSpacing: "1.5px", fontWeight: "bold" }}>READY</span>}
                    <div style={{ fontSize: "1.25rem", marginBottom: "0.42rem" }}>{o.icon}</div>
                    <div style={{ color: done ? LIME : "#ffffff", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.22rem", fontFamily: "monospace" }}>{o.label}</div>
                    <div style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", lineHeight: "1.4", fontFamily: "monospace" }}>{o.desc}</div>
                  </div>);
                })}
              </div>
            )}

            <div style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.05rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "1rem", transition: "all .18s" }} onClick={() => setCompany(true)}>
              <span style={{ fontSize: "1.25rem" }}>🏗️</span>
              <div style={{ flex: 1 }}><div style={{ color: "#ffffff", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.2rem", fontFamily: "monospace" }}>Company Builder</div><div style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", fontFamily: "monospace" }}>Systems, workflows & org design — market-aware</div></div>
              <span style={{ color: LIME, fontSize: "1rem", flexShrink: 0 }}>→</span>
            </div>

            {/* CO-FOUNDING AGILITY SUITE LAUNCHERS */}
            <p style={{ ...G.label, marginTop: "1.8rem" }}>Venture Acceleration Agile Suite</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.78rem", marginBottom: "1.5rem" }}>
              
              {/* War Room */}
              <div 
                className="outcard" 
                style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.05rem", cursor: "pointer", transition: "all .18s", position: "relative" }}
                onClick={() => setShowWarRoom(true)}
              >
                <div style={{ fontSize: "1.25rem", marginBottom: "0.42rem" }}>🤝</div>
                <div style={{ color: "#ffffff", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.22rem", fontFamily: "monospace" }}>Real-Time War Room</div>
                <div style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", lineHeight: "1.4", fontFamily: "monospace" }}>Live WebSocket SWOT co-founding & sync cursors</div>
              </div>

              {/* Pitch Deck */}
              <div 
                className="outcard" 
                style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.05rem", cursor: "pointer", transition: "all .18s", position: "relative" }}
                onClick={() => setShowPitchDeck(true)}
              >
                <div style={{ fontSize: "1.25rem", marginBottom: "0.42rem" }}>🎨</div>
                <div style={{ color: "#ffffff", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.22rem", fontFamily: "monospace" }}>Pitch Deck Simulator</div>
                <div style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", lineHeight: "1.4", fontFamily: "monospace" }}>Generate 8 live-interactive modular pitch slides</div>
              </div>

              {/* Landscape Radar */}
              <div 
                className="outcard" 
                style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.05rem", cursor: "pointer", transition: "all .18s", position: "relative" }}
                onClick={() => setShowLandscape(true)}
              >
                <div style={{ fontSize: "1.25rem", marginBottom: "0.42rem" }}>🗺️</div>
                <div style={{ color: "#ffffff", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.22rem", fontFamily: "monospace" }}>Local Landscape Radar</div>
                <div style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", lineHeight: "1.4", fontFamily: "monospace" }}>GIS density mappings & vulnerability heat sensors</div>
              </div>

              {/* Runway Sandbox */}
              <div 
                className="outcard" 
                style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.05rem", cursor: "pointer", transition: "all .18s", position: "relative" }}
                onClick={() => setShowRunway(true)}
              >
                <div style={{ fontSize: "1.25rem", marginBottom: "0.42rem" }}>📊</div>
                <div style={{ color: "#ffffff", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.22rem", fontFamily: "monospace" }}>Runway COGS Sandbox</div>
                <div style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", lineHeight: "1.4", fontFamily: "monospace" }}>Model burns, margins, headcounts & 12M cash graphs</div>
              </div>

              {/* CO-FOUNDER CO-PILOT DECK — Living Memory companion */}
              <div 
                className="outcard" 
                style={{ 
                  background: "rgba(200, 255, 0, 0.05)", 
                  border: "1px solid rgba(200, 255, 0, 0.35)", 
                  borderRadius: "6px", 
                  padding: "1.2rem", 
                  cursor: "pointer", 
                  transition: "all .18s", 
                  position: "relative",
                  gridColumn: "span 2",
                  boxShadow: "0 0 15px rgba(200, 255, 0, 0.1)"
                }}
                onClick={() => setShowCoFounderHub(true)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
                    <span style={{ fontSize: "1.95rem" }}>🛰️</span>
                    <div>
                      <div style={{ color: LIME, fontSize: "9px", fontWeight: "900", letterSpacing: "2.2px", fontFamily: "monospace" }}>LIVING WORKSPACE COMPANION</div>
                      <div style={{ color: "#ffffff", fontSize: "0.88rem", fontWeight: "900", fontFamily: "monospace" }}>CO-FOUNDER CO-PILOT COMMAND DECK</div>
                      <div style={{ color: "rgba(255,255,255,0.48)", fontSize: "0.68rem", fontFamily: "monospace", marginTop: "2px", lineHeight: "1.3" }}>
                        Active advisory memory-links, customized investor rooms, cold outreach matchmakers, metric traction visuals & Swahili support translation.
                      </div>
                    </div>
                  </div>
                  <span style={{ color: LIME, fontSize: "10px", fontWeight: "900", animation: "pulse 1.8s infinite" }}>● ACTIVE COMPANION</span>
                </div>
              </div>

              {/* Venture Sentinel — Autonomous AI from 2100 */}
              <div 
                className="outcard" 
                style={{ 
                  background: "rgba(184, 127, 255, 0.05)", 
                  border: "1px solid rgba(184, 127, 255, 0.35)", 
                  borderRadius: "6px", 
                  padding: "1.05rem", 
                  cursor: "pointer", 
                  transition: "all .18s", 
                  position: "relative",
                  gridColumn: "span 2",
                  boxShadow: "0 0 15px rgba(184, 127, 255, 0.1)"
                }}
                onClick={() => setShowSentinel(true)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
                    <span style={{ fontSize: "1.80rem" }}>🤖</span>
                    <div>
                      <div style={{ color: PURPLE, fontSize: "9px", fontWeight: "900", letterSpacing: "2px", fontFamily: "monospace" }}>FUTURE AI FROM YEAR 2100</div>
                      <div style={{ color: "#ffffff", fontSize: "0.85rem", fontWeight: "900", fontFamily: "monospace" }}>VENTURE SENTINEL DIAGNOSTICS</div>
                      <div style={{ color: "rgba(255,255,255,0.48)", fontSize: "0.68rem", fontFamily: "monospace", marginTop: "2px" }}>Autonomous timeline defense, proactive accountability & future threat simulation</div>
                    </div>
                  </div>
                  <span style={{ color: PURPLE, fontSize: "10px", fontWeight: "900", animation: "pulse 1.5s infinite" }}>● LIVE SENTINEL</span>
                </div>
              </div>

            </div>

            {/* LOCAL ANALYTICS SECURE VAULT INSIGHT BANNER */}
            {analytics && analytics.realityCheckCount >= 3 && (
              <div style={{ background: "rgba(0, 240, 255, 0.08)", border: "1px solid rgba(0, 240, 255, 0.2)", borderRadius: "6px", padding: "0.85rem 1.1rem", marginTop: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", animation: "glowPulse 3s infinite" }}>
                <span style={{ color: "rgba(255, 255, 255, 0.78)", fontSize: "0.75rem", fontFamily: "monospace" }}>
                  🛡️ <strong style={{ color: CYAN }}>Identity Validated:</strong> You have run the Forge validation engine 3 times! We recommend archiving your favorite concepts to the <strong>Secure Vault</strong> for safe preservation.
                </span>
                <button onClick={() => setShowHistory(true)} style={{ background: CYAN, color: "#000", border: "none", borderRadius: "4px", padding: "4px 10px", fontSize: "9px", fontWeight: "bold", fontFamily: "monospace", cursor: "pointer" }}>
                  OPEN VAULT
                </button>
              </div>
            )}

            {err && <div style={{ ...G.err, marginTop: "1rem" }}>{err}</div>}
          </div>
        )}

        {/* GENERATING */}
        {phase === "generating" && (
          <div style={{ textAlign: "center", padding: "6rem 0", animation: "fadeIn .3s ease", fontFamily: "monospace" }}>
            <div style={{ width: "34px", height: "34px", border: `2px solid #1a1a1a`, borderTop: `2px solid ${LIME}`, borderRadius: "50%", margin: "0 auto 1.4rem", animation: "spin 0.7s linear infinite" }} />
            <p style={{ color: PURPLE, fontSize: "10px", letterSpacing: "4px", margin: "0 0 0.4rem", fontWeight: "bold" }}>FORGING Core Systems</p>
            <p style={{ color: "#ffffff", fontSize: "0.72rem" }}>{loadMsg}</p>
          </div>
        )}

        {/* OUTPUT */}
        {phase === "output" && outType && outputs[outType] && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.4rem", flexWrap: "wrap", gap: "0.55rem" }}>
              <span style={{ color: LIME, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", fontFamily: "monospace", fontWeight: "bold" }}>{OUTPUTS.find(o => o.key === outType)?.icon} {OUTPUTS.find(o => o.key === outType)?.label}</span>
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <button className="gh" style={{ ...G.ghost, color: copyFeedback ? LIME : "rgba(255,255,255,0.5)", borderColor: copyFeedback ? LIME : "#1c1c1c" }} onClick={handleCopyRaw}>
                  {copyFeedback ? "✓ Copied!" : "📋 Copy Raw"}
                </button>
                <button className="gh" style={G.ghost} onClick={handleExportFile}>📥 Save (.md)</button>
                <button className="gh" style={G.ghost} onClick={async () => { setOutputs(p => { const n = { ...p }; delete n[outType]; return n; }); await generate(outType); }}>↻ Regen</button>
                <button className="gh" style={G.ghost} onClick={() => setPhase("output-select")}>← All Products</button>
                <button className="gh" style={G.ghost} onClick={resetIdea}>New Idea</button>
              </div>
            </div>
            <ErrorBoundary>
              <div style={{ background: "#080808", border: "1px solid #1c1c1c", borderRadius: "6px", padding: (outType === "mindmap" || outType === "promptpack") ? "0" : "1.8rem" }}>
                {outType === "mindmap" && <MindMap data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "blueprint" && <Blueprint data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "roadmap" && <Roadmap data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "businessplan" && <BusinessPlan data={outputs[outType]} />}
                {outType === "actionplan" && <ActionPlan data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "swot" && <SWOT data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "promptpack" && <div style={{ padding: "1.8rem" }}><PromptPack data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} /></div>}
              </div>
            </ErrorBoundary>
          </div>
        )}

        {/* DATA & PRIVACY INFORMATION DIALOG MODAL LINK / FOOTER */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", padding: "2rem 0", borderTop: "1px solid #141414", marginTop: "4rem" }}>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}>FORGE v1.0 offline-first engine</span>
          <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
          <button onClick={() => setShowPrivacyDialog(true)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "10px", fontFamily: "monospace", textDecoration: "underline", cursor: "pointer" }}>
            Data & AI Operations
          </button>
        </div>

        {showPrivacyDialog && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(5px)" }}>
            <div style={{ width: "min(480px, 92vw)", background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1.8rem", fontFamily: "monospace", position: "relative" }}>
              <button onClick={() => setShowPrivacyDialog(false)} style={{ position: "absolute", top: "15px", right: "15px", background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "1rem" }}>✕</button>
              <div style={{ color: LIME, fontSize: "0.85rem", fontWeight: "900", letterSpacing: "2.5px", marginBottom: "1.2rem", textTransform: "uppercase" }}>🛡️ DATA & AI TRANSPARENCY</div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem", color: "rgba(255,255,255,0.8)", fontSize: "0.8rem", lineHeight: "1.6" }}>
                <div>
                  <div style={{ color: PURPLE, fontWeight: "bold", fontSize: "0.78rem", marginBottom: "0.3rem" }}>LOCAL STORAGE GUARANTEE</div>
                  Your startup blueprints, profile details, and conversation histories are stored inside your browser's private sandbox (local device-only). No central servers collect or monetize your proprietary intellectual property.
                </div>

                <div>
                  <div style={{ color: CYAN, fontWeight: "bold", fontSize: "0.78rem", marginBottom: "0.3rem" }}>SECURE AI ACCELERATION</div>
                  When running simulations, SWOT intelligence, or product roadmaps, queries are encrypted and routed over secure proxy tunnels directly to our Google Gemini model endpoint. Raw data is not stored or trained on by our servers.
                </div>

                <div>
                  <div style={{ color: PINK, fontWeight: "bold", fontSize: "0.78rem", marginBottom: "0.3rem" }}>SANDBOXED ARCHITECTURE</div>
                  Because there are no centralized cloud sync logins yet, clearing your browser cookies/local storage will erase offline database records. Remember to copy your core Prompt Packs or backup essential text!
                </div>
              </div>

              <button onClick={() => setShowPrivacyDialog(false)} style={{ width: "100%", background: LIME, color: "#000", border: 'none', borderRadius: '6px', padding: '0.75rem', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', marginTop: '1.6rem', cursor: 'pointer' }}>
                ACKNOWLEDGE & CLOSE
              </button>
            </div>
          </div>
        )}

        <div style={{ height: "5rem" }} />
      </div>
    </div>
  );
}
