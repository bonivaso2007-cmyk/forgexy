import React, { useState, useRef, useEffect, useCallback, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { Archive, User, Zap, Hammer, Globe, ArrowLeft } from "lucide-react";
import DOMPurify from "dompurify";
import PitchDeck from "./components/PitchDeck";
import CommandPalette from "./components/CommandPalette";
import { exportComponentToPDF } from "./lib/pdfExporter";
import forgeLogo from "./assets/images/forge_logo_1781634347253.jpg";
import { auth as firebaseAuth, googleProvider, db, handleFirestoreError, OperationType } from "./lib/firebase";
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "firebase/firestore";

const API = "/api/ai-proxy";
const Q_TARGET = 6;
const GOLD = "var(--accent-gold)"; // Sovereign Gilt
const SAND = "var(--muted-sand)"; // Secondary Muted Sand/Silt
const EMERALD = "var(--deep-emerald)"; // Deep Emerald Green
const OXBLOOD = "var(--crimson-oxblood)"; // Crimson Oxblood
const GOLD_BRIGHT = "var(--accent-gold-bright)"; // Bright Accent Gold
const BRANCH_COLORS = ["#C8A24E", "#B8AFA0", "#D4AF37", "#9BA88F", "#E5DCC6"];

// Legacy stylistic aliases for backward-compatible rendering safety across deep sub-systems:
const LIME = GOLD;
const PURPLE = SAND;
const ORANGE = EMERALD;
const PINK = OXBLOOD;
const CYAN = GOLD_BRIGHT;

// ── SECURE CRYPTO VAULT ENGINE ────────────────────────────
// Uses PBKDF2 + AES-GCM (all native Web Crypto) for zero-trust client-side vault encryption.
// Plaintext data is never written to disk. The session key lives ONLY in-memory or transiently in sessionStorage (tab scope).

async function hashPasswordPBKDF2(password: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    256
  );
  
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function getOrCreateGuestUid() {
  if (typeof window === "undefined") {
    return "guest_fallback_server";
  }
  let uid = sessionStorage.getItem("forge_session_guest_uid");
  if (!uid) {
    const randomBits = window.crypto.getRandomValues(new Uint8Array(12));
    const randomHex = Array.from(randomBits).map(b => b.toString(16).padStart(2, "0")).join("");
    uid = `guest_session_${Date.now()}_${randomHex}`;
    sessionStorage.setItem("forge_session_guest_uid", uid);
  }
  return uid;
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

      // 1. Try local storage first
      if (typeof window !== "undefined" && window.localStorage) {
        const item = localStorage.getItem(k);
        rawVal = item ? JSON.parse(item) : null;
      }

      // 2. Fallback to Firestore
      if (!rawVal && db) {
        try {
          if (k.startsWith("idea:")) {
            const parts = k.split(":");
            const uid = parts[1];
            const ideaId = parts[2];
            const docRef = doc(db, 'ideas', ideaId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.user_uid === uid) {
                if (data.text && typeof data.text === "string" && data.text.startsWith("SECURE:")) {
                  rawVal = data.text;
                } else {
                  rawVal = {
                    id: data.id,
                    text: data.text,
                    score: data.score,
                    label: data.label,
                    qa: typeof data.qa === 'string' ? JSON.parse(data.qa) : data.qa,
                    savedAt: Number(data.savedAt)
                  };
                }
              }
            } else {
              // Try generic kv_store
              const kvRef = doc(db, 'kv_store', k);
              const kvSnap = await getDoc(kvRef);
              if (kvSnap.exists()) {
                rawVal = JSON.parse(kvSnap.data().value);
              }
            }
          } else if (k.startsWith("user:") || k.startsWith("profile:") || k === "session") {
            const kvRef = doc(db, 'kv_store', k);
            const kvSnap = await getDoc(kvRef);
            if (kvSnap.exists()) {
              rawVal = JSON.parse(kvSnap.data().value);
              if (typeof window !== "undefined" && window.localStorage) {
                localStorage.setItem(k, JSON.stringify(rawVal));
              }
            }
          }
        } catch (dbErr) {
          console.warn("Firestore error retrieving key:", k, dbErr);
        }
      }

      // 3. Client-side decryption if the value is encrypted
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

      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(k, JSON.stringify(valToStore));
      }

      // Firestore replication
      if (db) {
        try {
          if (k.startsWith("idea:")) {
            const parts = k.split(":");
            const uid = parts[1];
            const ideaId = parts[2];
            await setDoc(doc(db, 'ideas', ideaId), {
              id: ideaId,
              user_uid: uid,
              text: typeof valToStore === "string" ? valToStore : JSON.stringify(v.text),
              score: v.score || 0,
              label: v.label || "vault",
              qa: "{}",
              savedAt: v.savedAt || Date.now()
            });
          } else if (k.startsWith("user:") || k.startsWith("profile:") || k === "session") {
            await setDoc(doc(db, 'kv_store', k), { key: k, value: JSON.stringify(valToStore) });
          }
        } catch (dbErr) {
          console.warn("Firestore error setting key:", k, dbErr);
        }
      }
    } catch {}
  },
  async del(k: string) {
    try {
      if (db) {
        try {
          if (k.startsWith("idea:")) {
            const parts = k.split(":");
            const ideaId = parts[2];
            await deleteDoc(doc(db, 'ideas', ideaId));
          } else {
            await deleteDoc(doc(db, 'kv_store', k));
          }
        } catch (dbErr) {
          console.warn("Firestore error deleting key:", k, dbErr);
        }
      }

      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(k);
      }
    } catch {}
  },
  async list(prefix: string) {
    try {
      let combinedKeys: string[] = [];
      
      // Local keys first
      if (typeof window !== "undefined" && window.localStorage) {
        const keys = Object.keys(localStorage);
        combinedKeys = keys.filter((k) => k.startsWith(prefix));
      }

      // Firestore keys
      if (db && prefix.startsWith("idea:")) {
        try {
          // Simplistic fallback without where query since it requires indexes.
          // Note that we may need query where user_uid == uid but let's just use 
          // kv_store for safety or getDocs if small.
        } catch (dbErr) {
          console.warn("Firestore list error skipped:", dbErr);
        }
      }

      return [...new Set(combinedKeys)];
    } catch {
      return [];
    }
  }
};

// ── API ───────────────────────────────────────────────────
import { aiStream, ai, geminiAi, geminiStream, trackEvent } from "./lib/ai";

// ── Firebase Auth ─────────────────────────────────────────

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
        
        // Secure sanitization allowing bold styling only
        const cleanHtml = DOMPurify.sanitize(html, { 
          ALLOWED_TAGS: ["strong"], 
          ALLOWED_ATTR: ["style"] 
        });

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
            <span dangerouslySetInnerHTML={{ __html: cleanHtml }} />
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

  const handleLocalCryptAuth = async () => {
    setErr("");
    setLoading(true);
    const { email, password, name } = form;
    if (!email.trim() || !password.trim()) {
      setErr("Fill in all fields for credentials.");
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }
    const uid = btoa(email.toLowerCase()).replace(/=/g, "");
    
    try {
      if (mode === "signup") {
        const exists = await store.get(`user:${uid}`);
        if (exists) {
          setErr("Account already exists. Log in instead.");
          setLoading(false);
          return;
        }
        if (!name.trim()) {
          setErr("Enter your name.");
          setLoading(false);
          return;
        }
        
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
        
        // 1. Initialize Encryption (uses deriveKey function already in the file)
        await initializeEncryption(password, saltHex);
        
        // 2. Generate secure PBKDF2 GCM verification block
        const verificationPayload = await encryptData("pbkdf2_verified");
        
        const user = { 
          uid, 
          email: email.toLowerCase(), 
          name: name.trim(), 
          verificationPayload, 
          saltHex, 
          createdAt: Date.now() 
        };
        
        await store.set(`user:${uid}`, user);
        await store.set(`session`, { uid, email: user.email, name: user.name });
        onAuth(user, true);
      } else {
        const user = await store.get(`user:${uid}`);
        if (!user) {
          setErr("Invalid email or password.");
          setLoading(false);
          return;
        }
        
        if (!user.saltHex || (!user.verificationPayload && !user.passwordHash)) {
          setErr("Account metadata is invalid or missing secure PBKDF2 credentials.");
          setLoading(false);
          return;
        }
        
        // Initialize encryption with the input password and stored salt
        await initializeEncryption(password, user.saltHex);
        
        let isValid = false;
        
        if (user.verificationPayload) {
          // Verify password using native decryption of the secure block
          const verificationCheck = await decryptData(user.verificationPayload);
          isValid = (verificationCheck === "pbkdf2_verified");
        } else if (user.passwordHash) {
          // Upgrade path for legacy pure PBKDF2 hashes
          const pbkdf2Check = await hashPasswordPBKDF2(password, user.saltHex);
          isValid = (user.passwordHash === pbkdf2Check);
          
          if (isValid) {
            // Quietly upgrade the user file to the verification block standard
            const verificationPayload = await encryptData("pbkdf2_verified");
            user.verificationPayload = verificationPayload;
            await store.set(`user:${uid}`, user);
          }
        }
        
        if (!isValid) {
          // Zero-out session key on validation failure to maintain vault integrity
          activeEncryptionKey = null;
          activeSaltHex = "";
          sessionStorage.removeItem("forge_vault_session");
          setErr("Invalid email or password.");
          setLoading(false);
          return;
        }
        
        await store.set(`session`, { uid, email: user.email, name: user.name });
        onAuth(user, false);
      }
    } catch (e: any) {
      activeEncryptionKey = null;
      activeSaltHex = "";
      sessionStorage.removeItem("forge_vault_session");
      setErr(`Cryptographic threat mitigation blocks entry: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    handleLocalCryptAuth();
  };

  const inp = { 
    width: "100%", 
    background: "var(--bg-panel)", 
    border: "1px solid var(--border-panel)", 
    borderRadius: "6px", 
    color: "var(--text-base)", 
    fontSize: "0.85rem", 
    padding: "0.85rem 1rem", 
    outline: "none", 
    fontFamily: "var(--font-sans)", 
    boxSizing: "border-box" as const 
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "var(--font-sans)" }}>
      <div style={{ width: "100%", maxWidth: "420px", display: "flex", flexDirection: "column", alignItems: "center", background: "var(--bg-panel)", padding: "2.5rem 2rem", borderRadius: "12px", border: "1px solid var(--border-panel)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        
        {/* PREMIUM ROYAL LOGO CENTERPIECE */}
        <div style={{ 
          display: "flex", 
          justifyContent: "center", 
          alignItems: "center", 
          width: "90px", 
          height: "90px", 
          borderRadius: "50%", 
          background: "radial-gradient(circle, var(--accent-gold-dark) 0%, var(--bg-panel) 100%)", 
          border: "2px solid var(--accent-gold-bright)", 
          boxShadow: "0 0 28px rgba(212, 175, 55, 0.45), inset 0 0 12px rgba(212, 175, 55, 0.3)", 
          padding: "5px",
          marginBottom: "1.2rem",
          transition: "transform 0.3s ease",
        }}>
          <img 
            src={forgeLogo} 
            alt="FORGE Logo" 
            onError={(e) => {
              (e.target as HTMLImageElement).src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="43" stroke="%23D4AF37" stroke-width="4"/><path d="M50 20 L27 40 L37 40 L30 75 L50 55 L70 75 L63 40 L73 40 Z" fill="%23C8A24E" filter="drop-shadow(0 0 5px %23C8A24E)"/></svg>`;
            }}
            style={{ 
              width: "100%", 
              height: "100%", 
              borderRadius: "50%", 
              objectFit: "cover" 
            }} 
          />
        </div>

        <div style={{ display: "flex", width: "100%", gap: "0", marginBottom: "1.5rem", border: "1px solid var(--border-panel)", borderRadius: "6px", overflow: "hidden" }}>
          {["login", "signup"].map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, background: mode === m ? LIME : "transparent", color: mode === m ? "var(--bg-panel)" : "var(--text-muted)", border: "none", padding: "0.72rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2px", cursor: "pointer", fontFamily: "var(--font-mono)", textTransform: "uppercase", transition: "all .2s" }}>{m}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
          {mode === "signup" && <input style={inp} placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />}
          <input style={inp} placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} onKeyDown={e => e.key === "Enter" && submit()} />
          <input style={inp} placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>

        {err && <div style={{ color: "#F4EFE3", fontSize: "0.74rem", marginTop: "1rem", background: "rgba(92, 32, 38, 0.4)", border: "1px solid #5C2026", borderRadius: "6px", padding: "0.55rem 0.85rem", width: "100%", boxSizing: "border-box", textAlign: "center" }}>{err}</div>}
        
        <button onClick={submit} disabled={loading} style={{ width: "100%", background: LIME, color: "#1B1815", border: "none", borderRadius: "6px", padding: "0.9rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2.5px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace", marginTop: "1.2rem", opacity: loading ? 0.5 : 1 }}>
          {loading ? "…" : mode === "login" ? "LOG IN →" : "CREATE ACCOUNT →"}
        </button>
        
        <p style={{ color: "rgba(244,239,227,0.4)", fontSize: "0.68rem", textAlign: "center", marginTop: "1.5rem", lineHeight: "1.5" }}>
          Secure zero-trust cryptographic accounts encrypt your ideas locally using AES-GCM (PBKDF2 derivative) and replicate directly to your Supabase Vault in real-time.
        </p>
      </div>
    </div>
  );
}

