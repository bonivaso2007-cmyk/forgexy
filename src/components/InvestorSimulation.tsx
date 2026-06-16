import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Brain } from "lucide-react";

const PERSONAS = [
  { name: "YC Partner", philosophy: "Scalability & Market Cap" },
  { name: "Angel Investor", philosophy: "Founder Team & Vision" },
  { name: "VC Analyst", philosophy: "Traction Metrics & Retention" },
  { name: "Corporate Dev", philosophy: "Strategic Synergy & Buyout" }
];

export default function InvestorSimulation() {
  const [persona, setPersona] = useState(PERSONAS[0]);
  const [messages, setMessages] = useState<{ sender: "AI" | "User"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [score, setScore] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { sender: "User", text: input }]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
        const response = `Interesting point about ${persona.philosophy}. How does that translate to unit economics?`;
        setMessages(prev => [...prev, { sender: "AI", text: response }]);
        setIsTyping(false);
        const newScore = Math.min(score + 10, 100);
        setScore(newScore);
        if (newScore >= 80 && score < 80) {
            setShowCelebration(true);
            setTimeout(() => setShowCelebration(false), 2000);
        }
    }, 1500);
  }

  return (
    <div className="relative p-6 border border-zinc-800 rounded-xl bg-zinc-900 shadow-xl">
      {showCelebration && (
        <div className="absolute inset-0 flex items-center justify-center animate-ping pointer-events-none">
            <span className="text-6xl">🎉</span>
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lime-400 font-bold text-lg flex items-center gap-2"><Sparkles className="text-lime-500" /> Pitch Simulator: {persona.name}</h3>
        <div className="text-emerald-400 font-bold bg-zinc-950 px-3 py-1 rounded-full border border-emerald-900">Score: {score}</div>
      </div>
      <select onChange={(e) => setPersona(PERSONAS.find(p => p.name === e.target.value)!)} className="w-full mb-6 p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm">
        {PERSONAS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
      </select>
      <div className="h-80 overflow-y-auto mb-6 bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.sender === "User" ? "text-right text-blue-300" : "text-left text-zinc-100"}`}>
            <strong className="block text-xs mb-1 opacity-60 text-lime-600">{m.sender}</strong>
            {m.text}
          </div>
        ))}
        {isTyping && <div className="text-zinc-500 animate-pulse text-sm">...</div>}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} className="flex-1 p-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white" placeholder="Pitch your idea..." />
        <button onClick={handleSend} className="p-3 bg-lime-400 text-black rounded-lg hover:bg-lime-300 transition-colors"><Send size={20} /></button>
      </div>
    </div>
  );
}
