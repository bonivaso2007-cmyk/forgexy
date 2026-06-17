import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Brain, User } from "lucide-react";
import { aiStream } from "../lib/ai";

const PERSONAS = [
  { name: "YC Partner", philosophy: "Scalability & Market Cap", bio: "Obsessed with massive scale, blitzscaling, and winner-takes-all markets." },
  { name: "Angel Investor", philosophy: "Founder Team & Vision", bio: "Bets on the person. Looking for raw grit, unique insight, and long-term vision." },
  { name: "VC Analyst", philosophy: "Traction Metrics & Retention", bio: "Data-driven. Needs to see cohorts, churn rates, and LTV/CAC ratios." },
  { name: "Corporate Dev", philosophy: "Strategic Synergy & Buyout", bio: "Looking for products that plug gaps in their existing corporate ecosystem." }
];

export default function InvestorSimulation() {
  const [persona, setPersona] = useState(PERSONAS[0]);
  const [messages, setMessages] = useState<{ sender: "AI" | "User"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [score, setScore] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { sender: "User", text: userMessage }]);
    setInput("");
    setIsTyping(true);

    const systemPrompt = `You are a startup investor with the following persona:
Name: ${persona.name}
Philosophy: ${persona.philosophy}
Bio: ${persona.bio}

Your goal is to pressure-test the founder's idea. Be direct, slightly skeptical, but professional.
Ask sharp questions about their business model, moat, and execution strategy.
Keep your responses concise and impactful (max 60 words).
Based on the founder's response, provide a 'Founder Score' update (mentally tracking it from 0-100).
If they provide a good answer, increase the score. If they are vague, keep it low.`;

    const recentHistory = messages.slice(-6).map(m => `${m.sender}: ${m.text}`).join("\n");
    const userPrompt = `Conversation history:\n${recentHistory}\n\nFounder says: "${userMessage}"\n\nRespond as ${persona.name}.`;

    try {
      let aiResponse = "";
      setMessages(prev => [...prev, { sender: "AI", text: "" }]);

      await aiStream(systemPrompt, userPrompt, (chunk) => {
        aiResponse = chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { sender: "AI", text: aiResponse };
          return updated;
        });
      }, 300);

      // Simple heuristic for score increase - in a real app, AI would return this
      const newScore = Math.min(score + Math.floor(Math.random() * 15) + 5, 100);
      setScore(newScore);

      if (newScore >= 80 && score < 80) {
          setShowCelebration(true);
          setTimeout(() => setShowCelebration(false), 3000);
      }
    } catch (error) {
      console.error("AI Simulation failed:", error);
      setMessages(prev => [...prev, { sender: "AI", text: "I'm having trouble processing that. Can you repeat your main value prop?" }]);
    } finally {
      setIsTyping(false);
    }
  }

  return (
    <div className="relative p-6 border border-zinc-800 rounded-xl bg-zinc-950 shadow-2xl overflow-hidden">
      {showCelebration && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="animate-bounce bg-lime-400 text-black px-6 py-3 rounded-full font-black text-xl shadow-[0_0_30px_rgba(200,255,0,0.5)]">
                🚀 INVESTMENT SIGNAL DETECTED!
            </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="text-lime-400 font-bold text-xl flex items-center gap-2">
            <Sparkles className="text-lime-500" /> Investor Simulation
          </h3>
          <p className="text-zinc-500 text-xs mt-1 uppercase letter-spacing-widest">Active Persona: {persona.name}</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-zinc-500 font-bold mb-1">CONVICTION INDEX</span>
          <div className="text-lime-400 font-black text-2xl bg-zinc-900 px-4 py-1 rounded-lg border border-lime-900/30">
            {score}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
        <div className="space-y-2">
          <label className="text-[10px] text-zinc-500 font-bold uppercase block">Select Target</label>
          {PERSONAS.map(p => (
            <button
              key={p.name}
              onClick={() => {
                setPersona(p);
                setMessages([]);
                setScore(0);
              }}
              className={`w-full text-left p-3 rounded-lg text-xs transition-all border ${
                persona.name === p.name
                ? "bg-lime-400/10 border-lime-400 text-lime-400 font-bold"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              {p.name}
            </button>
          ))}
          <div className="mt-4 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            <p className="text-[9px] text-zinc-500 leading-relaxed italic">
              "{persona.bio}"
            </p>
          </div>
        </div>

        <div className="flex flex-col h-[400px]">
          <div className="flex-1 overflow-y-auto mb-4 bg-black/40 p-4 rounded-xl border border-zinc-800 space-y-4 custom-scrollbar">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <Brain className="text-zinc-800 mb-3" size={40} />
                <p className="text-zinc-600 text-sm">
                  Choose an investor and send your first pitch line to begin the simulation.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === "User" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                  m.sender === "User"
                  ? "bg-lime-400 text-black font-medium rounded-tr-none"
                  : "bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700"
                }`}>
                  <strong className={`block text-[10px] mb-1 opacity-70 uppercase ${m.sender === "User" ? "text-black" : "text-lime-500"}`}>
                    {m.sender === "User" ? "You" : persona.name}
                  </strong>
                  {m.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 p-3 rounded-2xl rounded-tl-none border border-zinc-700">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              className="flex-1 p-4 bg-zinc-900 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-lime-400 transition-colors"
              placeholder={`Pitch to ${persona.name}...`}
            />
            <button
              onClick={handleSend}
              disabled={isTyping || !input.trim()}
              className="px-6 bg-lime-400 text-black rounded-xl font-bold hover:bg-lime-300 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
