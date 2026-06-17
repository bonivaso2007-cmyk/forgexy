import React, { useState } from "react";
import { store } from "../lib/vault";

const LIME = "#C8FF00";
const PURPLE = "#B87FFF";

export default function Onboarding({ user, onDone }) {
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