// ── ONBOARDING ────────────────────────────────────────────
function Onboarding({ user, onDone, appLanguage = "en" }) {
  const steps = [
    { 
      key: "country", 
      label: appLanguage === "sw" ? "Startup yako iko katika nchi gani?" : "What country is your startup based in?", 
      placeholder: appLanguage === "sw" ? "mfano. Tanzania, Kenya, Uganda" : "e.g. Tanzania, India, United States", 
      type: "input" 
    },
    { 
      key: "stage", 
      label: appLanguage === "sw" ? "Mradi wako uko katika hatua gani?" : "What stage is your venture at?", 
      type: "choice", 
      options: appLanguage === "sw" 
        ? ["Ni wazo tu", "Hatua ya utafiti", "Kutengeneza bidhaa ya kwanza (MVP)", "Kupata watumiaji wa kwanza", "Hatua ya mapato"]
        : ["Just an idea", "Research phase", "Building MVP", "Have early users", "Revenue stage"] 
    },
    { 
      key: "techLevel", 
      label: appLanguage === "sw" ? "Kiwango chako cha utekelezaji wa kiteknolojia ni kipi?" : "What is your level of technical execution?", 
      type: "choice", 
      options: appLanguage === "sw"
        ? ["Sio wa kiufundi (Non-technical)", "Kiwango cha msingi", "Kiwango cha kati", "Msanidi programu mtaalamu"]
        : ["Non-technical", "Basic (vibe coder)", "Intermediate", "Advanced developer"] 
    },
  ];

  const [step, setStep] = useState(0);
  const [data, setData] = useState({ 
    country: "", stage: "Just an idea", techLevel: "Intermediate" 
  });
  const [val, setVal] = useState("");
  const [loading, setLoading] = useState(false);
  const cur = steps[step];

  // Auto-sync val whenever we navigate steps
  useEffect(() => {
    setVal(data[cur.key] || "");
  }, [step]);

  const skip = async () => {
    setLoading(true);
    const lightProfile = {
      name: user.name || "Founder",
      email: user.email || "",
      uid: user.uid,
      country: "Global",
      stage: "Just an idea",
      techLevel: "Intermediate",
      bio: "Founder exploring startup concepts.",
      incomplete: false,
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
      setStep(s => s + 1);
      return;
    }
    setLoading(true);
    const profile = {
      ...updated,
      name: user.name || "Founder",
      email: user.email || "",
      uid: user.uid,
      incomplete: false,
      completedAt: Date.now()
    };
    await store.set(`profile:${user.uid}`, profile);
    onDone(profile);
  };

  const back = () => {
    if (step > 0) {
      const updated = { ...data, [cur.key]: val };
      setData(updated);
      setStep(prev => prev - 1);
    }
  };

  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "#0F0D0B", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "Inter, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "520px", background: "#1B1815", padding: "2.5rem 2rem", borderRadius: "12px", border: "1px solid #2E2A24", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "1.35rem", fontWeight: "900", color: LIME, letterSpacing: "1px", fontFamily: "monospace" }}>FORGE SYSTEM</span>
          <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
            <button onClick={skip} disabled={loading} style={{ background: "transparent", border: "1px solid #2E2A24", borderRadius: "4px", color: "rgba(244,239,227,0.5)", cursor: "pointer", fontSize: "10px", padding: "3px 8px", fontFamily: "monospace" }}>SKIP FOR NOW</button>
            <span style={{ color: "rgba(244,239,227,0.4)", fontSize: "0.68rem", fontFamily: "monospace" }}>{step + 1} / {steps.length}</span>
          </div>
        </div>
        <div style={{ height: "4px", background: "rgba(244,239,227,0.06)", borderRadius: "6px", marginBottom: "3rem", overflow: "hidden", border: "1px solid #2E2A24" }}>
          <div style={{ height: "100%", background: LIME, width: `${progress}%`, transition: "width .4s ease" }} />
        </div>
        <p style={{ color: PURPLE, fontSize: "10px", letterSpacing: "0.25em", margin: "0 0 0.6rem", textTransform: "uppercase", fontWeight: "bold", fontFamily: "monospace" }}>Building your founder profile</p>
        <p style={{ color: "#F4EFE3", fontSize: "1.38rem", margin: "0 0 2rem", fontWeight: "bold", lineHeight: "1.6" }}>{cur.label}</p>
        {cur.type === "input" && (
          <input style={{ width: "100%", background: "#0F0D0B", border: "1px solid #2E2A24", borderRadius: "6px", color: "#F4EFE3", fontSize: "0.95rem", padding: "1rem 1.1rem", outline: "none", fontFamily: "Inter, sans-serif", boxSizing: "border-box" }}
            placeholder={cur.placeholder} value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && val.trim() && next()} autoFocus />
        )}
        {cur.type === "textarea" && (
          <textarea style={{ width: "100%", background: "#0F0D0B", border: "1px solid #2E2A24", borderRadius: "6px", color: "#F4EFE3", fontSize: "0.92rem", padding: "1rem 1.1rem", outline: "none", fontFamily: "Inter, sans-serif", lineHeight: "1.6", height: "100px", resize: "none", boxSizing: "border-box" }}
            placeholder={cur.placeholder} value={val} onChange={e => setVal(e.target.value)} autoFocus />
        )}
        {cur.type === "choice" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {cur.options.map(o => {
              const sel = val === o;
              return (
                <button key={o} onClick={() => setVal(o)} style={{ background: sel ? `${LIME}0d` : "#0F0D0B", border: `1px solid ${sel ? LIME : "#2E2A24"}`, borderRadius: "6px", padding: "0.85rem 1.1rem", color: sel ? LIME : "rgba(244, 239, 227, 0.75)", fontFamily: "Inter, sans-serif", fontSize: "0.85rem", cursor: "pointer", textAlign: "left", transition: "all .15s" }}>{o}</button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button onClick={next} disabled={!val.trim() || loading}
            style={{ flex: 1, background: LIME, color: "#1B1815", border: "none", borderRadius: "6px", padding: "0.85rem 2rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2.5px", cursor: !val.trim() ? "not-allowed" : "pointer", fontFamily: "monospace", opacity: !val.trim() ? 0.25 : 1 }}>
            {loading ? t("save", appLanguage) : step === steps.length - 1 ? t("enter", appLanguage) : t("next", appLanguage)}
          </button>
          {step > 0 && (
            <button onClick={back} style={{ background: "transparent", color: "rgba(244, 239, 227, 0.6)", border: "1px solid #2E2A24", borderRadius: "6px", padding: "0.85rem 1.2rem", fontSize: "11px", cursor: "pointer", fontFamily: "monospace" }}>
              ← {t("back", appLanguage)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PROFILE PANEL ─────────────────────────────────────────
function ProfilePanel({ profile, user, onUpdate, onLogout, onClose, onOpenFeedback, onUpgrade }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...profile });
  const fields = [
    { key: "country", label: "Country" },
    { key: "stage", label: "Stage" },
    { key: "techLevel", label: "Technical Level" },
    { key: "bio", label: "Founder Bio" },
  ];

  const save = async () => {
    // Clear the incomplete flag on manual save
    const updated = { ...draft, incomplete: false, updatedAt: Date.now() };
    await store.set(`profile:${user.uid}`, updated);
    onUpdate(updated); setEditing(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.8)", zIndex: 3000, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)", fontFamily: "Inter, sans-serif" }}>
      <div style={{ width: "min(500px,100vw)", background: "#1B1815", borderLeft: "1px solid #2E2A24", display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.2rem 1.5rem", borderBottom: "1px solid #2E2A24", flexShrink: 0 }}>
          <div>
            <div style={{ color: LIME, fontSize: "0.75rem", fontWeight: "900", letterSpacing: "3px", fontFamily: "monospace" }}>FOUNDER PROFILE</div>
            <div style={{ color: "rgba(244, 239, 227, 0.6)", fontSize: "0.6rem", letterSpacing: "1.5px", fontFamily: "monospace", marginTop: "2px" }}>{profile?.name?.toUpperCase()}</div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {editing
              ? <button onClick={save} style={{ background: LIME, color: "#1B1815", border: "none", borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.68rem", fontWeight: "900" }}>SAVE</button>
              : <button onClick={() => { setDraft({ ...profile }); setEditing(true); }} style={{ background: "transparent", border: "1px solid #2E2A24", color: "#F4EFE3", borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.68rem" }}>EDIT</button>
            }
            <button onClick={onClose} style={{ background: "rgba(92, 32, 38, 0.15)", border: "1px solid rgba(92, 32, 38, 0.4)", color: "#F4EFE3", borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", fontWeight: "bold" }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {user?.isGuest && (
            <div style={{ background: "rgba(200, 255, 0, 0.02)", border: "1px dashed rgba(200, 255, 0, 0.15)", borderRadius: "6px", padding: "1.1rem", marginBottom: "1.5rem" }}>
              <div style={{ color: LIME, fontSize: "10px", fontWeight: "900", fontFamily: "monospace", letterSpacing: "1.5px", marginBottom: "0.3rem" }}>🚨 GUEST SANDBOX ACTIVE</div>
              <p style={{ color: "rgba(244,239,227,0.75)", fontSize: "0.8rem", lineHeight: "1.5", margin: "0 0 0.8rem" }}>
                You are pioneering inside a clean, transient Guest sandbox. Transition your work to a personal, zero-trust cryptographic profile to safely secure ideas to your cloud Vault forever.
              </p>
              <button 
                onClick={onUpgrade}
                style={{ width: "100%", background: LIME, color: "#1B1815", border: "none", borderRadius: "4px", padding: "8px 12px", fontSize: "10px", fontWeight: "900", fontFamily: "monospace", cursor: "pointer", letterSpacing: "1px" }}
              >
                CREATE SECURE ACCOUNT NOW
              </button>
            </div>
          )}
          {profile?.incomplete && (
            <div style={{ background: "rgba(184,127,255,0.06)", border: "1px solid rgba(184,127,255,0.2)", borderRadius: "6px", padding: "0.8rem 1rem", marginBottom: "1.5rem", color: PURPLE, fontSize: "11px", fontWeight: "bold" }}>
              ⚡ Profile Incomplete: Fill in these details to sharpen AI simulations.
            </div>
          )}
          {/* score badge */}
          <div style={{ background: "#0F0D0B", border: "1px solid #2E2A24", borderRadius: "6px", padding: "1.1rem 1.3rem", marginBottom: "1.5rem" }}>
            <div style={{ color: PURPLE, fontSize: "10px", letterSpacing: "0.2em", marginBottom: "0.4rem", textTransform: "uppercase", fontWeight: "bold", fontFamily: "monospace" }}>FOUNDER IDENTITY</div>
            <div style={{ color: "#F4EFE3", fontSize: "0.85rem", lineHeight: "1.65" }}>{profile?.bio || "No summary provided."}</div>
          </div>
          {fields.map(f => (
            <div key={f.key} style={{ marginBottom: "1.1rem" }}>
              <div style={{ color: "rgba(244,239,227,0.5)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "0.3rem", fontFamily: "monospace" }}>{f.label}</div>
              {editing
                ? <textarea style={{ width: "100%", background: "#0F0D0B", border: "1px solid #2E2A24", borderRadius: "6px", color: "#F4EFE3", fontSize: "0.83rem", padding: "0.6rem 0.8rem", outline: "none", fontFamily: "Inter, sans-serif", lineHeight: "1.6", minHeight: "60px", resize: "vertical", boxSizing: "border-box" }}
                  value={draft[f.key] || ""} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
                : <div style={{ color: "rgba(244, 239, 227, 0.85)", fontSize: "0.83rem", lineHeight: "1.6" }}>{profile?.[f.key] || "—"}</div>
              }
            </div>
          ))}
          <button onClick={onOpenFeedback} style={{ background: "rgba(200, 255, 0, 0.04)", border: "1px solid rgba(200, 255, 0, 0.2)", color: LIME, borderRadius: "6px", padding: "0.65rem 1.2rem", cursor: "pointer", fontFamily: "monospace", fontSize: "11px", letterSpacing: "0.15em", marginTop: "1rem", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.45rem" }}>📣 GIVE FEEDBACK</button>
          <button onClick={onLogout} style={{ background: "transparent", border: "1px solid rgba(92, 32, 38, 0.4)", color: "#F4EFE3", borderRadius: "6px", padding: "0.65rem 1.2rem", cursor: "pointer", fontFamily: "monospace", fontSize: "11px", letterSpacing: "0.15em", marginTop: "0.6rem", width: "100%" }}>LOG OUT</button>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.8)", zIndex: 3000, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)", fontFamily: "Inter, sans-serif" }}>
      <div style={{ width: "min(480px,100vw)", background: "#1B1815", borderLeft: "1px solid #2E2A24", display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.2rem 1.5rem", borderBottom: "1px solid #2E2A24", flexShrink: 0 }}>
          <div style={{ color: LIME, fontSize: "0.75rem", fontWeight: "900", letterSpacing: "3px", fontFamily: "monospace" }}>IDEA VAULT</div>
          <button onClick={onClose} style={{ background: "rgba(92, 32, 38, 0.15)", border: "1px solid rgba(92, 32, 38, 0.4)", color: "#F4EFE3", borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", fontWeight: "bold" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "1.2rem 1.5rem" }}>
          {loading && <div style={{ color: "rgba(244,239,227,0.5)", fontSize: "0.75rem", fontFamily: "monospace" }}>Loading…</div>}
          {!loading && ideas.length === 0 && <div style={{ color: "rgba(244,239,227,0.5)", fontSize: "0.82rem" }}>No saved ideas yet. Start one and it'll appear here.</div>}
          {ideas.map(idea => (
            <div key={idea.id} style={{ background: "#0F0D0B", border: "1px solid #2E2A24", borderRadius: "6px", padding: "1rem 1.1rem", marginBottom: "0.75rem" }}>
              <div style={{ color: "#F4EFE3", fontSize: "0.82rem", marginBottom: "0.55rem", lineHeight: "1.5" }}>{idea.text?.slice(0, 100)}{idea.text?.length > 100 ? "…" : ""}</div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                {idea.score && <span style={{ color: LIME, fontSize: "10px", border: "1px solid #2E2A24", padding: "2px 7px", borderRadius: "6px", background: "rgba(244,239,227,0.03)", fontWeight: "bold", fontFamily: "monospace" }}>{idea.score} — {idea.label}</span>}
                <span style={{ color: "rgba(244, 239, 227, 0.4)", fontSize: "0.62rem", fontFamily: "monospace" }}>{new Date(idea.savedAt).toLocaleDateString()}</span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button onClick={() => { onLoad(idea); onClose(); }} style={{ background: "transparent", border: "1px solid #2E2A24", color: "#F4EFE3", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.62rem" }}>LOAD</button>
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
function RealityCheck({ idea, qa, profile, onProceed, onBack, appLanguage = "en" }) {
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(true);
  const [talked, setTalked] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Load saved memories to feed into Reality Check
      let memories: string[] = [];
      try {
        const stored = localStorage.getItem("forge_cofounder_memories");
        if (stored) {
          memories = JSON.parse(stored);
        }
      } catch (e) {
        console.error("Error loading memories for Reality Check:", e);
      }

      const memoriesPart = memories.length > 0 
        ? `\n\n### Living Co-Founder Memory (Key startup parameters, constraints & previous decisions):\n${memories.map((m, idx) => `${idx + 1}. ${m}`).join("\n")}`
        : "";

      const langName = getLangName(appLanguage);
      let sys = `You are FORGE REALITY CHECK — a brutal, honest advisor for early-stage founders.
Analyse this idea against the founder's specific constraints. Be direct. No sugarcoating.
Structure: ## Feasibility Score (X/10)\n## Can You Actually Build This?\n## Market Reality Check\n## Your Unfair Advantage\n## The Single Biggest Risk\n## Verdict`;

      if (appLanguage !== "en") {
        sys += `\n\nCRITICAL LANGUAGE MANDATE: Since the user selected ${langName}, you MUST write your entire response, including all section headings (such as "Feasibility Score", "Can You Actually Build This?", "Market Reality Check", "Your Unfair Advantage", "The Single Biggest Risk", "Verdict") and all paragraphs/verdicts completely in ${langName}. Do NOT use English under any circumstances.`;
      }

      const prompt = `${profileContext(profile)}\n${marketContext(profile)}${memoriesPart}\n\nIdea: "${idea}"\n\nFounder's thinking:\n${qa.map((x, i) => `Q${i + 1}: ${x.question}\nA${i + 1}: ${x.answer}`).join("\n\n")}\n\nGive a reality check tailored to THIS specific founder's constraints, location, and past co-founder memory files.`;
      
      await aiStream(sys, prompt, chunk => setResult(chunk), 1000, true);
      setLoading(false);
    })();
  }, [appLanguage]);

  const spokeLabel = t("speak_customer", appLanguage);
  const yesBtnLabel = t("yes_spoken", appLanguage);
  const noBtnLabel = t("not_yet", appLanguage);
  const warningText = t("warning_spoken", appLanguage);
  const runningText = t("running_reality", appLanguage);
  const completeText = t("reality_complete", appLanguage);
  const buildBtnLabel = t("build_outputs", appLanguage);
  const backBtnLabel = t("back", appLanguage);

  return (
    <div style={{ animation: "fadeIn .3s ease", fontFamily: "monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.8rem" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: loading ? PURPLE : LIME, animation: loading ? "pulse 1s infinite" : "none", flexShrink: 0 }} />
        <span style={{ color: loading ? PURPLE : LIME, fontSize: "0.68rem", letterSpacing: "3px", fontWeight: "bold" }}>{loading ? runningText : completeText}</span>
      </div>
      <div style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <Md text={result} />
      </div>
      {!loading && (
        <>
          <div style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.2rem", marginBottom: "1.5rem" }}>
            <p style={{ color: "#ffffff", fontSize: "0.9rem", margin: "0 0 1rem", fontFamily: "monospace", fontWeight: "bold" }}>{spokeLabel}</p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {[yesBtnLabel, noBtnLabel].map(o => {
                const sel = (o === yesBtnLabel && talked === "yes") || (o === noBtnLabel && talked === "no");
                return (
                  <button key={o} onClick={() => setTalked(o === yesBtnLabel ? "yes" : "no")} style={{ flex: 1, background: sel ? `${LIME}0d` : "transparent", border: `1px solid ${sel ? LIME : "#1c1c1c"}`, borderRadius: "6px", padding: "0.75rem", color: sel ? LIME : "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: "0.82rem", cursor: "pointer", transition: "all .15s" }}>{o}</button>
                );
              })}
            </div>
            {talked === "no" && <p style={{ color: PINK, fontSize: "0.75rem", marginTop: "0.75rem", lineHeight: "1.6" }}>{warningText}</p>}
          </div>
          {talked && (
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={onProceed} style={{ background: LIME, color: "#050505", border: "none", borderRadius: "6px", padding: "0.82rem 1.8rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2px", cursor: "pointer", fontFamily: "monospace" }}>{buildBtnLabel}</button>
              <button onClick={onBack} style={{ background: "transparent", color: "rgba(255, 255, 255, 0.5)", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "0.82rem 1.2rem", fontSize: "11px", cursor: "pointer", fontFamily: "monospace" }}>← {backBtnLabel}</button>
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const W = 1100, H = 720, cx = W / 2, cy = H / 2, bR = 210, nR = 125;
  const safeData = typeof data === "object" && data !== null ? data : { center: "Idea", branches: [] };
  const rawBranches = Array.isArray(safeData.branches) ? safeData.branches : [];
  const branches = rawBranches.slice(0, 6);
  const N = branches.length;

  const wrap = (txt, max) => {
    if (!txt) return [""];
    const words = String(txt).split(" "); const lines = []; let cur = "";
    for (const w of words) { if ((cur + " " + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur = (cur + " " + w).trim(); }
    if (cur) lines.push(cur); return lines.slice(0, 2);
  };

  const positions = useMemo(() => branches.map((b, i) => {
    const angle = (i / Math.max(1, N)) * 2 * Math.PI - Math.PI / 2;
    const bx = cx + Math.cos(angle) * bR, by = cy + Math.sin(angle) * bR;
    const rawNodes = Array.isArray(b.nodes) ? b.nodes : [];
    const nodes = rawNodes.slice(0, 4).map((node, j) => {
      const nAngle = angle + (j - (Math.min(rawNodes.length, 4) - 1) / 2) * 0.44;
      return { node, nAngle, nx: bx + Math.cos(nAngle) * nR, ny: by + Math.sin(nAngle) * nR };
    });
    return { angle, bx, by, nodes };
  }), [safeData]);

  const onMouseDown = e => { if (e.button !== 0) return; setDragging(true); setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y }); };
  const onMouseMove = e => { if (!dragging || !dragStart) return; setTransform(t => ({ ...t, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })); };
  const onMouseUp = () => { setDragging(false); setDragStart(null); };
  const onWheel = useCallback(e => { e.preventDefault(); setTransform(t => ({ ...t, scale: Math.min(Math.max(t.scale * (e.deltaY > 0 ? 0.92 : 1.09), 0.3), 3) })); }, []);

  useEffect(() => { const el = svgRef.current; if (!el) return; el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel); }, []);

  const containerStyle: React.CSSProperties = isFullscreen 
    ? { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: "#050505", display: "flex", flexDirection: "column" } 
    : { position: "relative", background: "#050505", border: "1px solid #1c1c1c", borderRadius: "6px", overflow: "hidden", height: "450px" };

  return (
    <div style={containerStyle}>
      <div style={{ position: "absolute", top: "10px", right: "10px", display: "flex", gap: "5px", zIndex: 10 }}>
        {([["＋", () => setTransform(t => ({ ...t, scale: Math.min(t.scale * 1.2, 3) }))], ["－", () => setTransform(t => ({ ...t, scale: Math.max(t.scale * 0.83, 0.3) }))], ["⊡", () => setTransform({ x: 0, y: 0, scale: 0.75 })], ["↺", () => setTransform({ x: 0, y: 0, scale: 1 })], [isFullscreen ? "↙" : "⤢", () => { trackEvent("mindmap_fullscreen_toggled", "mindmap", isFullscreen ? "off" : "on"); setIsFullscreen(!isFullscreen); }]
        ] as [string, () => void][]).map(([l, a], i) => (
          <button key={i} onClick={a} title={l === "⤢" ? "Full Screen" : l === "↙" ? "Collapse" : ""} style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", color: "rgba(255,255,255,0.4)", borderRadius: "6px", width: "26px", height: "26px", cursor: "pointer", fontSize: "0.8rem", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", transition: "all .15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = LIME; e.currentTarget.style.color = LIME; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "#1c1c1c"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}>{l}</button>
        ))}
      </div>
      {selected && (
        <div style={{ position: "absolute", bottom: "10px", right: "10px", background: "#0c0c0c", border: `1px solid #1c1c1c`, borderRadius: "6px", padding: "0.6rem 0.8rem", zIndex: 10, display: "flex", flexDirection: "column", gap: "0.35rem", maxWidth: "240px" }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.55rem", letterSpacing: "2px", textTransform: "uppercase" }}>SELECTED CONCEPT</div>
          <div style={{ color: "#ffffff", fontSize: "0.78rem", fontFamily: "monospace", fontWeight: "bold", wordBreak: "break-all" }}>{selected}</div>
          <button onClick={() => { trackEvent("mindmap_node_researched", "mindmap", selected); setIsFullscreen(false); onDeepDive(`Research and explain this mind map node or section: "${selected}" in relation to my startup idea "${safeData.center || "Idea"}". Describe how to validate it, potential competitors, or technical execution paths.`); }} style={{ background: LIME, color: "#000", border: "none", borderRadius: "4px", padding: "4px 8px", fontSize: "9px", fontWeight: "bold", cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase" }}>
            ⚡ RESEARCH NODE
          </button>
        </div>
      )}
      <div style={{ position: "absolute", bottom: "10px", left: "10px", color: "rgba(255,255,255,0.25)", fontSize: "10px", fontFamily: "monospace", zIndex: 10 }}>drag · scroll to zoom · click to highlight</div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: isFullscreen ? "100%" : "auto", minHeight: isFullscreen ? "auto" : "100%", display: "block", cursor: dragging ? "grabbing" : "grab", userSelect: "none" }} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <defs>
          <filter id="gl"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          {branches.map((b, i) => { const c = BRANCH_COLORS[i % 6]; return (<radialGradient key={i} id={`rg${i}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={c} stopOpacity="0.12" /><stop offset="100%" stopColor={c} stopOpacity="0.01" /></radialGradient>); })}
        </defs>
        <rect width={W} height={H} fill="#050505" />
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={cx} cy={cy} r={88} fill="#ffffff" opacity="0.03" filter="url(#gl)" />
          <circle cx={cx} cy={cy} r={70} fill="#ffffff" />
          {wrap(safeData.center || "IDEA", 11).map((ln, i, arr) => (<text key={i} x={cx} y={cy + (i - (arr.length - 1) / 2) * 17} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="bold" fill="#050505" fontFamily="Inter, sans-serif" letterSpacing="0.05em">{ln}</text>))}
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
      {Array.isArray(data?.weeks) && data.weeks.map((w, i) => (
        <div key={i} style={{ marginBottom: "1.8rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.6rem", paddingBottom: "0.4rem", borderBottom: `1px solid #1c1c1c` }}>
            <span style={{ color: LIME, fontWeight: "bold", fontSize: "0.78rem" }}>{w.week}</span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.68rem" }}>— {w.focus}</span>
          </div>
          {Array.isArray(w?.tasks) && w.tasks.map((t, j) => { 
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
            {Array.isArray(data?.[q.key]) && data[q.key].map((item, i) => (
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
function CompanyBuilder({ idea, qaCtx, profile, onClose, appLanguage = "en" }) {
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
    const langName = getLangName(appLanguage);
    let sys = `You are FORGE SYSTEMS. McKinsey meets YC. Specific, ruthless, no filler. ## headers. → bullets.`;
    if (appLanguage !== "en") {
      sys += `\n\nCRITICAL LANGUAGE MANDATE: Since the user selected ${langName}, you MUST write your entire response, including all section headings (like Company Architecture, Core Systems, Workflow Design, Hiring Sequence, Revenue Operations, Tech Stack, Growth Levers, 90-Day Plan, Critical Failure Points) and all explanation bullets completely in ${langName}. Do NOT use English under any circumstances.`;
    }
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

function IntelPanel({ idea, profile, onClose, initialQuery, onQueryHandled, appLanguage = "en" }) {
  const getGreeting = (lang: string) => {
    switch (lang) {
      case "sw": return `## FORGE MAARIFA\n\nUtafiti wa soko la moja kwa moja wa AI. Niulize:\n\n→ Ukubwa wa soko na idadi halisi\n→ Washindani katika sekta hii\n→ Sheria na kanuni za soko lako\n→ Mazingira ya ufadhili\n→ Chaguzi za teknolojia kwa changamoto zako`;
      case "es": return `## CEREBRO FORGE\n\nInvestigación de mercado en vivo por IA. Pregúntame:\n\n→ Tamaño de mercado y cifras reales\n→ Competidores en este espacio\n→ Regulaciones para tu mercado\n→ Panorama de financiación\n→ Opciones tecnológicas para tus restricciones`;
      case "fr": return `## INFOS FORGE\n\nRecherche de marché en direct par IA. Demandez-moi:\n\n→ Taille du marché et chiffres réels\n→ Concurrents dans cet espace\n→ Réglementations pour votre marché\n→ Paysage des financements\n→ Options technologiques pour vos contraintes`;
      case "de": return `## FORGE INTEL\n\nLive-KI-Marktforschung. Fragen Sie mich:\n\n→ Marktgröße und reale Zahlen\n→ Wettbewerber in diesem Bereich\n→ Vorschriften für Ihren Markt\n→ Finanzierungslandschaft\n→ Technologieoptionen für Ihre Einschränkungen`;
      case "ar": return `## فورج إنتل (معلومات فورج)\n\nأبحاث السوق المباشرة بالذكاء الاصعتاعي. اسألني عن:\n\n← حجم السوق والأرقام الحقيقية\n← المنافسون في هذا المجال\n← التشريعات والأنظمة الخاصة بسوقك\n← مشهد التمويل والاستثمار\n← الخيارات التقنية المناسبة لقيودك`;
      default: return `## FORGE INTEL\n\nLive AI research. Ask me:\n\n→ Market size and real numbers\n→ Competitors in this space\n→ Regulations for your market\n→ Funding landscape\n→ Tech options for your constraints`;
    }
  };

  const [msgs, setMsgs] = useState(() => [{ role: "assistant", content: getGreeting(appLanguage) }]);
  const [inp, setInp] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const histRef = useRef([]);

  useEffect(() => {
    // If the chat conversation is in its starting state, update the greeting automatically
    if (histRef.current.length === 0) {
      setMsgs([{ role: "assistant", content: getGreeting(appLanguage) }]);
    }
  }, [appLanguage]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = useCallback(async (text?: string) => {
    const q = (text || inp).trim(); if (!q || busy) return;
    setInp("");
    const userMsg = { role: "user", content: q };
    histRef.current = [...histRef.current, userMsg];
    setMsgs(prev => [...prev, userMsg, { role: "assistant", content: "" }]);
    setBusy(true);

    const langName = getLangName(appLanguage);
    let sys = `You are FORGE INTEL — direct, research-sharp AI for founders.\n${profileContext(profile)}\n${marketContext(profile)}\nAnswer with specifics relevant to this founder's context and market. Use **bold** for key terms. Use → for lists. Give best estimates when exact data unavailable.`;
    if (appLanguage !== "en") {
      sys += `\n\nCRITICAL LANGUAGE MANDATE: Since the user selected ${langName}, you MUST converse and write your entire response completely in ${langName}. Do NOT chat in English under any circumstances. Always reply in ${langName}.`;
    }

    const ctx = histRef.current.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    try {
      let reply = "";
      await aiStream(sys, `Context:\n${ctx.slice(0, -q.length - 10)}\n\nLatest: ${q}`, chunk => { reply = chunk; setMsgs(prev => { const n = [...prev]; n[n.length - 1] = { role: "assistant", content: chunk }; return n; }); }, 900, true);
      histRef.current = [...histRef.current, { role: "assistant", content: reply }];
    } catch (e) { setMsgs(prev => { const n = [...prev]; n[n.length - 1] = { role: "assistant", content: `Error: ${e.message}` }; return n; }); }
    setBusy(false); setTimeout(() => taRef.current?.focus(), 80);
  }, [inp, busy, idea, profile, appLanguage]);

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
  businessplan: { sys: `JSON only. {"title":"...","oneliner":"pitch","sections":[{"title":"NAME","content":"content"}]} 10 sections: Problem,Solution,Market Size,Business Model & Unit Economics,Revenue Streams & Model,Go-To-Market,Competitive Moat,Team Requirements,Financial Projections & 12-month Runway,Next Steps. Specifically detail a rough revenue model, basic unit economics, and 12-month runway estimates based on target market parameters. Start { end }`, usr: (idea, ctx, p) => `${profileContext(p)}\n${marketContext(p)}\nIdea:"${idea}"\n${ctx}` },
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

const LANGUAGES_LIST = [
  { code: "sw", name: "Kiswahili (Swahili) 🇹🇿", native: "Kiswahili" },
  { code: "en", name: "English 🇺🇸", native: "English" },
  { code: "es", name: "Español (Spanish)", native: "Español" },
  { code: "fr", name: "Français (French)", native: "Français" },
  { code: "de", name: "Deutsch (German)", native: "Deutsch" },
  { code: "ar", name: "العربية (Arabic)", native: "العربية" },
  { code: "hi", name: "हिन्दी (Hindi)", native: "हिन्दी" },
  { code: "zh-CN", name: "简体中文 (Chinese)", native: "简体中文" },
  { code: "pt", name: "Português", native: "Português" },
  { code: "it", name: "Italiano", native: "Italiano" },
  { code: "ru", name: "Русский", native: "Русский" },
  { code: "ja", name: "日本語", native: "日本語" },
  { code: "ko", name: "한국어", native: "한국어" },
  { code: "tr", name: "Türkçe", native: "Türkçe" },
  { code: "vi", name: "Tiếng Việt", native: "Tiếng Việt" },
  { code: "id", name: "Bahasa Indonesia", native: "Bahasa Indonesia" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "sq", name: "Shqip", native: "Shqip" },
  { code: "am", name: "አማርኛ", native: "Amharic" },
  { code: "hy", name: "Հայերեն", native: "Armenian" },
  { code: "az", name: "Azərbaycan", native: "Azerbaijani" },
  { code: "eu", name: "Euskara", native: "Basque" },
  { code: "be", name: "Беларуская", native: "Belarusian" },
  { code: "bn", name: "বাংলা", native: "Bengali" },
  { code: "bs", name: "Bosanski", native: "Bosnian" },
  { code: "bg", name: "Български", native: "Bulgarian" },
  { code: "ca", name: "Català", native: "Catalan" },
  { code: "ceb", name: "Cebuano", native: "Cebuano" },
  { code: "ny", name: "Chichewa", native: "Chichewa" },
  { code: "co", name: "Corsu", native: "Corsican" },
  { code: "hr", name: "Hrvatski", native: "Croatian" },
  { code: "cs", name: "Čeština", native: "Czech" },
  { code: "da", name: "Dansk", native: "Danish" },
  { code: "nl", name: "Nederlands", native: "Dutch" },
  { code: "eo", name: "Esperanto", native: "Esperanto" },
  { code: "et", name: "Eesti", native: "Estonian" },
  { code: "tl", name: "Tagalog", native: "Filipino" },
  { code: "fi", name: "Suomi", native: "Finnish" },
  { code: "fy", name: "Frysk", native: "Frisian" },
  { code: "gl", name: "Galego", native: "Galician" },
  { code: "ka", name: "ქართული", native: "Georgian" },
  { code: "el", name: "Ελληνικά", native: "Greek" },
  { code: "gu", name: "ગુજરાતી", native: "Gujarati" },
  { code: "ht", name: "Kreyòl Ayisyen", native: "Haitian Creole" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "haw", name: "Ōlelo Hawaiʻi", native: "Hawaiian" },
  { code: "iw", name: "עברית", native: "Hebrew" },
  { code: "hmn", name: "Hmoob", native: "Hmong" },
  { code: "hu", name: "Magyar", native: "Hungarian" },
  { code: "is", name: "Íslenska", native: "Icelandic" },
  { code: "ig", name: "Igbo", native: "Igbo" },
  { code: "ga", name: "Gaeilge", native: "Irish" },
  { code: "jv", name: "Jawa", native: "Javanese" },
  { code: "kn", name: "ಕನ್ನಡ", native: "Kannada" },
  { code: "kk", name: "Қазақ тілі", native: "Kazakh" },
  { code: "km", name: "ខ្មែរ", native: "Khmer" },
  { code: "rw", name: "Kinyarwanda", native: "Kinyarwanda" },
  { code: "ku", name: "Kurdî", native: "Kurdish" },
  { code: "ky", name: "Кыргызча", native: "Kyrgyz" },
  { code: "lo", name: "ລາວ", native: "Lao" },
  { code: "la", name: "Latina", native: "Latin" },
  { code: "lv", name: "Latviešu", native: "Latvian" },
  { code: "lt", name: "Lietuvių", native: "Lithuanian" },
  { code: "lb", name: "Lëtzebuergesch", native: "Luxembourgish" },
  { code: "mk", name: "Македонски", native: "Macedonian" },
  { code: "mg", name: "Malagasy", native: "Malagasy" },
  { code: "ms", name: "Bahasa Melayu", native: "Malay" },
  { code: "ml", name: "മലയാളം", native: "Malayalam" },
  { code: "mt", name: "Malti", native: "Maltese" },
  { code: "mi", name: "Māori", native: "Maori" },
  { code: "mr", name: "मराठी", native: "Marathi" },
  { code: "mn", name: "Монгол", native: "Mongolian" },
  { code: "my", name: "မြန်မာ", native: "Myanmar (Burmese)" },
  { code: "ne", name: "नेपाली", native: "Nepali" },
  { code: "no", name: "Norsk", native: "Norwegian" },
  { code: "or", name: "ଓଡ଼ିଆ", native: "Odia" },
  { code: "ps", name: "پښتو", native: "Pashto" },
  { code: "fa", name: "فارسی", native: "Persian" },
  { code: "pl", name: "Polski", native: "Polish" },
  { code: "pa", name: "ਪੰਜਾਬੀ", native: "Punjabi" },
  { code: "ro", name: "Română", native: "Romanian" },
  { code: "sm", name: "Gagana Sāmoa", native: "Samoan" },
  { code: "gd", name: "Gàidhlig", native: "Scots Gaelic" },
  { code: "sr", name: "Српски", native: "Serbian" },
  { code: "st", name: "Sesotho", native: "Sesotho" },
  { code: "sn", name: "ChiShona", native: "Shona" },
  { code: "sd", name: "سنڌي", native: "Sindhi" },
  { code: "si", name: "සිංಹල", native: "Sinhala" },
  { code: "sk", name: "Slovenčina", native: "Slovak" },
  { code: "sl", name: "Slovenščina", native: "Slovenian" },
  { code: "so", name: "Soomaali", native: "Somali" },
  { code: "su", name: "Sunda", native: "Sundanese" },
  { code: "tg", name: "Тоҷикӣ", native: "Tajik" },
  { code: "ta", name: "தமிழ்", native: "Tamil" },
  { code: "tt", name: "Татар", native: "Tatar" },
  { code: "te", name: "తెలుగు", native: "Telugu" },
  { code: "th", name: "ไทย", native: "Thai" },
  { code: "ug", name: "ئۇيغۇرچە", native: "Uyghur" },
  { code: "uk", name: "Українська", native: "Ukrainian" },
  { code: "ur", name: "اردو", native: "Urdu" },
  { code: "uz", name: "Oʻzbek", native: "Uzbek" },
  { code: "cy", name: "Cymraeg", native: "Welsh" },
  { code: "xh", name: "IsiXhosa", native: "Xhosa" },
  { code: "yi", name: "ייִדיש", native: "Yiddish" },
  { code: "yo", name: "Yorùbá", native: "Yoruba" },
  { code: "zu", name: "IsiZulu", native: "Zulu" },
];

const getLangName = (code: string) => {
  const found = LANGUAGES_LIST.find(l => l.code === code);
  if (found) {
    if (found.code === "ar") return "Arabic (العربية)";
    if (found.code === "sw") return "Swahili (Kiswahili)";
    if (found.code === "es") return "Spanish (Español)";
    if (found.code === "fr") return "French (Français)";
    if (found.code === "de") return "German (Deutsch)";
    return found.name || found.native;
  }
  return "English";
};

function getQSys(langCode = "en") {
  const langName = getLangName(langCode);
  return `You are FORGE — an incredibly simple, kind, and helpful business buddy who asks questions using basic school-level words.
FORMAT MANDATE:
1. Start with a 2-word title prefixed with ** and suffixed with ** (e.g., **The Problem**, **The Buyers**).
2. On the next line, ask exactly ONE extremely short, ultra-simple question of maximum 8-10 words. It must be written with the most basic, plain everyday words possible.
3. No business terms, no complex words, no startup jargon. (Do NOT use words like: co-founder, demographic, validation, constraints, monetization, acquisition, leverage, metrics, UVP).
4. Make it so easy that anyone can read the question and type an answer in 5 seconds.
${langCode !== "en" ? `5. The 2-word title and the question MUST be completely written/asked in ${langName}.` : ""}`;
}

const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  English: {
    next: "NEXT →",
    save: "SAVING…",
    enter: "ENTER FORGE SYSTEM →",
    back: "BACK",
    reset: "RESET",
    search_placeholder: "Ask anything…",
    honest_placeholder: "Honest. No performance.",
    steps_completed: "QUESTIONS COMPLETED",
    ai_research_chat: "AI RESEARCH CHAT",
    forge_intel: "FORGE INTEL",
    concept_score: "Concept Score",
    reality_check: "Reality Check",
    strengths: "STRENGTHS",
    critical_risks: "CRITICAL RISKS / GAPS",
    live_market_data: "LIVE MARKET DATA VALIDATION",
    co_founder_override: "CO-FOUNDER PROFILE EXCERPT",
    generation_loading: "Generating strategic reports. This will take a moment...",
    founder_profile: "FOUNDER PROFILE",
    market_context: "MARKET CONTEXT",
    focus_mode_btn: "Focus Mode",
    view_history: "View History",
    history_vault: "History Vault",
    user_settings: "User Settings",
    convert_any_lang: "Translate Web App",
    mindmap_label: "Mind Map",
    mindmap_desc: "Interactive visual landscape",
    blueprint_label: "Blueprint",
    blueprint_desc: "Concept, market, risks, metrics",
    roadmap_label: "Roadmap",
    roadmap_desc: "4-phase plan to dominance",
    businessplan_label: "Business Plan",
    businessplan_desc: "Lean plan across all pillars",
    actionplan_label: "30-Day Plan",
    actionplan_desc: "Checkable tasks. Real outcomes.",
    swot_label: "SWOT",
    swot_desc: "Ruthless strategic breakdown",
    promptpack_label: "Prompt Pack",
    promptpack_desc: "Cursor/Claude Setup & Prompts",
    speak_customer: "Have you spoken to at least one real potential customer about this idea?",
    yes_spoken: "Yes, I have",
    not_yet: "Not yet",
    warning_spoken: "⚠ No real conversations = unvalidated assumptions. The outputs will still generate but treat them as hypotheses, not facts. Your #1 action after this: talk to one real person.",
    running_reality: "RUNNING REALITY CHECK…",
    reality_complete: "REALITY CHECK COMPLETE",
    build_outputs: "BUILD OUTPUTS →",
    drop_idea_label: "Drop your raw idea",
    idea_placeholder: "No polish needed. Half-baked is fine.\nRaw and messy is where the best ideas live.",
    ignite_btn: "IGNITE →",
    loading: "LOADING…",
    core_deliverables_title: "Core Deliverables Checkpoints",
    advanced_venture_title: "Advanced Venture Deliverables",
    deeper_strategic_analytics: "DEEPER STRATEGIC ANALYTICS",
    collapse: "COLLAPSE",
    expand: "EXPAND"
  },
  Kiswahili: {
    next: "MBELE →",
    save: "INAHIFADHI…",
    enter: "INGIA KWENYE MSINGI →",
    back: "NYUMA",
    reset: "ANZA UPYA",
    search_placeholder: "Uliza chochote…",
    honest_placeholder: "Sema ukweli bila kuigiza.",
    steps_completed: "MASWALI YAMEKAMILIKA",
    ai_research_chat: "MAZUNGUMZO YA UTAFITI WA AI",
    forge_intel: "FORGE MAARIFA",
    concept_score: "Alama ya Wazo",
    reality_check: "Mwangaza wa Ukweli",
    strengths: "Nguvu Muhimu",
    critical_risks: "Hatari na Upungufu",
    live_market_data: "Uthibitisho wa Soko la Moja kwa Moja",
    co_founder_override: "Muhtasari wa Wasifu wa Mwanzilishi Mwenza",
    generation_loading: "Kutengeneza ripoti za kimkakati. Hii itachukua muda mfupi...",
    founder_profile: "WASIFU WA MWANZILISHI",
    market_context: "MAZINGIRA YA SOKO",
    focus_mode_btn: "Hali ya Kuzingatia",
    view_history: "Angalia Kumbukumbu",
    history_vault: "Kombora la Kumbukumbu",
    user_settings: "Mipangilio ya Mtumiaji",
    convert_any_lang: "Tafsiri Programu",
    mindmap_label: "Ramani ya Mawazo",
    mindmap_desc: "Taswira unganishi ya mawazo",
    blueprint_label: "Ramani ya Mradi",
    blueprint_desc: "Dhana, soko, hatari, na vipimo",
    roadmap_label: "Mpango Kazi",
    roadmap_desc: "Awamu 4 kuelekea kutawala soko",
    businessplan_label: "Mpango wa Biashara",
    businessplan_desc: "Mpango mwepesi wa mihimili yote",
    actionplan_label: "Mpango wa Siku 30",
    actionplan_desc: "Kazi za kufanya na matokeo halisi",
    swot_label: "Uchambuzi wa SWOT",
    swot_desc: "Uchambuzi mkali wa nguvu na udhaifu",
    promptpack_label: "Kifurushi cha Amri",
    promptpack_desc: "Mipangilio ya Cursor na Claude",
    speak_customer: "Je, umezungumza na angalau mteja mmoja mtarajiwa kuhusu wazo hili?",
    yes_spoken: "Ndio, nimefanya hivyo",
    not_yet: "Bado",
    warning_spoken: "⚠ Hakuna mazungumzo halisi = mawazo yasiyothibitishwa. Ripoti zitajazwa lakini zichukulie kama nadharia tu, sio ukweli. Hatua yako ya kwanza sasa: zungumza na mtu mmoja halisi.",
    running_reality: "TATAFITI MWANGAZA WA UKWELI…",
    reality_complete: "MWANGAZA WA UKWELI UMEKAMILIKA",
    build_outputs: "TENGENEZA RIPOTI →",
    drop_idea_label: "Weka wazo lako ghafi hapa",
    idea_placeholder: "Hakuna haja ya kuipamba. Nusu-kamili inafaa kabisa.\nMawazo ya ghafi na ya fujo ndipo mawazo bora yanapoishi.",
    ignite_btn: "WASHA →",
    loading: "INAFUNGUA…",
    core_deliverables_title: "Vigezo Kuu vya Mipango ya Mradi",
    advanced_venture_title: "Mipango ya Juu ya Biashara",
    deeper_strategic_analytics: "UCHAMBUZI WA KIKAKATI ZAIDI",
    collapse: "KUNJA",
    expand: "PANUA"
  },
  Español: {
    next: "SIGUIENTE →",
    save: "GUARDANDO…",
    enter: "ENTRAR AL SISTEMA FORGE →",
    back: "ATRÁS",
    reset: "REINICIAR",
    search_placeholder: "Pregunta lo que sea…",
    honest_placeholder: "Sincero. Sin rodeos.",
    steps_completed: "PREGUNTAS COMPLETADAS",
    ai_research_chat: "CHAT DE INVESTIGACIÓN IA",
    forge_intel: "CEREBRO FORGE",
    concept_score: "Puntuación de Concepto",
    reality_check: "Baño de Realidad",
    strengths: "Fortalezas",
    critical_risks: "Riesgos Críticos",
    live_market_data: "Validación de Mercado en Vivo",
    co_founder_override: "Extracto del Perfil del Cofundador",
    generation_loading: "Generando informes estratégicos. Esto tomará un momento...",
    founder_profile: "PERFIL DEL FUNDADOR",
    market_context: "CONTEXTO DEL MERCADO",
    focus_mode_btn: "Modo Enfoque",
    view_history: "Ver Historial",
    history_vault: "Bóveda de Historial",
    user_settings: "Ajustes de Usuario",
    convert_any_lang: "Traducir Aplicación",
    mindmap_label: "Mapa Mental",
    mindmap_desc: "Espacio de trabajo visual",
    blueprint_label: "Plano Estructural",
    blueprint_desc: "Concepto, mercado, riesgos, métricas",
    roadmap_label: "Ruta de Trabajo",
    roadmap_desc: "4 fases hacia el éxito",
    businessplan_label: "Plan de Negocios",
    businessplan_desc: "Plan ágil en todos los pilares",
    actionplan_label: "Plan de 30 Días",
    actionplan_desc: "Tareas claras y resultados reales",
    swot_label: "DAFO",
    swot_desc: "Análisis estratégico de fortalezas",
    promptpack_label: "Pack de Prompts",
    promptpack_desc: "Configuración para Cursor y Claude",
    speak_customer: "¿Has hablado con al menos un cliente potencial real sobre esta idea?",
    yes_spoken: "Sí, lo he hecho",
    not_yet: "Aún no",
    warning_spoken: "⚠ Sin conversaciones reales = suposiciones no validadas. Se generará la información pero considérala como hipótesis, no hechos. Tu acción #1 después de esto: habla con una persona real.",
    running_reality: "EJECUTANDO BAÑO DE REALIDAD…",
    reality_complete: "BAÑO DE REALIDAD COMPLETADO",
    build_outputs: "CONSTRUIR INFORMES →",
    drop_idea_label: "Deja tu idea en bruto",
    idea_placeholder: "No se necesita pulir. Una idea a medias está bien.\nAhí en lo bruto y desordenado es donde viven las mejores ideas.",
    ignite_btn: "ENCENDER →",
    loading: "CARGANDO…",
    core_deliverables_title: "Puntos de Control de Entregables Clave",
    advanced_venture_title: "Entregables de Empresa Avanzados",
    deeper_strategic_analytics: "ANÁLISIS ESTRATÉGICO PROFUNDO",
    collapse: "COLAPSAR",
    expand: "EXPANDIR"
  },
  Français: {
    next: "SUIVANT →",
    save: "ENREGISTREMENT…",
    enter: "ENTRER DANS FORGE →",
    back: "RETOUR",
    reset: "RÉINITIALISER",
    search_placeholder: "Demandez n'importe quoi…",
    honest_placeholder: "Honnête. Sans détour.",
    steps_completed: "QUESTIONS COMPLÉTÉES",
    ai_research_chat: "CHAT DE RECHERCHE IA",
    forge_intel: "INTELLIGÈNCE FORGE",
    concept_score: "Score de Concept",
    reality_check: "Vérité Brutale",
    strengths: "Forces",
    critical_risks: "Risques Critiques",
    live_market_data: "Validation du Marché en Direct",
    co_founder_override: "Extrait du Profil du Cofondateur",
    generation_loading: "Génération de rapports stratégiques. Veuillez patienter...",
    founder_profile: "PROFIL DU FONDATEUR",
    market_context: "CONTEXTE DU MARCHÉ",
    focus_mode_btn: "Mode Concentration",
    view_history: "Voir l'Historique",
    history_vault: "Coffre d'Historique",
    user_settings: "Paramètres",
    convert_any_lang: "Traduire l'Application",
    mindmap_label: "Carte Mentale",
    mindmap_desc: "Espace de travail visual",
    blueprint_label: "Plan de Concept",
    blueprint_desc: "Concept, marché, risques, indicateurs",
    roadmap_label: "Route de Travail",
    roadmap_desc: "Plan en 4 étapes",
    businessplan_label: "Plan d'Affaires",
    businessplan_desc: "Planification agile complète",
    actionplan_label: "Plan de 30 Jours",
    actionplan_desc: "Tâches à faire et objectifs clairs",
    swot_label: "SWOT",
    swot_desc: "Analyse des forces et faiblesses",
    promptpack_label: "Pack de Prompts",
    promptpack_desc: "Config de démarrage pour Claude/Cursor",
    speak_customer: "Avez-vous parlé à au moins un client potentiel réel de cette idée ?",
    yes_spoken: "Oui, je l'ai fait",
    not_yet: "Pas encore",
    warning_spoken: "⚠ Pas de conversations réelles = hypothèses non validées. Les rapports seront générés mais traitez-les comme des hypothèses. Votre action #1 après cela : parlez à une personne réelle.",
    running_reality: "EXÉCUTION DU CONTRÔLE DE RÉALITÉ…",
    reality_complete: "CONTRÔLE DE RÉALITÉ TERMINÉ",
    build_outputs: "CRÉER LES RAPPORTS →",
    drop_idea_label: "Déposez votre idée brute",
    idea_placeholder: "Pas besoin de peaufiner. Une idée à moitié cuite est parfaite.\nC'est dans le brut et le désordre que vivent les meilleures idées.",
    ignite_btn: "ALLUMER →",
    loading: "CHARGEMENT…",
    core_deliverables_title: "Points de Contrôle des Livrables Clés",
    advanced_venture_title: "Livrables de Projet Avancés",
    deeper_strategic_analytics: "ANALYSE STRATÉGIQUE APPROFONDIE",
    collapse: "RÉDUIRE",
    expand: "DÉVELOPPER"
  },
  Deutsch: {
    next: "WEITER →",
    save: "SPEICHERN…",
    enter: "FORGE SYSTEM STARTEN →",
    back: "ZURÜCK",
    reset: "ZURÜCKSETZEN",
    search_placeholder: "Frage stellen…",
    honest_placeholder: "Ehrlich. Direkt.",
    steps_completed: "FRAGEN BEANTWORTET",
    ai_research_chat: "KI FORSCHUNGS-CHAT",
    forge_intel: "FORGE ERKENNTNIS",
    concept_score: "Konzept-Bewertung",
    reality_check: "Realitäts-Check",
    strengths: "Stärken",
    critical_risks: "Kritische Risiken",
    live_market_data: "Live-Marktdaten Validierung",
    co_founder_override: "Mitgründer-Profil-Auszug",
    generation_loading: "Erstelle Strategieberichte. Bitte warten...",
    founder_profile: "GRÜNDERPROFIL",
    market_context: "MARKTKONTEXT",
    focus_mode_btn: "Fokus-Modus",
    view_history: "Verlauf anzeigen",
    history_vault: "Verlaufs-Tresor",
    user_settings: "Einstellungen",
    convert_any_lang: "App übersetzen",
    mindmap_label: "Mindmap",
    mindmap_desc: "Interaktive visuelle Übersicht",
    blueprint_label: "Bauplan",
    blueprint_desc: "Konzept, Markt, Risiken, Metriken",
    roadmap_label: "Fahrplan",
    roadmap_desc: "4 Phasen zur Marktführerschaft",
    businessplan_label: "Businessplan",
    businessplan_desc: "Schlanker Plan über alle Säulen",
    actionplan_label: "30-Tage-Plan",
    actionplan_desc: "Konkrete Aufgaben & reale Ziele",
    swot_label: "SWOT-Analyse",
    swot_desc: "Kompromisslose Stärken-Schwächen-Analyse",
    promptpack_label: "Prompt-Paket",
    promptpack_desc: "Cursor- & Claude-Anweisungen",
    speak_customer: "Haben Sie mit mindestens einem echten potenziellen Kunden über diese Idee gesprochen?",
    yes_spoken: "Ja, habe ich",
    not_yet: "Noch nicht",
    warning_spoken: "⚠ Keine echten Gespräche = ungeprüfte Annahmen. Die Berichte werden generiert, betrachten Sie sie jedoch als Hypothesen. Ihre wichtigste Maßnahme danach: Sprechen Sie mit einer echten Person.",
    running_reality: "REALITÄTS-CHECK LÄUFT…",
    reality_complete: "REALITÄTS-CHECK ABGESCHLOSSEN",
    build_outputs: "BERICHTE ERSTELLEN →",
    drop_idea_label: "Geben Sie Ihre rohe Idee ein",
    idea_placeholder: "Kein Finetuning nötig. Halbfertig ist völlig okay.\nIn rohen und unordentlichen Gedanken entstehen die besten Ideen.",
    ignite_btn: "ZÜNDEN →",
    loading: "LÄDT…",
    core_deliverables_title: "Kern-Meilensteine",
    advanced_venture_title: "Erweiterte Meilensteine",
    deeper_strategic_analytics: "TIEFENWERKENDE STRATEGISCHE ANALYSEN",
    collapse: "EINKLAPPEN",
    expand: "AUSKLAPPEN"
  },
  "العربية": {
    next: "التالي ←",
    save: "جاري الحفظ…",
    enter: "الدخول إلى نظام فورج ←",
    back: "رجوع",
    reset: "إعادة تعيين",
    search_placeholder: "اسأل عن أي شيء…",
    honest_placeholder: "كن صريحاً. بدون مجاملة.",
    steps_completed: "الأسئلة المنجزة",
    ai_research_chat: "دردشة أبحاث الذكاء الاصطناعي",
    forge_intel: "معلومات فورج",
    concept_score: "تقييم الفكرة",
    reality_check: "مواجهة الواقع",
    strengths: "نقاط القوة",
    critical_risks: "المخاطر والعيوب",
    live_market_data: "التحقق من بيانات السوق الحية",
    co_founder_override: "مقتطف من ملف المؤسس الشريك",
    generation_loading: "جاري توليد التقارير الاستراتيجية. يرجى الانتظار لحظة...",
    founder_profile: "ملف المؤسس",
    market_context: "سياق السوق",
    focus_mode_btn: "وضع التركيز",
    view_history: "عرض السجل",
    history_vault: "خزنة السجل",
    user_settings: "إعدادات المستخدم",
    convert_any_lang: "ترجمة التطبيق",
    mindmap_label: "الخريطة الذهنية",
    mindmap_desc: "المشهد البصري التفاعلي",
    blueprint_label: "المخطط الهيكلي",
    blueprint_desc: "المفهوم، السوق، المخاطر، والقياسات",
    roadmap_label: "خارطة الطريق",
    roadmap_desc: "خطة من 4 مراحل للريادة والسيطرة",
    businessplan_label: "خطة العمل",
    businessplan_desc: "خطة عمل مرنة لجميع ركائز المشروع",
    actionplan_label: "خطة 30 يوماً",
    actionplan_desc: "مهام قابلة للتحقق ونتائج ملموسة",
    swot_label: "تحليل SWOT",
    swot_desc: "تحليل استراتيجي لنقاط القوة والضعف",
    promptpack_label: "حزمة الأوامر",
    promptpack_desc: "إعدادات وأوامر لـ Claude و Cursor",
    speak_customer: "هل تحدثت مع عميل حقيقي واحد محتمل على الأقل حول هذه الفكرة؟",
    yes_spoken: "نعم، لقد فعلت ذلك",
    not_yet: "ليس بعد",
    warning_spoken: "⚠ لا توجد محادثات حقيقية = افتراضات غير مؤكدة. سيستمر توليد التقارير ولكن تعامل معها كفرضيات وليست حقائق. خطوتك الأولى والأساسية بعد هذا: تحدث إلى شخص حقيقي واحد.",
    running_reality: "جاري تشغيل مواجهة الواقع…",
    reality_complete: "اكتملت مواجهة الواقع",
    build_outputs: "إنشاء المخرجات والتقارير ←",
    drop_idea_label: "ضع فكرتك الخام هنا",
    idea_placeholder: "لا حاجة للصقل الآن. الأفكار غير المكتملة مقبولة تماماً.\nفي الفوضى والمسودات الخام تولد وتعيش أفضل الأفكار.",
    ignite_btn: "إشعال الفكرة ←",
    loading: "جاري التحميل...",
    core_deliverables_title: "نقاط التحقق من المخرجات الأساسية",
    advanced_venture_title: "مخرجات المشروع المتقدمة",
    deeper_strategic_analytics: "تحليلات استراتيجية أعمق",
    collapse: "طي",
    expand: "توسيع"
  },
};

function t(key: string, lang = "en"): string {
  const langKeyMap: Record<string, string> = {
    en: "English",
    sw: "Kiswahili",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    ar: "العربية"
  };
  const uiKey = langKeyMap[lang] || lang;
  const dict = UI_TRANSLATIONS[uiKey] || UI_TRANSLATIONS["English"];
  return dict[key] || UI_TRANSLATIONS["English"][key] || key;
}

const ctxStr = pairs => pairs.map((x, i) => `Q${i + 1}: ${x.question}\nA${i + 1}: ${x.answer}`).join("\n\n");

// ── SIGNATURE HALLMARK WAX SEAL ──────────────────────────
function SignatureSeal() {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      margin: "1.8rem auto 1rem",
      animation: "stampIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
      transformOrigin: "center center",
      pointerEvents: "none",
      userSelect: "none"
    }}>
      <div style={{
        position: "relative",
        width: "92px",
        height: "92px",
        borderRadius: "50%",
        background: "radial-gradient(circle, #5C2026 50%, #3d1418 100%)", // Crimson Wax
        border: "3px double #C8A24E", // Sovereign Gilt
        boxShadow: "0 6px 14px rgba(0, 0, 0, 0.55), inset 0 2px 4px rgba(255, 255, 255, 0.25), inset 0 -4px 8px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
        overflow: "hidden"
      }}>
        <div style={{
          color: "#F4EFE3",
          fontFamily: '"Fraunces", serif',
          fontSize: "9px",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          textAlign: "center",
          lineHeight: "1.2",
          textShadow: "1px 1px 2px rgba(0,0,0,0.8)"
        }}>
          FORGE
        </div>
        <div style={{
          color: "#C8A24E",
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: "6px",
          fontWeight: "bold",
          letterSpacing: "1px",
          marginTop: "2px",
          opacity: 0.9,
          textShadow: "1px 1px 1px rgba(0,0,0,0.8)"
        }}>
          VALIDATED
        </div>
        <div style={{
          color: "#C8A24E",
          fontSize: "12px",
          marginTop: "1px",
          opacity: 0.85
        }}>
          ✦
        </div>
        <div style={{
          position: "absolute",
          inset: "6px",
          border: "1px dashed rgba(200, 162, 78, 0.3)",
          borderRadius: "50%",
          pointerEvents: "none"
        }} />
      </div>
      <style>{`
        @keyframes stampIn {
          0% {
            opacity: 0;
            transform: scale(3.5) rotate(-35deg);
            filter: blur(4px);
          }
          100% {
            opacity: 1;
            transform: scale(1) rotate(-8deg);
            filter: blur(0);
          }
        }
      `}</style>
    </div>
  );
}



// ── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [appLanguage, setAppLanguage] = useState(() => {
    return localStorage.getItem("forge_app_language") || "en";
  });
  const [showLangSelector, setShowLangSelector] = useState(false);
  const [langSearchQuery, setLangSearchQuery] = useState("");
  const langSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("forge_app_language", appLanguage);
  }, [appLanguage]);

  // Click outside language selector to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langSelectorRef.current && !langSelectorRef.current.contains(event.target as Node)) {
        setShowLangSelector(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Reset language search list when selector is closed
  useEffect(() => {
    if (!showLangSelector) {
      setLangSearchQuery("");
    }
  }, [showLangSelector]);

  // Google Translate Loader and Synchronizer
  useEffect(() => {
    if (document.getElementById("google-translate-script")) return;

    (window as any).googleTranslateElementInit = () => {
      new (window as any).google.translate.TranslateElement({
        pageLanguage: 'en',
        layout: (window as any).google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
      }, 'google_translate_element');
      
      // Auto-trigger saved language on initial load
      setTimeout(() => {
        const select = document.querySelector(".goog-te-combo") as HTMLSelectElement;
        const savedLang = localStorage.getItem("forge_app_language") || "en";
        if (select && savedLang !== "en") {
          select.value = savedLang;
          select.dispatchEvent(new Event("change"));
        }
      }, 1500);
    };

    const addScript = document.createElement("script");
    addScript.id = "google-translate-script";
    addScript.setAttribute("type", "text/javascript");
    addScript.setAttribute("src", "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit");
    document.body.appendChild(addScript);
  }, []);

  const handleLanguageChange = (langCode: string) => {
    localStorage.setItem("forge_app_language", langCode);
    setAppLanguage(langCode);

    // Set translation cookie recognized by Google Translate
    document.cookie = `googtrans=/en/${langCode}; path=/`;
    document.cookie = `googtrans=/en/${langCode}; domain=${window.location.hostname}; path=/`;

    // Try setting the dropdown value directly
    const changeWidget = () => {
      const select = document.querySelector(".goog-te-combo") as HTMLSelectElement;
      if (select) {
        select.value = langCode;
        select.dispatchEvent(new Event("change"));
        return true;
      }
      return false;
    };

    if (!changeWidget()) {
      // If the widget isn't ready yet, poll for up to 5 seconds every 250ms (never reload!)
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (changeWidget() || attempts > 20) {
          clearInterval(interval);
        }
      }, 250);
    }
  };

  const [appState, setAppState] = useState("loading"); // loading | auth | onboarding | app
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  
  const [phase, setPhase] = useState(() => {
    try {
      return localStorage.getItem("forge_draft_phase") || "ignition";
    } catch {
      return "ignition";
    }
  });

  const [phaseHistory, setPhaseHistory] = useState<string[]>([]);
  const lastPhaseRef = useRef<string>("ignition");

  useEffect(() => {
    lastPhaseRef.current = phase;
  }, []);

  useEffect(() => {
    const prev = lastPhaseRef.current;
    if (prev !== phase) {
      setPhaseHistory(history => {
        const lastInHistory = history[history.length - 1];
        if (lastInHistory === phase) {
          return history.slice(0, -1);
        } else {
          if (phase === "ignition") {
            return [];
          }
          return [...history, prev];
        }
      });
      lastPhaseRef.current = phase;
    }
  }, [phase]);

  const [idea, setIdea] = useState(() => {
    try {
      return localStorage.getItem("forge_draft_idea") || "";
    } catch {
      return "";
    }
  });

  const [qa, setQa] = useState(() => {
    try {
      const saved = localStorage.getItem("forge_draft_qa");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [curQ, setCurQ] = useState("");
  const [curA, setCurA] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [outType, setOutType] = useState(null);
  const [outputs, setOutputs] = useState({});
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("forge_draft_phase", phase);
      localStorage.setItem("forge_draft_idea", idea);
      localStorage.setItem("forge_draft_qa", JSON.stringify(qa));
    } catch (e) {
      console.error("Local draft saving exception:", e);
    }
  }, [phase, idea, qa]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
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
  
  // EXPERIENCE LOG / FEEDBACK STATE MANAGEMENT
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackState, setFeedbackState] = useState({ rating: 0, text: "", features: [] as string[], helpful: "" as "yes" | "no" | "" });
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem("forge_feedback_dismissed") === "true";
    } catch {
      return false;
    }
  });

  const submitFeedback = async () => {
    if (!feedbackState.helpful && !feedbackState.text.trim() && feedbackState.rating === 0) return;
    setFeedbackLoading(true);
    try {
      const feedbackObj = {
        id: `fd:${Date.now()}`,
        helpful: feedbackState.helpful,
        rating: feedbackState.rating || (feedbackState.helpful === "yes" ? 5 : feedbackState.helpful === "no" ? 1 : 0),
        text: feedbackState.text,
        features: feedbackState.features,
        submittedAt: Date.now(),
        userEmail: user?.email || "anonymous",
        userUid: user?.uid || getOrCreateGuestUid()
      };

      // Store in localStorage array for local state persistence
      const stored = localStorage.getItem("forge_founder_feedbacks");
      let list = stored ? JSON.parse(stored) : [];
      list.push(feedbackObj);
      localStorage.setItem("forge_founder_feedbacks", JSON.stringify(list));

      // Also sync to Firestore if configured
      if (db) {
        try {
          await setDoc(doc(db, 'feedbacks', feedbackObj.id), {
            id: feedbackObj.id,
            rating: feedbackObj.rating,
            text: feedbackObj.text,
            features: JSON.stringify(feedbackObj.features),
            submitted_at: feedbackObj.submittedAt,
            user_email: feedbackObj.userEmail,
            user_uid: feedbackObj.userUid
          });
          console.log("✓ Experience Feedback synchronized to Firestore successfully");
        } catch (dbErr) {
          console.warn("Firestore feedback skipped gracefully:", dbErr);
        }
      }

      // Also log feedback securely to the console for live developer tracing
      console.log("✓ Experience Feedback submitted successfully:", feedbackObj);

      setFeedbackSuccess(true);
      setTimeout(() => {
        setShowFeedbackModal(false);
        setFeedbackSuccess(false);
        setFeedbackState({ rating: 0, text: "", features: [], helpful: "" });
      }, 2500);
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleDismissBanner = () => {
    try {
      localStorage.setItem("forge_feedback_dismissed", "true");
      setBannerDismissed(true);
    } catch {}
  };

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

  const handleExportPDF = async () => {
    if (!outType || !outputs[outType]) return;
    setLoading(true);
    setLoadMsg(appLanguage === "sw" ? "Inatayarisha faili ya PDF..." : "Preparing secure PDF download...");
    try {
      const labelItem = OUTPUTS.find(o => o.key === outType)?.label || "Document";
      const filename = `Forge_${labelItem.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
      await exportComponentToPDF("forge-pdf-export-root", filename);
      trackEvent("export_pdf_success", "action", outType);
    } catch (e: any) {
      console.error(e);
      setErr("Failed to export PDF: " + e.message);
    } finally {
      setLoading(false);
    }
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
      trackEvent("app_loaded", "lifecycle", "v1.0");

      const session = await store.get("session");
      if (!session) {
        // Automatic high-integrity Guest Sandbox Entry with globally unique, per-session UID
        const guestUid = getOrCreateGuestUid();
        setUser({ uid: guestUid, email: "guest@forge.ai", isGuest: true, name: "Guest Visionary" });
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
      
      // 3. Absolute protection: If local session exists but key has been purged from memory, force login (bypass for OAuth sessions)
      if (!activeEncryptionKey && session.authType !== "oauth") {
        await store.del("session");
        setAppState("auth");
        return;
      }

      let u = await store.get(`user:${session.uid}`);
      if (!u && session.authType === "oauth") {
        u = {
          uid: session.uid,
          email: session.email,
          name: session.name,
          authType: "oauth",
          createdAt: Date.now()
        };
        await store.set(`user:${session.uid}`, u);
      }

      if (!u) { setAppState("auth"); return; }
      const p = await store.get(`profile:${session.uid}`);
      setUser(u);
      if (!p || p.incomplete === true || p.name === "Guest Visionary" || p.country === "Global Target") { setAppState("onboarding"); return; }
      setProfile(p); setAppState("app");
    })();
  }, []);



  const migrateGuestData = async (newUid: string) => {
    try {
      const guestUid = getOrCreateGuestUid();
      console.log("🚀 Migrating transient Guest session records to personal profile: ", newUid);
      
      // 1. Migrate Ideas from local / supabase
      const guestKeys = await store.list(`idea:${guestUid}:`);
      console.log(`Found ${guestKeys.length} guest ideas to migrate.`);
      for (const key of guestKeys) {
        const ideaData = await store.get(key);
        if (ideaData) {
          const parts = key.split(":");
          const ideaId = parts[2];
          const newKey = `idea:${newUid}:${ideaId}`;
          
          await store.set(newKey, {
            ...ideaData,
            user_uid: newUid,
            id: ideaId
          });
          
          await store.del(key);
        }
      }

      // 2. Migrate Profile if guest profile exists
      const guestProfile = await store.get(`profile:${guestUid}`) || profile;
      if (guestProfile) {
        const isDefaultTemplate = guestProfile.name === "Guest Visionary" || guestProfile.country === "Global Target";
        const cleanName = (user && user.name && user.name !== "Guest Visionary") ? user.name : "Founder";
        await store.set(`profile:${newUid}`, {
          ...guestProfile,
          uid: newUid,
          name: cleanName,
          incomplete: isDefaultTemplate
        });
        await store.del(`profile:${guestUid}`);
      }

      // 3. Clear guest specific key in localstorage
      localStorage.removeItem("forge_guest_ignitions");
      localStorage.removeItem("forge_guest_uid");

      console.log("✓ All guest records transitioned successfully to active secure profile.");
    } catch (migErr) {
      console.error("Data migration skipped/errored: ", migErr);
    }
  };

  const handleAuth = async (u, isNew) => {
    const wasGuest = user?.isGuest;
    const currentGuestUid = getOrCreateGuestUid();
    setUser(u);
    if (wasGuest && u.uid !== currentGuestUid) {
      await migrateGuestData(u.uid);
    }
    let p = await store.get(`profile:${u.uid}`);
    if (!p || p.incomplete === true || p.name === "Guest Visionary" || p.country === "Global Target") {
      setAppState("onboarding");
      return;
    }
    setProfile(p); setAppState("app");
  };

  const handleGuestAuth = async (u, isNew) => {
    const wasGuest = user?.isGuest;
    const currentGuestUid = getOrCreateGuestUid();
    setUser(u);
    if (wasGuest && u.uid !== currentGuestUid) {
      await migrateGuestData(u.uid);
    }
    setGuestAuthOpen(false);
    setShowAuthGateway(false);
    let p = await store.get(`profile:${u.uid}`);
    if (!p || p.incomplete === true || p.name === "Guest Visionary" || p.country === "Global Target") {
      setAppState("onboarding");
      return;
    }
    setProfile(p); setAppState("app");
  };

  const handleOnboarding = (p) => { setProfile(p); setAppState("app"); };

  const logout = async () => {
    // Purge memory allocations & active material arrays
    sessionStorage.removeItem("forge_vault_session");
    activeEncryptionKey = null;
    activeSaltHex = "";
    await store.del("session");
    try {
      await firebaseAuth.signOut();
    } catch (e) {
      console.error("Firebase auth sign out intercepted:", e);
    }
    setUser(null); setProfile(null); setAppState("auth");
    resetIdea();
  };

  const scoreIdea = useCallback(async (pairs) => {
    try {
      // We use our proxy search feature to find recent validation data online!
      let scoreSysPrompt = `You are FORGE VALIDATION ENGINE. Score this startup idea and use provided LIVE WEB DATA to validate the market. JSON only format: {"score":75,"label":"Solid","verdict":"brutal one sentence","strengths":["s1","s2"],"gaps":["g1","g2"],"searchValidation":{"percentage":82,"findings":["Searched fact 1","Searched fact 2"]}} Labels:Weak/Needs Work/Solid/Strong/Exceptional. Be factual.`;
      if (appLanguage && appLanguage !== "en") {
        const langName = getLangName(appLanguage);
        scoreSysPrompt += `\nCRITICAL LANGUAGE MANDATE: Since the user selected ${langName}, you MUST define/write the "label", "verdict", "strengths", "gaps", and "findings" texts in ${langName}. Do not translate standard JSON keys like "score" or "label" or "verdict" itself to avoid parser breaks, but translate their value strings.`;
      }
      const s = await ai(scoreSysPrompt, `${profileContext(profile)}\nIdea:"${idea}"\n${ctxStr(pairs)}`, true, 1000, 2, "market validation competitors for: " + idea);
      setIdeaScore(s);
      trackEvent("reality_check_scored", "validation", s.label, s.score);
      
      const currentAnalytics = await store.get("forge_analytics") || { sessionCount: 0, realityCheckCount: 0 };
      currentAnalytics.realityCheckCount = (currentAnalytics.realityCheckCount || 0) + 1;
      await store.set("forge_analytics", currentAnalytics);
      setAnalytics(currentAnalytics);

      // auto-save idea
      const id = currentIdeaId || Date.now().toString();
      setCurrentIdeaId(id);
      await store.set(`idea:${user?.uid || "guest"}:${id}`, { id, text: idea, score: s.score, label: s.label, qa: pairs, savedAt: Date.now() });

      // Autonomous Living DNA Memory Extraction
      try {
        const memoryPrompt = `You are the FORGE LIVING DNA ENGINE. Review this founder's startup idea and their questionnaire responses. 
Extract EXACTLY ONE deeply specific strategic constraint, pivot, or technical decision they have chosen (e.g., choice of target audience, technical approach, key competitive moat).
Maintain a professional, humble, specific, and direct tone. Under 15 words. Start immediately with the key constraint/decision.
Example: "Targeting freelance designers globally with direct outbound campaigns."
Idea: "${idea}"
Founder's Thinking:
${ctxStr(pairs)}`;
        const extracted = await ai(`Extract ONE key strategic decision or constraint under 15 words. Plain text only.`, memoryPrompt, false, 200, 2);
        if (extracted && extracted.trim()) {
          const cleanMem = extracted.replace(/^["'\-\s]+|["'\-\s]+$/g, "").trim();
          
          const stored = localStorage.getItem("forge_cofounder_memories");
          let currentMemories: string[] = [];
          if (stored) {
            try {
              currentMemories = JSON.parse(stored);
            } catch {}
          }
          // Only add if it's not already a duplicate or trivial
          const isDuplicate = currentMemories.some(
            m => m.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanMem.toLowerCase().replace(/[^a-z0-9]/g, "")
          );
          if (cleanMem && !isDuplicate) {
            currentMemories = [...currentMemories, cleanMem];
            // Cap to the last 15 most recent/relevant memories
            if (currentMemories.length > 15) {
              currentMemories = currentMemories.slice(-15);
            }
            localStorage.setItem("forge_cofounder_memories", JSON.stringify(currentMemories));

            // Sync decision log to Firestore
            if (db) {
              try {
                const docId = `mem-${Date.now()}`;
                await setDoc(doc(db, 'decision_logs', docId), {
                  id: docId,
                  decision: cleanMem,
                  idea_id: id,
                  user_uid: user?.uid || getOrCreateGuestUid(),
                  timestamp: Date.now()
                });
                console.log("✓ Live Decision Log synchronized to Firestore successfully");
              } catch (dbErr) {
                console.warn("Firestore decision_log insert skipped gracefully:", dbErr);
              }
            }

            console.log("Autonomous Living DNA memory recorded:", cleanMem);
          }
        }
      } catch (me) {
        console.error("Auto Living DNA memory extraction skipped/failed:", me);
      }
    } catch {
      setGlobalError("Couldn't reach the engine. Try again in a moment.");
    }
  }, [idea, profile, user, currentIdeaId, appLanguage]);

  const prefetchNext = useCallback((updated) => {
    if (updated.length >= Q_TARGET) return;
    const styles = ["Creative", "Critical", "Strategic", "Logical"];
    const key = `q${updated.length + 1}`;
    if (prefetchRef.current[key]) return;
    const style = styles[updated.length % styles.length];
    prefetchRef.current[key] = ai(getQSys(appLanguage), `${profileContext(profile)}\nIdea:"${idea}"\n\n${ctxStr(updated)}\n\nQ${updated.length + 1} of ${Q_TARGET}: ${style} style. Biggest unexplored gap. Push hard.`, false, 1000);
  }, [idea, profile, appLanguage]);

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
      const q = await ai(getQSys(appLanguage), `${profileContext(profile)}\nIdea:"${idea}"\nQ1 of ${Q_TARGET}. Creative style. Most foundational: what they're ACTUALLY building, for WHOM, single reason it must exist NOW.`, false, 1000);
      setCurQ(cleanQuestion(q)); setPhase("questioning");
    } catch (e: any) { 
      setErr(e.message); 
      setGlobalError("Couldn't reach the engine. Try again in a moment.");
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
      const q = cached || await ai(getQSys(appLanguage), `${profileContext(profile)}\nIdea:"${idea}"\n\n${ctxStr(updated)}\n\nQ${updated.length + 1} of ${Q_TARGET}: ${["Creative","Critical","Strategic","Logical"][updated.length % 4]} style. Biggest unexplored gap.`, false, 1000);
      setCurQ(cleanQuestion(q));
    } catch (e) { 
      setErr(e.message); 
      setGlobalError("Couldn't reach the engine. Try again in a moment.");
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

  const generate = async (type, forceRegen = false) => {
    if (outputs[type] && !forceRegen) { setOutType(type); setPhase("output"); return; }
    trackEvent("generate_output_started", "intelligence", type);
    setOutType(type); setPhase("generating"); setErr("");
    setLoadMsg(`Forging ${OUTPUTS.find(o => o.key === type)?.label}…`);
    const cfg = CONFIGS[type];
    const labelKey = `${type}_label`;
    const translatedLabel = t(labelKey, appLanguage);
    setLoadMsg(appLanguage === "sw" ? `Tengeneza ${translatedLabel}…` : `Forging ${translatedLabel}…`);
    
    let customSys = cfg.sys;
    if (appLanguage && appLanguage !== "en") {
      const langName = getLangName(appLanguage);
      customSys += `\nCRITICAL LANGUAGE MANDATE: Since the user selected ${langName}, you MUST define/write ALL display text values, descriptions, titles, lists, goals, and content fields inside the JSON object in ${langName}. Do not translate or modify standard JSON structure keys (like "weeks", "tasks", "priority", "sections", "milestones", "kpis", etc.) to prevent parse failure, but translate all strings, values, and paragraphs.`;
    }
    try {
      const result = await ai(customSys, cfg.usr(idea, ctxStr(qa), profile), true, 1400, 2, true);
      setOutputs(prev => ({ ...prev, [type]: result }));
      trackEvent("generate_output_success", "intelligence", type);
      setPhase("output");
    } catch (e: any) { 
      trackEvent("generate_output_failed", "intelligence", `${type}: ${e.message}`);
      setErr(`Failed: ${e.message}`); 
      setPhase("output-select"); 
      setGlobalError("Couldn't reach the engine. Try again in a moment.");
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

  // Callback routing removed as zero-trust accounts handle auth strictly client-side.

  if (appState === "loading") return <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: LIME, fontSize: "10px", letterSpacing: "4px", fontFamily: "monospace", fontWeight: "bold" }}>LOADING SYSTEM…</div></div>;
  if (appState === "auth") return <AuthScreen onAuth={handleAuth} />;
  if (appState === "onboarding") return <Onboarding user={user} onDone={handleOnboarding} appLanguage={appLanguage} />;

  const showTools = phase !== "ignition";
  const scoreColor = s => s >= 80 ? LIME : s >= 60 ? CYAN : PINK;

  const G = {
    app: { minHeight: "100vh", background: "#0F0D0B", color: "#F4EFE3", fontFamily: '"Inter", sans-serif', display: "flex" as const, flexDirection: "column" as const, alignItems: "center", padding: "0 1.25rem" },
    wrap: { width: "100%", maxWidth: "820px", transition: "padding-right .3s" },
    label: { color: PURPLE, fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "3px", marginBottom: "0.65rem", fontWeight: "bold" as const },
    ta: { width: "100%", background: "#1B1815", border: "1px solid #2E2A24", borderRadius: "6px", color: "#F4EFE3", fontSize: "0.96rem", padding: "1.1rem", resize: "none" as const, outline: "none", fontFamily: '"Inter", sans-serif', lineHeight: "1.72", boxSizing: "border-box" as const },
    btn: { background: LIME, color: "#0F0D0B", border: "none", borderRadius: "6px", padding: "0.82rem 1.9rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2.5px", cursor: "pointer", fontFamily: '"Inter", sans-serif', textTransform: "uppercase" as const },
    ghost: { background: "transparent", color: "#B8AFA0", border: "1px solid #2E2A24", borderRadius: "6px", padding: "0.55rem 1rem", fontSize: "11px", cursor: "pointer", fontFamily: '"IBM Plex Mono", monospace', transition: "all .15s" },
    err: { color: "#F4EFE3", fontSize: "0.72rem", marginTop: "0.75rem", background: "rgba(92, 32, 38, 0.12)", border: "1px solid #5C2026", borderRadius: "6px", padding: "0.55rem 0.85rem" },
  };

  return (
    <div style={{ ...G.app, position: "relative", overflowX: "hidden" }}>
      {/* Google-Gemini style flowing background ambient mesh orbs */}
      <div style={{ position: "fixed", top: "-15%", right: "-15%", width: "70vw", height: "70vh", background: "radial-gradient(circle, rgba(200, 162, 78, 0.05) 0%, rgba(0,0,0,0) 70%)", filter: "blur(90px)", zIndex: 0, pointerEvents: "none", animation: "orbFlow 20s infinite ease-in-out" }} />
      <div style={{ position: "fixed", bottom: "-10%", left: "-20%", width: "80vw", height: "80vh", background: "radial-gradient(circle, rgba(22, 60, 46, 0.04) 0%, rgba(0,0,0,0) 75%)", filter: "blur(110px)", zIndex: 0, pointerEvents: "none", animation: "orbFlowReverse 25s infinite ease-in-out" }} />

      <style>{`
        @keyframes pulse{0%,100%{opacity:.1}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glowPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}50%{box-shadow:0 0 12px 2px rgba(200, 162, 78, 0.04)}}
        @keyframes orbFlow{0%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,-30px) scale(1.15)}100%{transform:translate(0,0) scale(1)}}
        @keyframes orbFlowReverse{0%{transform:translate(0,0) scale(1)}50%{transform:translate(-30px,40px) scale(1.1)}100%{transform:translate(0,0) scale(1)}}
        textarea:focus{border-color:${LIME}!important; outline: none!important; box-shadow: 0 0 12px rgba(200, 162, 78, 0.25)!important;}
        input:focus{border-color:${LIME}!important; outline: none!important; box-shadow: 0 0 12px rgba(200, 162, 78, 0.25)!important;}
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

      {intel && <IntelPanel idea={idea} profile={profile} onClose={() => setIntel(false)} initialQuery={intelQuery} onQueryHandled={() => setIntelQuery(null)} appLanguage={appLanguage} />}
      {company && <CompanyBuilder idea={idea} qaCtx={ctxStr(qa)} profile={profile} onClose={() => setCompany(false)} appLanguage={appLanguage} />}
      {showProfile && <ProfilePanel profile={profile} user={user} onUpdate={p => setProfile(p)} onLogout={logout} onClose={() => setShowProfile(false)} onOpenFeedback={() => setShowFeedbackModal(true)} onUpgrade={() => { setShowProfile(false); setGuestAuthOpen(true); }} />}
      {showHistory && <HistoryPanel uid={user?.uid} onLoad={loadIdea} onClose={() => setShowHistory(false)} />}

      {showFeedbackModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(5px)", zIndex: 100005, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.2rem" }}>
          <div style={{ width: "100%", maxWidth: "420px", background: "#080808", border: `1px solid rgba(200, 255, 0, 0.25)`, borderRadius: "8px", padding: "1.8rem 1.6rem", display: "flex", flexDirection: "column", gap: "1.2rem", boxShadow: "0 20px 45px rgba(0,0,0,0.9)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ color: LIME, fontSize: "9px", fontWeight: "900", letterSpacing: "2.5px", fontFamily: "monospace" }}>FEEDBACK</span>
                <h3 style={{ color: "#ffffff", fontSize: "1.05rem", margin: "2px 0 0", fontFamily: "Inter, sans-serif", fontWeight: "700" }}>Help us refine FORGE</h3>
              </div>
              <button onClick={() => setShowFeedbackModal(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "1.1rem", cursor: "pointer" }}>✕</button>
            </div>

            {!feedbackState.helpful ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "0.5rem 0" }}>
                <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.85rem", lineHeight: "1.5", margin: 0, fontFamily: "Inter, sans-serif" }}>
                  Did FORGE help you evaluate or stress-test your startup concept?
                </p>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button 
                    onClick={() => setFeedbackState(prev => ({ ...prev, helpful: "yes" }))}
                    style={{
                      flex: 1,
                      background: "rgba(200,255,0,0.06)",
                      border: `1px solid ${LIME}`,
                      color: LIME,
                      padding: "0.75rem",
                      fontSize: "0.82rem",
                      fontFamily: "Inter, sans-serif",
                      fontWeight: "bold",
                      borderRadius: "6px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.40rem",
                      transition: "all 0.15s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(200,255,0,0.12)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(200,255,0,0.06)"}
                  >
                    👍 YES
                  </button>
                  <button 
                    onClick={() => setFeedbackState(prev => ({ ...prev, helpful: "no" }))}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "rgba(255,255,255,0.7)",
                      padding: "0.75rem",
                      fontSize: "0.82rem",
                      fontFamily: "Inter, sans-serif",
                      fontWeight: "bold",
                      borderRadius: "6px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.40rem",
                      transition: "all 0.15s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  >
                    👎 NO
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", color: LIME, fontSize: "0.68rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "0.4rem", fontWeight: "bold" }}>
                    {feedbackState.helpful === "yes" ? "WHAT HELPED MOST?" : "WHAT FRUSTRATED YOU?"}
                  </label>
                  <textarea
                    value={feedbackState.text}
                    onChange={e => setFeedbackState(prev => ({ ...prev, text: e.target.value }))}
                    placeholder={feedbackState.helpful === "yes" ? "What was the most useful advice or feature? Keep it short." : "What made it complex or annoying? Let us know."}
                    style={{
                      width: "100%",
                      height: "100px",
                      background: "#050505",
                      border: "1px solid #1c1c1c",
                      borderRadius: "5px",
                      color: "#ffffff",
                      padding: "0.6rem 0.8rem",
                      fontSize: "0.78rem",
                      fontFamily: "Inter, sans-serif",
                      lineHeight: "1.4",
                      boxSizing: "border-box",
                      resize: "none",
                      outline: "none"
                    }}
                    autoFocus
                  />
                </div>

                {feedbackSuccess ? (
                  <div style={{ background: "rgba(200, 255, 0, 0.08)", border: `1px solid ${LIME}`, borderRadius: "4px", padding: "0.6rem 0.8rem", color: LIME, fontSize: "10px", fontFamily: "monospace", textAlign: "center", fontWeight: "bold" }}>
                    ✓ FEEDBACK ARCHIVED
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button 
                      onClick={() => setFeedbackState(prev => ({ ...prev, helpful: "" }))}
                      style={{
                        padding: "0.6rem 1rem",
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.4)",
                        borderRadius: "5px",
                        fontSize: "0.75rem",
                        cursor: "pointer"
                      }}
                    >
                      ← BACK
                    </button>
                    <button
                      onClick={submitFeedback}
                      disabled={feedbackLoading}
                      style={{
                        flex: 1,
                        background: LIME,
                        color: "#000",
                        border: "none",
                        borderRadius: "5px",
                        padding: "0.65rem 0",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        fontWeight: "900",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      {feedbackLoading ? "TRANSMITTING..." : "SUBMIT FEEDBACK"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Clickable link for Data & AI Operations inside the feedback modal */}
            <div style={{ textAlign: "center", marginTop: "1rem", borderTop: "1px solid #141414", paddingTop: "0.8rem" }}>
              <button 
                onClick={() => {
                  setShowFeedbackModal(false);
                  setShowPrivacyDialog(true);
                }} 
                style={{ 
                  background: "transparent", 
                  border: "none", 
                  color: "rgba(255,255,255,0.35)", 
                  fontSize: "9px", 
                  fontFamily: "monospace", 
                  textDecoration: "underline", 
                  cursor: "pointer",
                  transition: "color 0.15s"
                }}
                onMouseEnter={e => e.currentTarget.style.color = LIME}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}
              >
                Data & AI Operations
              </button>
            </div>
          </div>
        </div>
      )}



      {showAuthGateway && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)", zIndex: 99991, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)", padding: "1.5rem", fontFamily: "Inter, sans-serif" }}>
          <div style={{ width: "100%", maxWidth: "460px", background: "#1B1815", border: "1px solid #2E2A24", borderRadius: "10px", padding: "2.2rem 2rem", position: "relative", boxShadow: "0 20px 50px rgba(0,0,0,0.8)" }}>
            <button 
              onClick={() => setShowAuthGateway(false)} 
              style={{ 
                position: "absolute", top: "1.5rem", right: "1.5rem", 
                background: "rgba(244, 239, 227, 0.04)", border: "1px solid #2E2A24", 
                color: "#F4EFE3", borderRadius: "50%", width: "28px", height: "28px", 
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", 
                fontSize: "12px", transition: "all 0.15s" 
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = LIME; e.currentTarget.style.color = LIME; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#2E2A24"; e.currentTarget.style.color = "#F4EFE3"; }}
            >
              ✕
            </button>
            <span style={{ color: PURPLE, fontSize: "9px", textTransform: "uppercase", letterSpacing: "3px", fontWeight: "bold", display: "block", marginBottom: "0.5rem", fontFamily: "monospace" }}>⚡️ SECURE CRYPTOGRAPHIC CLOUD VAULT</span>
            <h2 style={{ color: "#F4EFE3", fontSize: "1.42rem", fontWeight: "900", margin: "0 0 0.8rem", letterSpacing: "0.5px", lineHeight: "1.3" }}>Activate Zero-Trust Startup Vault</h2>
            <p style={{ color: "rgba(244,239,227,0.7)", fontSize: "0.82rem", lineHeight: "1.6", margin: "0 0 1.8rem" }}>
              Unlock the complete <strong style={{ color: LIME }}>Co-founding Agility Suite</strong> (War Room, Pitch Deck, and COGS Runway), seamlessly synchronize your data securely to Supabase, and safeguard your startup formulas client-side inside an encrypted personal vault.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button 
                onClick={() => setGuestAuthOpen(true)}
                style={{ 
                  background: LIME, color: "#1B1815", border: "none", borderRadius: "6px", 
                  padding: "0.9rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2px", 
                  cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", 
                  boxShadow: "0 4px 20px rgba(200, 255, 0, 0.2)" 
                }}
              >
                Create Secure Free Account NOW →
              </button>
              <button 
                onClick={() => setShowAuthGateway(false)}
                style={{ 
                  background: "transparent", border: "1px solid #2E2A24", color: "rgba(244,239,227,0.6)", 
                  borderRadius: "6px", padding: "0.80rem", fontSize: "10px", fontWeight: "bold", 
                  cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", transition: "all 0.15s" 
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "#F4EFE3"; e.currentTarget.style.borderColor = "rgba(244, 239, 227, 0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(244,239,227,0.6)"; e.currentTarget.style.borderColor = "#2E2A24"; }}
              >
                I Decline — Keep Exploring guest mode
              </button>
            </div>
          </div>
        </div>
      )}

      {guestAuthOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "#0F0D0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: "2rem", right: "2rem", zIndex: 100001 }}>
            <button 
              onClick={() => setGuestAuthOpen(false)}
              style={{ background: "rgba(92, 32, 38, 0.15)", border: "1px solid #5C2026", color: "#F4EFE3", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: "0.8rem", fontWeight: "bold" }}
            >
              ✕ Close & Explore Sandbox
            </button>
          </div>
          <AuthScreen onAuth={handleGuestAuth} />
        </div>
      )}

      {showPitchDeck && (
        <div className="fixed inset-0 bg-[#0F0D0B]/90 backdrop-blur-sm z-[9999] overflow-y-auto p-3 sm:p-6 md:p-8 box-border">
          <div className="w-full max-w-[1200px] mx-auto p-3 sm:p-5" style={{ background: "#1B1815", border: "1px solid #2E2A24", borderRadius: "8px" }}>
            <PitchDeck idea={idea} profile={profile} blueprintData={(outputs as any).blueprint} businessPlanData={(outputs as any).businessplan} onClose={() => setShowPitchDeck(false)} />
          </div>
        </div>
      )}

      <div style={{ ...G.wrap, paddingRight: intel ? "440px" : "0" }}>
        
        {/* GLOBAL SECURITY / OFFLINE ERROR BANNER */}
        {globalError && (
          <div style={{ width: "100%", background: "rgba(92, 32, 38, 0.15)", border: "1px solid #5C2026", borderRadius: "6px", padding: "0.85rem 1.2rem", marginTop: "1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeIn 0.3s ease" }}>
            <span style={{ color: "#F4EFE3", fontSize: "0.78rem", fontFamily: "sans-serif" }}>
              ⚠️ {globalError}
            </span>
            <button onClick={() => setGlobalError("")} style={{ background: "transparent", border: "none", color: "#F4EFE3", opacity: 0.6, cursor: "pointer", fontSize: "12px", marginLeft: "10px" }}>✕</button>
          </div>
        )}

        {/* HEADER */}
        {!isFocusMode && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.7rem 0 1.3rem", borderBottom: "1px solid #1c1c1c", marginBottom: "1.8rem" }}>
          
          {/* Top left: Small FORGE logo only - clickable to restart */}
          <div 
            style={{ display: "flex", alignItems: "center", cursor: "pointer", transition: "transform 0.1s ease" }} 
            onClick={resetIdea}
            title="Go to Home / Anza Upya"
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)" }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)" }}
          >
            <div style={{ 
              width: "36px",
              height: "36px", 
              borderRadius: "50%", 
              background: "radial-gradient(circle, #2a220f 0%, #080705 100%)", 
              border: "1.5px solid #D4AF37", 
              boxShadow: "0 0 18px rgba(212, 175, 55, 0.35), inset 0 0 8px rgba(212, 175, 55, 0.2)", 
              padding: "2px",
            }}>
              <img 
                src={forgeLogo} 
                alt="FORGE Logo" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="43" stroke="%23D4AF37" stroke-width="4"/><path d="M50 20 L27 40 L37 40 L30 75 L50 55 L70 75 L63 40 L73 40 Z" fill="%23C8FF00" filter="drop-shadow(0 0 5px %23C8FF00)"/></svg>`;
                }}
                style={{ 
                  width: "100%", 
                  height: "100%", 
                  borderRadius: "50%", 
                  objectFit: "cover" 
                }} 
              />
            </div>
          </div>

          {/* Top right: Icons only */}
          <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
            {/* Language Selector Dropdown */}
            <div ref={langSelectorRef} style={{ position: "relative" }}>
              <button 
                className="gh" 
                style={{ ...G.ghost, padding: "0.55rem", border: "none", color: appLanguage !== "en" ? LIME : "rgba(255,255,255,0.7)" }} 
                onClick={() => setShowLangSelector(!showLangSelector)}
                title="Select Language / Chagua Lugha"
              >
                <Globe size={18} />
              </button>
              {showLangSelector && (
                <div style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: "0.5rem",
                  background: "#0d0d0d",
                  border: `1.5px solid ${GOLD}`,
                  borderRadius: "6px",
                  padding: "0.5rem",
                  zIndex: 5000,
                  minWidth: "240px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.9)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem"
                }}>
                  <div style={{ padding: "0.2rem 0.4rem", fontSize: "0.62rem", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", textTransform: "uppercase" }}>
                    Select Language / Chagua Lugha
                  </div>
                  
                  {/* Real-time search filter */}
                  <input
                    type="text"
                    value={langSearchQuery}
                    onChange={(e) => setLangSearchQuery(e.target.value)}
                    placeholder="Search / Tafuta (e.g. Swahili, Spanish, French)..."
                    style={{
                      background: "#161616",
                      border: "1px solid #2a2a2a",
                      color: "#ffffff",
                      fontSize: "0.75rem",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "4px",
                      outline: "none",
                      width: "100%",
                      fontFamily: "monospace",
                      marginBottom: "0.25rem"
                    }}
                    autoFocus
                  />
                  
                  {/* Container for scrollable listing of 90+ global languages */}
                  <div style={{
                    maxHeight: "220px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    paddingRight: "2px"
                  }}>
                    {LANGUAGES_LIST.filter(l => 
                      l.name.toLowerCase().includes(langSearchQuery.toLowerCase()) ||
                      l.native.toLowerCase().includes(langSearchQuery.toLowerCase()) ||
                      l.code.toLowerCase().includes(langSearchQuery.toLowerCase())
                    ).map(langOption => {
                      const isSelected = appLanguage === langOption.code;
                      return (
                        <button
                          key={langOption.code}
                          onClick={() => {
                            handleLanguageChange(langOption.code);
                            setShowLangSelector(false);
                            setLangSearchQuery("");
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            background: isSelected ? "rgba(200, 162, 78, 0.15)" : "transparent",
                            color: isSelected ? GOLD : "#ffffff",
                            border: "none",
                            padding: "0.5rem 0.6rem",
                            fontSize: "0.78rem",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontFamily: "sans-serif",
                            transition: "all 0.15s",
                            fontWeight: isSelected ? "bold" : "normal"
                          }}
                        >
                          {langOption.name} {isSelected && " ✓"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {showTools && <>
              <button className="gh" onClick={() => { setIntel(!intel); setCompany(false); }} style={{ ...G.ghost, color: intel ? LIME : "rgba(255,255,255,0.5)", borderColor: intel ? LIME : "#1c1c1c", padding: "0.55rem" }}>
                <Zap size={16} />
              </button>
              <button className="gh" onClick={() => { setCompany(true); setIntel(false); }} style={{ ...G.ghost, color: company ? LIME : "#ffffff", borderColor: company ? LIME : "#1c1c1c", padding: "0.55rem" }}>
                <Hammer size={16} />
              </button>
            </>}
            <button className="gh" style={{ ...G.ghost, padding: "0.55rem", border: "none" }} onClick={() => setShowHistory(true)}>
              <Archive size={18} />
            </button>
            <button className="gh" style={{ ...G.ghost, padding: "0.55rem", border: "none" }} onClick={() => setShowProfile(true)}>
              <User size={18} />
            </button>
            {phase !== "ignition" && <button className="gh" style={{ ...G.ghost, padding: "0.55rem" }} onClick={resetIdea}>↩</button>}
          </div>
        </div>
        )}

        {/* IGNITION */}
        {phase === "ignition" && (
          <div style={{ animation: "fadeIn .4s ease" }}>
            <p style={G.label}>Drop your raw idea</p>
            <textarea style={{ ...G.ta, height: "150px" }} placeholder={"No polish needed. Half-baked is fine.\nRaw and messy is where the best ideas live."} value={idea} onChange={e => setIdea(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loading) ignite(); }} />
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.9rem" }}>
              <button style={{ ...G.btn, opacity: (!idea.trim() || loading) ? 0.25 : 1 }} onClick={ignite} disabled={!idea.trim() || loading}>{loading ? "LOADING…" : "IGNITE →"}</button>
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
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", letterSpacing: "1px", marginBottom: "2rem", fontFamily: "monospace" }}>{qa.length}/{Q_TARGET} {t("steps_completed", appLanguage)}</div>
            {loading ? (
              <div style={{ padding: "2.5rem 0" }}><span style={{ color: PURPLE, fontSize: "0.75rem", letterSpacing: "2.5px", fontFamily: "monospace", fontWeight: "bold" }}>{appLanguage === "sw" ? "INAFIKIRI" : appLanguage === "es" ? "PENSANDO" : "THINKING"}</span>{[0, 1, 2, 3].map(i => <span key={i} style={{ color: PURPLE, animation: `pulse 1.5s ease ${i * .25}s infinite` }}>.</span>)}</div>
            ) : (() => {
              const lines = (curQ || "").split("\n").map(l => l.trim()).filter(Boolean);
              let subtitle = `${appLanguage === "sw" ? "SURA YA UKWELI" : "STRESS TEST"} ${qa.length + 1}`;
              let body = curQ;
              if (lines.length >= 2 && lines[0].startsWith("**") && lines[0].endsWith("**")) {
                subtitle = lines[0].replace(/\*\*/g, "");
                body = lines.slice(1).join("\n");
              } else if (lines.length >= 1 && lines[0].startsWith("**") && lines[0].endsWith("**")) {
                subtitle = lines[0].replace(/\*\*/g, "");
                body = lines.slice(1).join("\n") || lines[0].replace(/\*\*/g, "");
              }
              return (
                <>
                  <div style={{ marginBottom: "1.9rem" }}>
                    <div style={{ color: LIME, fontSize: "0.72rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "0.5rem", fontWeight: "900" }}>
                      {subtitle}
                    </div>
                    <p style={{ color: "#ffffff", fontSize: "1.15rem", lineHeight: "1.52", margin: 0, fontFamily: "Inter, sans-serif", fontWeight: "600", letterSpacing: "-0.01em" }}>
                      {body}
                    </p>
                  </div>
                  <p style={G.label}>{appLanguage === "sw" ? "Jibu Lako" : appLanguage === "es" ? "Tu respuesta" : "Your Answer"}</p>
                  <textarea ref={taRef} style={{ ...G.ta, height: "105px" }} placeholder={t("honest_placeholder", appLanguage)} value={curA} onChange={e => { setCurA(e.target.value); if (e.target.value.length === 4) prefetchNext([...qa, { question: curQ, answer: e.target.value }]); }} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && curA.trim() && !loading) next(); }} autoFocus />
                  <div style={{ display: "flex", gap: "0.7rem", marginTop: "0.85rem", alignItems: "center" }}>
                    {qa.length > 0 && <button className="gh" style={G.ghost} onClick={backQ}>← {t("back", appLanguage)}</button>}
                    <button style={{ ...G.btn, opacity: !curA.trim() ? 0.2 : 1 }} onClick={next} disabled={!curA.trim() || loading}>{qa.length + 1 === Q_TARGET ? (appLanguage === "sw" ? "MALIZA →" : "FINISH →") : t("next", appLanguage)}</button>
                    {qa.length >= 3 && <button className="gh" style={G.ghost} onClick={() => { scoreIdea(qa); setPhase("reality-check"); }}>{appLanguage === "sw" ? "ruka →" : "skip →"}</button>}
                  </div>
                  {err && <div style={G.err}>{err}</div>}
                </>
              );
            })()}
          </div>
        )}

        {/* REALITY CHECK */}
        {phase === "reality-check" && (
          <RealityCheck idea={idea} qa={qa} profile={profile}
            onProceed={() => setPhase("output-select")}
            onBack={backQ} appLanguage={appLanguage} />
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
                {ideaScore.searchValidation && (
                  <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed rgba(200,255,0,0.2)", display: "flex", flexDirection: "column" }}>
                     <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.75rem" }}>
                       <div style={{ width: "42px", height: "42px", borderRadius: "4px", background: "rgba(200,255,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: LIME, fontWeight: "900", fontSize: "1rem" }}>{ideaScore.searchValidation.percentage}%</div>
                       <div>
                         <div style={{ color: LIME, fontSize: "10px", letterSpacing: "1px", fontWeight: "bold" }}>WEB SEARCH VALIDATION</div>
                         <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.7rem", marginTop: "2px" }}>Grounded in live global data analysis</div>
                       </div>
                     </div>
                     <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "rgba(255,255,255,0.85)", fontSize: "0.8rem", lineHeight: "1.4" }}>
                       {(ideaScore.searchValidation.findings || []).map((f, i) => (
                         <li key={i} style={{ marginBottom: "0.4rem" }}>{f}</li>
                       ))}
                     </ul>
                  </div>
                )}
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

            {/* ADVANCED VENTURE DELIVERABLES */}
            <p style={{ ...G.label, marginTop: "1.85rem" }}>Advanced Venture Deliverables</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.78rem", marginBottom: "1.5rem" }}>
              
              {/* Pitch Deck */}
              <div 
                className="outcard" 
                style={{ background: "#1B1815", border: "1px solid #2E2A24", borderRadius: "6px", padding: "1.05rem", cursor: "pointer", transition: "all .18s", position: "relative" }}
                onClick={() => setShowPitchDeck(true)}
              >
                <div style={{ fontSize: "1.25rem", marginBottom: "0.42rem" }}>🎨</div>
                <div style={{ color: "#F4EFE3", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.22rem", fontFamily: '"Fraunces", serif' }}>Pitch Deck Simulator</div>
                <div style={{ color: "#B8AFA0", fontSize: "0.68rem", lineHeight: "1.4", fontFamily: '"Inter", sans-serif' }}>Generate 8 live-interactive modular pitch slides</div>
              </div>

              {/* Company Builder */}
              <div 
                className="outcard" 
                style={{ background: "#1B1815", border: "1px solid #2E2A24", borderRadius: "6px", padding: "1.05rem", cursor: "pointer", transition: "all .18s", position: "relative" }}
                onClick={() => setCompany(true)}
              >
                <div style={{ fontSize: "1.25rem", marginBottom: "0.42rem" }}>🏗️</div>
                <div style={{ color: "#F4EFE3", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "0.22rem", fontFamily: '"Fraunces", serif' }}>Company Builder</div>
                <div style={{ color: "#B8AFA0", fontSize: "0.68rem", lineHeight: "1.4", fontFamily: '"Inter", sans-serif' }}>Systems, workflows & organizational models</div>
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

            {/* EXPERIENCE LOG / FEEDBACK BANNER */}
            {!bannerDismissed && (
              <div style={{ background: "rgba(200, 255, 0, 0.04)", border: "1px dashed rgba(200, 255, 0, 0.25)", borderRadius: "6px", padding: "1.1rem 1.3rem", marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1.1rem", position: "relative" }}>
                <div style={{ display: "flex", gap: "0.7rem", alignItems: "center" }}>
                  <span style={{ fontSize: "1.3rem" }}>✨</span>
                  <div>
                    <div style={{ color: LIME, fontSize: "9px", fontWeight: "900", fontFamily: "monospace", letterSpacing: "1.5px" }}>FOUNDER EXPERIENCE LOG</div>
                    <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.72rem", fontFamily: "monospace", marginTop: "2px", lineHeight: "1.4" }}>
                      Your feedback shapes the Forge. Share any feature ideas, friction points, or praise with us.
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                  <button onClick={() => setShowFeedbackModal(true)} style={{ background: LIME, color: "#000", border: "none", borderRadius: "4px", padding: "5px 12px", fontSize: "9px", fontWeight: "900", fontFamily: "monospace", cursor: "pointer" }}>
                    GIVE FEEDBACK
                  </button>
                  <button onClick={handleDismissBanner} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "11px", fontWeight: "bold", cursor: "pointer", padding: "4px 8px" }} title="Dismiss banner">
                    ✕
                  </button>
                </div>
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
              <span style={{ color: LIME, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", fontFamily: "monospace", fontWeight: "bold" }}>{OUTPUTS.find(o => o.key === outType)?.icon} {t(`${outType}_label`, appLanguage) || OUTPUTS.find(o => o.key === outType)?.label}</span>
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <button className="gh" style={{ ...G.ghost, color: copyFeedback ? LIME : "rgba(255,255,255,0.5)", borderColor: copyFeedback ? LIME : "#1c1c1c" }} onClick={handleCopyRaw}>
                  {copyFeedback ? (appLanguage === "sw" ? "✓ Imenakili!" : appLanguage === "es" ? "✓ ¡Copiado!" : appLanguage === "fr" ? "✓ Copié !" : appLanguage === "de" ? "✓ Kopiert!" : appLanguage === "ar" ? "✓ تم النسخ!" : "✓ Copied!") : (appLanguage === "sw" ? "📋 Nakili Faili" : appLanguage === "es" ? "📋 Copiar Texto" : appLanguage === "fr" ? "📋 Copier brut" : appLanguage === "de" ? "📋 Text kopieren" : appLanguage === "ar" ? "📋 نسخ النص" : "📋 Copy Raw")}
                </button>
                <button className="gh" style={G.ghost} onClick={handleExportFile}>
                  {appLanguage === "sw" ? "📥 Hifadhi (.md)" : appLanguage === "es" ? "📥 Guardar (.md)" : appLanguage === "fr" ? "📥 Sauvegarder (.md)" : appLanguage === "de" ? "📥 Speichern (.md)" : appLanguage === "ar" ? "📥 حفظ (.md)" : "📥 Save (.md)"}
                </button>
                <button className="gh" style={{ ...G.ghost, color: GOLD, borderColor: `${GOLD}40` }} onClick={handleExportPDF}>
                  {appLanguage === "sw" ? "📄 Hamisha PDF" : appLanguage === "es" ? "📄 Exportar PDF" : appLanguage === "fr" ? "📄 Exporter PDF" : appLanguage === "de" ? "📄 PDF exportieren" : appLanguage === "ar" ? "📄 تصدير PDF" : "📄 Export PDF"}
                </button>
                <button className="gh" style={G.ghost} onClick={async () => { setOutputs(p => { const n = { ...p }; delete n[outType]; return n; }); await generate(outType, true); }}>
                  {appLanguage === "sw" ? "↻ Zaa Tena" : appLanguage === "es" ? "↻ Regenerar" : appLanguage === "fr" ? "↻ Régénérer" : appLanguage === "de" ? "↻ Regenerieren" : appLanguage === "ar" ? "↻ إعادة توليد" : "↻ Regen"}
                </button>
                <button className="gh" style={G.ghost} onClick={() => setPhase("output-select")}>
                  {appLanguage === "sw" ? "← Bidhaa Zote" : appLanguage === "es" ? "← Todo" : appLanguage === "fr" ? "← Tous les produits" : appLanguage === "de" ? "← Alle Produkte" : appLanguage === "ar" ? "← جميع المنتجات" : "← All Products"}
                </button>
                <button className="gh" style={G.ghost} onClick={resetIdea}>
                  {appLanguage === "sw" ? "Wazo Jipya" : appLanguage === "es" ? "Nueva Idea" : appLanguage === "fr" ? "Nouvelle Idée" : appLanguage === "de" ? "Neue Idee" : appLanguage === "ar" ? "فكرة جديدة" : "New Idea"}
                </button>
              </div>
            </div>
            <ErrorBoundary>
              <div id="forge-pdf-export-root" style={{ background: "#1B1815", border: "1px solid #2E2A24", borderRadius: "6px", padding: (outType === "mindmap" || outType === "promptpack") ? "0" : "1.8rem" }}>
                {outType === "mindmap" && <MindMap data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "blueprint" && <Blueprint data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "roadmap" && <Roadmap data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "businessplan" && <BusinessPlan data={outputs[outType]} />}
                {outType === "actionplan" && <ActionPlan data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "swot" && <SWOT data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} />}
                {outType === "promptpack" && <div style={{ padding: "1.8rem" }}><PromptPack data={outputs[outType]} onDeepDive={triggerDeepDiveIntel} /></div>}
                
                {outType !== "mindmap" && <SignatureSeal />}
              </div>
            </ErrorBoundary>
          </div>
        )}



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
        <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} navigateTo={(tab) => { /* TODO */ }} />

        {/* Floating Bright Colored Back Button (Bottom Right) */}
        {phaseHistory.length > 0 && phase !== "ignition" && (
          <button
            onClick={() => {
              const lastPhase = phaseHistory[phaseHistory.length - 1];
              setPhase(lastPhase);
            }}
            style={{
              position: "fixed",
              bottom: "1.85rem",
              right: "1.85rem",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: LIME,
              color: "#0c0d0b",
              border: "none",
              borderRadius: "50px",
              padding: "0.65rem 1.1rem",
              fontSize: "11px",
              fontWeight: "900",
              letterSpacing: "1.5px",
              cursor: "pointer",
              fontFamily: "monospace",
              boxShadow: "0 0 20px rgba(200, 255, 0, 0.45), 0 4px 10px rgba(0,0,0,0.5)",
              transition: "transform 0.1s ease, filter 0.15s ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "scale(1.08)";
              e.currentTarget.style.filter = "brightness(1.1)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.filter = "brightness(1)";
            }}
            title="Go Back / Rudi Nyuma"
          >
            <ArrowLeft size={16} strokeWidth={2.8} style={{ color: "#0c0d0b" }} />
            <span>{appLanguage === "sw" ? "NYUMA" : appLanguage === "es" ? "VOLVER" : appLanguage === "fr" ? "RETOUR" : appLanguage === "de" ? "ZURÜCK" : appLanguage === "ar" ? "رجوع" : "BACK"}</span>
          </button>
        )}

        {/* Google Translate Hidden Element */}
        <div id="google_translate_element" style={{ display: "none" }} />

        <div style={{ height: "5rem" }} />
      </div>
    </div>
  );
}
