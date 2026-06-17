import React, { useState } from "react";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth as firebaseAuth, googleProvider } from "../lib/firebase";
import { store, hashPasswordSHA256, initializeEncryption } from "../lib/vault";
import forgeLogo from "../assets/images/forge_logo_1781634347253.jpg";

const LIME = "#C8FF00";
const PINK = "#FF3C78";

export default function AuthScreen({ onAuth }) {
  const [authType, setAuthType] = useState<"cloud" | "local">("cloud");
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleGoogleSignIn = async () => {
    setErr("");
    setLoading(true);
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      const userObj = result.user;
      const sessionUser = {
        uid: userObj.uid,
        email: userObj.email || "",
        name: userObj.displayName || userObj.email?.split("@")[0] || "Founding Member",
        isFirebaseUser: true,
      };
      await store.set("session", sessionUser);
      onAuth(sessionUser, false);
    } catch (e: any) {
      if (e.code === "auth/popup-closed-by-user") {
        setErr("Google login popup was closed.");
      } else {
        setErr(`Google authorization failed: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCloudEmailAuth = async () => {
    setErr("");
    setLoading(true);
    const { email, password, name } = form;
    if (!email.trim() || !password.trim()) {
      setErr("Please fill in email and password.");
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signup") {
        if (!name.trim()) {
          setErr("Please enter your name.");
          setLoading(false);
          return;
        }
        const result = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
        await updateProfile(result.user, { displayName: name.trim() });
        const sessionUser = {
          uid: result.user.uid,
          email: result.user.email || "",
          name: name.trim(),
          isFirebaseUser: true,
        };
        await store.set("session", sessionUser);
        onAuth(sessionUser, true);
      } else {
        const result = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
        const sessionUser = {
          uid: result.user.uid,
          email: result.user.email || "",
          name: result.user.displayName || result.user.email?.split("@")[0] || "Founding Member",
          isFirebaseUser: true,
        };
        await store.set("session", sessionUser);
        onAuth(sessionUser, false);
      }
    } catch (e: any) {
      if (e.code === "auth/user-not-found" || e.code === "auth/wrong-password" || e.code === "auth/invalid-credential" || e.code === "auth/invalid-email") {
        setErr("Invalid email or password. Verify your credentials, or choose 'signup' to register.");
      } else if (e.code === "auth/email-already-in-use") {
        setErr("Email already registered. Please log in instead.");
      } else {
        setErr(`Cloud Authorization failed: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLocalCryptAuth = async () => {
    setErr("");
    setLoading(true);
    const { email, password, name } = form;
    if (!email.trim() || !password.trim()) {
      setErr("Fill in all fields for local credentials.");
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
          setErr("Account already exists locally. Log in instead.");
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
        if (!user) {
          setErr("Invalid email or password.");
          setLoading(false);
          return;
        }

        const shaHash = await hashPasswordSHA256(password);
        const legacyHash = btoa(password);

        const isValid = user.passwordHash === shaHash || user.passwordHash === legacyHash;
        if (!isValid) {
          setErr("Invalid email or password.");
          setLoading(false);
          return;
        }

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

  const submit = () => {
    if (authType === "cloud") {
      handleCloudEmailAuth();
    } else {
      handleLocalCryptAuth();
    }
  };

  const inp = {
    width: "100%",
    background: "#090909",
    border: "1px solid #181818",
    borderRadius: "6px",
    color: "#ffffff",
    fontSize: "0.85rem",
    padding: "0.85rem 1rem",
    outline: "none",
    fontFamily: "monospace",
    boxSizing: "border-box" as const
  };

  return (
    <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "monospace" }}>
      <div style={{ width: "100%", maxWidth: "420px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.45em", color: "rgba(255,255,255,0.4)", marginBottom: "1.2rem", display: "block", textAlign: "center" }}>Project Specification 2026</span>

        {/* PREMIUM ROYAL LOGO CENTERPIECE */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "90px",
          height: "90px",
          borderRadius: "50%",
          background: "radial-gradient(circle, #2a220f 0%, #080705 100%)",
          border: "2px solid #D4AF37",
          boxShadow: "0 0 28px rgba(212, 175, 55, 0.4), inset 0 0 12px rgba(212, 175, 55, 0.25)",
          padding: "5px",
          marginBottom: "1rem",
          transition: "transform 0.3s ease",
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

        <h1 style={{ color: LIME, fontSize: "3.2rem", fontWeight: "900", letterSpacing: "7px", margin: "0 0 4px", lineHeight: "1.1", fontFamily: "monospace", textAlign: "center" }}>FORGE</h1>
        <p style={{ color: "#D4AF37", fontSize: "0.62rem", letterSpacing: "3px", margin: "0 0 1.8rem", fontFamily: "monospace", fontWeight: "bold", textAlign: "center" }}>ROYAL IDEA ENGINE FOR FOUNDERS</p>

        {/* SECURE DATABASE TYPE TOGGLES */}
        <div style={{ display: "flex", width: "100%", gap: "0.5rem", marginBottom: "1.2rem" }}>
          <button
            onClick={() => { setAuthType("cloud"); setErr(""); }}
            style={{
              flex: 1,
              background: authType === "cloud" ? "rgba(200,255,0,0.06)" : "transparent",
              border: `1px solid ${authType === "cloud" ? LIME : "#1c1c1c"}`,
              borderRadius: "6px",
              padding: "0.62rem",
              color: authType === "cloud" ? LIME : "rgba(255,255,255,0.4)",
              fontSize: "9px",
              letterSpacing: "1px",
              fontWeight: "900",
              fontFamily: "monospace",
              cursor: "pointer"
            }}
          >
            ☁️ CLOUD ACC SYNC
          </button>
          <button
            onClick={() => { setAuthType("local"); setErr(""); }}
            style={{
              flex: 1,
              background: authType === "local" ? "rgba(200,255,0,0.06)" : "transparent",
              border: `1px solid ${authType === "local" ? LIME : "#1c1c1c"}`,
              borderRadius: "6px",
              padding: "0.62rem",
              color: authType === "local" ? LIME : "rgba(255,255,255,0.4)",
              fontSize: "9px",
              letterSpacing: "1px",
              fontWeight: "900",
              fontFamily: "monospace",
              cursor: "pointer"
            }}
          >
            🔑 LOCAL CRYPT VAULT
          </button>
        </div>

        {/* CLOUD SERVICES GOOGLE LOGIN INBOUND SECTION */}
        {authType === "cloud" && (
          <div style={{ width: "100%", marginBottom: "1rem" }}>
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{
                width: "100%",
                background: "#0a0a0a",
                color: "#ffffff",
                border: "1px solid #202020",
                borderRadius: "6px",
                padding: "0.82rem",
                fontSize: "11px",
                fontWeight: "900",
                letterSpacing: "2.5px",
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "monospace",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.65rem",
                boxShadow: "0 4px 15px rgba(0,0,0,0.4)"
              }}
            >
              <svg style={{ width: "16px", height: "16px" }} viewBox="0 0 24 24">
                <path fill="currentColor" d="M12.24 10.285V14.4h6.887c-.275 1.564-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.103 1.025 5.045 1.926l3.227-3.107C18.28 1.845 15.539 1 12.24 1c-5.99 0-10.8 4.81-10.8 10.8s4.81 10.8 10.8 10.8c6.257 0 10.422-4.4 10.422-10.6 0-.715-.077-1.258-.171-1.715H12.24z"/>
              </svg>
              SIGN IN WITH GOOGLE
            </button>
            <div style={{ display: "flex", alignItems: "center", margin: "1rem 0", color: "rgba(255,255,255,0.15)" }}>
              <hr style={{ flex: 1, borderColor: "rgba(255,255,255,0.1)" }} />
              <span style={{ padding: "0 10px", fontSize: "9px", fontFamily: "monospace", textTransform: "uppercase" }}>or email login</span>
              <hr style={{ flex: 1, borderColor: "rgba(255,255,255,0.1)" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", width: "100%", gap: "0", marginBottom: "1.5rem", border: "1px solid #181818", borderRadius: "6px", overflow: "hidden" }}>
          {["login", "signup"].map(m => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, background: mode === m ? LIME : "transparent", color: mode === m ? "#050505" : "rgba(255,255,255,0.4)", border: "none", padding: "0.72rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2px", cursor: "pointer", fontFamily: "monospace", textTransform: "uppercase", transition: "all .2s" }}>{m}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
          {mode === "signup" && <input style={inp} placeholder="Full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />}
          <input style={inp} placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} onKeyDown={e => e.key === "Enter" && submit()} />
          <input style={inp} placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && submit()} />
        </div>

        {err && <div style={{ color: PINK, fontSize: "0.74rem", marginTop: "1rem", background: "rgba(255, 60, 120, 0.08)", border: "1px solid rgba(255, 60, 120, 0.15)", borderRadius: "6px", padding: "0.55rem 0.85rem", width: "100%", boxSizing: "border-box", textAlign: "center" }}>{err}</div>}

        <button onClick={submit} disabled={loading} style={{ width: "100%", background: LIME, color: "#050505", border: "none", borderRadius: "6px", padding: "0.9rem", fontSize: "11px", fontWeight: "900", letterSpacing: "2.5px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace", marginTop: "1.2rem", opacity: loading ? 0.5 : 1 }}>
          {loading ? "…" : mode === "login" ? "LOG IN →" : "CREATE ACCOUNT →"}
        </button>

        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.62rem", textAlign: "center", marginTop: "1.5rem", lineHeight: "1.5" }}>
          {authType === "cloud"
            ? "Cloud accounts protect ideas in standard cloud databases. Free Firebase email or Google authentication provider handles verification safely."
            : "Ideas are locked locally in your browser cache using AES-GCM (PBKDF2 derivative) and never stored back on any servers."
          }
        </p>
      </div>
    </div>
  );
}
