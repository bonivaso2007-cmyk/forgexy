import React, { useState, useRef, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";
import { saveInvestorSim, getInvestorSims, buildMemoryContext } from "../lib/db";

const LIME = "#C8FF00";
const PINK = "#FF3C78";
const PURPLE = "#B87FFF";
const CYAN = "#00FFFF";

type Persona = {
  id: string;
  name: string;
  role: string;
  style: string;
  greeting: string;
};

const PERSONAS: Persona[] = [
  {
    id: "yc_partner",
    name: "Sarah Chen",
    role: "YC Partner",
    style: "Direct, pattern-matches, asks about traction and unit economics. Uses YC vocabulary. Challenges you on 'what's the insight?'",
    greeting: "Hey. I've got 15 minutes. What are you building and why does it matter?"
  },
  {
    id: "angel",
    name: "Marcus Webb",
    role: "Angel Investor",
    style: "Friendly but sharp. Cares about founder-market fit. Asks about your unfair advantage. Wants to know what you know that others don't.",
    greeting: "Nice to meet you. Walk me through what you're building and what got you here."
  },
  {
    id: "vc_analyst",
    name: "Priya Sharma",
    role: "VC Analyst @ Atomic14",
    style: "Data-driven, skeptical of bold claims. Asks about TAM, competitive moats, and go-to-market. Will push on numbers.",
    greeting: "Thanks for taking the time. Let's start with the basics—what's the market size and how do you capture it?"
  },
  {
    id: "corporate_dev",
    name: "David Park",
    role: "Corp Dev @ TechCorp",
    style: "Thinking about acquisition fit. Asks about technology, patents, team. Cares about strategic value and integration.",
    greeting: "We've been looking at this space. Tell me about your technology stack and what makes it defensible."
  }
];

interface InvestorSimProps {
  idea: string;
  profile: any;
  onClose: () => void;
}

export default function InvestorSimulation({ idea, profile, onClose }: InvestorSimProps) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [started, setStarted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: "investor" | "founder"; text: string }[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [pastSims, setPastSims] = useState<any[]>([]);
  const [memories, setMemories] = useState("");

  const typewriterRef = useRef<NodeJS.Timeout | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load past simulations and memory context
  useEffect(() => {
    (async () => {
      const uid = profile?.uid || "guest_user";
      const sims = await getInvestorSims(uid);
      setPastSims(sims);
      const memCtx = await buildMemoryContext(uid);
      setMemories(memCtx);
    })();
  }, [profile]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, displayedText]);

  // Typewriter effect
  const typeText = useCallback((text: string, onComplete?: () => void) => {
    setDisplayedText("");
    setIsTyping(true);
    let i = 0;
    typewriterRef.current = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.slice(0, i + 1));
        i++;
      } else {
        if (typewriterRef.current) clearInterval(typewriterRef.current);
        setIsTyping(false);
        onComplete?.();
      }
    }, 25); // ~40 chars/sec for natural feel
  }, []);

  // Score celebration effect
  useEffect(() => {
    if (score !== null && score >= 80) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [score]);

  const startSimulation = (p: Persona) => {
    setPersona(p);
    setStarted(true);
    setTranscript([{ role: "investor", text: p.greeting }]);
    typeText(p.greeting);
  };

  const sendResponse = async () => {
    if (!currentInput.trim() || loading || !persona) return;

    const userMsg = currentInput.trim();
    setCurrentInput("");
    setTranscript(prev => [...prev, { role: "founder", text: userMsg }]);
    setLoading(true);

    const systemPrompt = `You are ${persona.name}, a ${persona.role} conducting a pitch meeting.

STYLE: ${persona.style}

CONTEXT:
- Founder Idea: "${idea}"
- Founder Profile: ${profile?.name || "Founder"}, ${profile?.stage || "Early stage"}, ${profile?.industry || "Tech"}
- Location: ${profile?.city || "Unknown"}, ${profile?.country || "Unknown"}
${memories}

TRANSCRIPT SO FAR:
${transcript.map(t => `${t.role === "investor" ? "YOU" : "FOUNDER"}: ${t.text}`).join("\n")}

FOUNDER'S LATEST: "${userMsg}"

INSTRUCTIONS:
- Respond as ${persona.name} would—stay in character
- Ask ONE follow-up question OR give feedback (max 80 words)
- Be realistic—real investors test founders
- If this is a strong answer, acknowledge it briefly
- If there's a weakness, probe it
- End with a question or clear statement, never trail off`;

    try {
      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [{ role: "user", content: userMsg }],
          max_tokens: 200
        })
      });

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.trim().startsWith("data:")) {
              const raw = line.slice(5).trim();
              if (raw && raw !== "[DONE]") {
                try {
                  const parsed = JSON.parse(raw);
                  fullText += parsed?.delta?.text || "";
                } catch {}
              }
            }
          }
        }
      }

      const cleanText = DOMPurify.sanitize(fullText, { ALLOWED_TAGS: [] });
      setTranscript(prev => [...prev, { role: "investor", text: cleanText }]);
      typeText(cleanText);
    } catch (e) {
      setTranscript(prev => [...prev, { role: "investor", text: "Sorry, connection issue. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const endSimulation = async () => {
    if (!persona || transcript.length < 4) {
      alert("Complete at least 2 exchanges before ending.");
      return;
    }

    setLoading(true);
    const systemPrompt = `You are a pitch coach evaluating a simulation with ${persona.name} (${persona.role}).

TRANSCRIPT:
${transcript.map(t => `${t.role === "investor" ? "INVESTOR" : "FOUNDER"}: ${t.text}`).join("\n\n")}

Give:
1. A SCORE from 0-100 (how well the founder handled this investor)
2. ONE PARAGRAPH of actionable feedback

Return JSON: {"score": number, "feedback": "string"}`;

    try {
      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [{ role: "user", content: "Evaluate this pitch simulation." }],
          max_tokens: 300,
          responseMimeType: "application/json"
        })
      });

      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value);
          for (const line of chunk.split("\n")) {
            if (line.trim().startsWith("data:")) {
              const raw = line.slice(5).trim();
              if (raw && raw !== "[DONE]") {
                try {
                  const parsed = JSON.parse(raw);
                  fullText += parsed?.delta?.text || "";
                } catch {}
              }
            }
          }
        }
      }

      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        setScore(result.score);
        setFeedback(result.feedback);

        // Save simulation
        await saveInvestorSim({
          uid: profile?.uid || "guest_user",
          persona: persona.id,
          transcript: transcript,
          score: result.score,
          feedback: result.feedback
        });
      }
    } catch (e) {
      console.error("Error ending simulation:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.3s ease", padding: "1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid #1c1c1c" }}>
        <div>
          <span style={{ color: LIME, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", fontWeight: "bold" }}>🎤 INVESTOR SIMULATION LAB</span>
          <h2 style={{ color: "#fff", margin: "0.2rem 0 0", fontSize: "1.25rem", fontWeight: "bold" }}>Practice Your Pitch</h2>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,60,120,0.08)", border: "1px solid rgba(255,60,120,0.3)", color: PINK, padding: "0.45rem 1rem", fontSize: "10px", fontWeight: "bold", borderRadius: "6px", cursor: "pointer" }}>
          CLOSE
        </button>
      </div>

      {/* Celebration overlay */}
      {showCelebration && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(200,255,0,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, pointerEvents: "none",
          animation: "celebrate 0.5s ease-out"
        }}>
          <style>{`@keyframes celebrate { 0% { opacity: 0; transform: scale(0.8); } 50% { transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }`}</style>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🎉</div>
            <div style={{ color: LIME, fontSize: "1.5rem", fontWeight: "900", fontFamily: "monospace" }}>INVESTOR READY!</div>
          </div>
        </div>
      )}

      {!started ? (
        /* Persona Selection */
        <div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.85rem", marginBottom: "1.5rem", fontFamily: "monospace" }}>
            Choose your investor. Each has a real personality—YC partners ask about insights, angels want founder-market fit, VCs push on numbers.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
            {PERSONAS.map(p => (
              <div
                key={p.id}
                onClick={() => startSimulation(p)}
                style={{
                  background: "#0c0c0c",
                  border: "1px solid #1c1c1c",
                  borderRadius: "8px",
                  padding: "1rem",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = LIME; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#1c1c1c"; e.currentTarget.style.transform = "none"; }}
              >
                <div style={{ color: LIME, fontSize: "0.75rem", fontWeight: "bold", marginBottom: "0.25rem" }}>{p.role}</div>
                <div style={{ color: "#fff", fontSize: "1rem", fontWeight: "bold", fontFamily: "monospace" }}>{p.name}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem", marginTop: "0.5rem", lineHeight: "1.4" }}>{p.style.slice(0, 60)}...</div>
              </div>
            ))}
          </div>

          {/* Past sessions */}
          {pastSims.length > 0 && (
            <div style={{ marginTop: "1.5rem" }}>
              <div style={{ color: PURPLE, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", marginBottom: "0.5rem" }}>PRACTICE HISTORY</div>
              {pastSims.slice(0, 3).map((sim, i) => (
                <div key={i} style={{ background: "#090909", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "0.6rem 0.8rem", marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>{PERSONAS.find(p => p.id === sim.persona)?.name || sim.persona}</span>
                  <span style={{ fontSize: "0.75rem", fontWeight: "bold", color: sim.score >= 80 ? LIME : sim.score >= 60 ? CYAN : PINK }}>{sim.score}/100</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : score !== null ? (
        /* Results Screen */
        <div style={{ textAlign: "center", paddingTop: "2rem" }}>
          <div style={{
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            background: score >= 80 ? `linear-gradient(135deg, ${LIME}40, ${LIME}20)` : score >= 60 ? `linear-gradient(135deg, ${CYAN}40, ${CYAN}20)` : `linear-gradient(135deg, ${PINK}40, ${PINK}20)`,
            border: `3px solid ${score >= 80 ? LIME : score >= 60 ? CYAN : PINK}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            animation: score >= 80 ? "pulse 2s infinite" : "none"
          }}>
            <span style={{ fontSize: "2rem", fontWeight: "900", color: score >= 80 ? LIME : score >= 60 ? CYAN : PINK, fontFamily: "monospace" }}>{score}</span>
          </div>
          <div style={{ color: score >= 80 ? LIME : score >= 60 ? CYAN : PINK, fontSize: "1.25rem", fontWeight: "bold", marginBottom: "1rem", fontFamily: "monospace" }}>
            {score >= 80 ? "Investor Ready!" : score >= 60 ? "Solid Foundation" : "Needs Work"}
          </div>
          <div style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1rem", maxWidth: "500px", margin: "0 auto 1.5rem", textAlign: "left" }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.5rem" }}>COACH FEEDBACK</div>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.85rem", lineHeight: "1.6", margin: 0, fontFamily: "monospace" }}>{feedback}</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
            <button onClick={() => { setStarted(false); setScore(null); setTranscript([]); setPersona(null); }} style={{ background: LIME, color: "#000", border: "none", padding: "0.75rem 1.5rem", fontSize: "11px", fontWeight: "bold", borderRadius: "6px", cursor: "pointer" }}>
              PRACTICE AGAIN
            </button>
            <button onClick={onClose} style={{ background: "transparent", border: "1px solid #1c1c1c", color: "rgba(255,255,255,0.6)", padding: "0.75rem 1.5rem", fontSize: "11px", borderRadius: "6px", cursor: "pointer" }}>
              DONE
            </button>
          </div>
        </div>
      ) : (
        /* Chat Interface */
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: PURPLE, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "#000" }}>{persona?.name[0]}</div>
            <div>
              <div style={{ color: "#fff", fontWeight: "bold", fontSize: "0.9rem" }}>{persona?.name}</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>{persona?.role}</div>
            </div>
          </div>

          {/* Chat messages */}
          <div style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1rem", height: "320px", overflowY: "auto", marginBottom: "1rem" }}>
            {transcript.map((msg, i) => (
              <div key={i} style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexDirection: msg.role === "founder" ? "row-reverse" : "row" }}>
                <div style={{
                  maxWidth: "80%",
                  background: msg.role === "founder" ? "rgba(200,255,0,0.08)" : "transparent",
                  border: msg.role === "founder" ? "1px solid rgba(200,255,0,0.2)" : "none",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem"
                }}>
                  {i === transcript.length - 1 && msg.role === "investor" && isTyping ? (
                    <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.85rem", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{displayedText}<span style={{ animation: "pulse 1s infinite", color: LIME }}>|</span></span>
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.85rem", fontFamily: "monospace" }}>{msg.text}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={currentInput}
              onChange={e => setCurrentInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !loading) sendResponse(); }}
              placeholder="Respond to the investor..."
              disabled={loading || isTyping}
              maxLength={500}
              style={{
                flex: 1,
                background: "#090909",
                border: "1px solid #1c1c1c",
                borderRadius: "6px",
                padding: "0.75rem 1rem",
                color: "#fff",
                fontSize: "0.85rem",
                outline: "none",
                fontFamily: "monospace"
              }}
            />
            <button
              onClick={sendResponse}
              disabled={loading || isTyping || !currentInput.trim()}
              style={{
                background: currentInput.trim() && !loading ? LIME : "#0c0c0c",
                color: currentInput.trim() && !loading ? "#000" : "rgba(255,255,255,0.3)",
                border: "none",
                borderRadius: "6px",
                padding: "0 1rem",
                cursor: currentInput.trim() && !loading ? "pointer" : "not-allowed",
                fontWeight: "bold",
                fontSize: "0.85rem"
              }}
            >
              {loading ? "..." : "SEND"}
            </button>
          </div>

          {/* End button */}
          <div style={{ marginTop: "1rem", textAlign: "right" }}>
            <button
              onClick={endSimulation}
              disabled={loading || transcript.length < 4}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,60,120,0.3)",
                color: PINK,
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                cursor: transcript.length >= 4 ? "pointer" : "not-allowed",
                fontSize: "0.75rem",
                fontWeight: "bold",
                opacity: transcript.length >= 4 ? 1 : 0.3
              }}
            >
              END SIMULATION
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
