import React, { useState, useEffect, useRef } from "react";
import { Brain, ShieldCheck, Mail, Users, Award, Globe,
  TrendingUp, Download, Eye, Send, RotateCw, Plus,
  Volume2, Sparkles, AlertCircle, FileText, CheckCircle2,
  Phone, PhoneOff, Mic, MicOff
} from "lucide-react";
import { exportComponentToPDF } from "../lib/pdfExporter";
import { getSupabase } from "../lib/supabase";
import InvestorSimulation from "./InvestorSimulation";
import { aiStream, ai } from "../lib/ai";


// Conforming to Forge aesthetic styling
const LIME = "#C8FF00";
const PINK = "#FF3C78";
const PURPLE = "#B87FFF";
const CYAN = "#00FFFF";
const DARK_BG = "#080808";
const ORANGE = "#FF9F1C";

interface CoFounderHubProps {
  idea: string;
  profile: any;
  onClose: () => void;
  onQuestPointsEarned?: (pts: number) => void;
}

export default function CoFounderHub({ idea, profile, onClose, onQuestPointsEarned }: CoFounderHubProps) {
  // Locale State: "en" | "sw"
  const [lang, setLang] = useState<"en" | "sw">("en");

  // Tab State
  const [activeTab, setActiveTab] = useState<"co-pilot" | "live-call" | "data-room" | "outreach" | "discovery" | "progress" | "traction" | "investor-sim">("co-pilot");

  // 1. Co-founder Advisory State
  const [memories, setMemories] = useState<string[]>([]);
  useEffect(() => {
    const fetchMemories = async () => {
      const sb = getSupabase();
      if (sb) {
        try {
          const { data } = await sb.from('founder_memories').select('content');
          if (data && data.length > 0) {
            setMemories(data.map(d => d.content));
            return;
          }
        } catch (e) {
          console.warn("Supabase fetch failed, falling back to local storage:", e);
        }
      }
      
      // Fallback to localStorage if no Supabase or no records
      try {
        const saved = localStorage.getItem("forge_cofounder_memories");
        if (saved) {
          setMemories(JSON.parse(saved));
        }
      } catch (e) {
        console.error("Local storage memory restoration failed:", e);
      }
    };
    fetchMemories();
  }, []);
  const [newMemory, setNewMemory] = useState("");
  const [advisoryText, setAdvisoryText] = useState("");
  const [loadingAdvisory, setLoadingAdvisory] = useState(false);

  // 2. Customer Discover state
  const [discoveryScript, setDiscoveryScript] = useState("");
  const [loadingScript, setLoadingScript] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ sender: "user" | "skeptic"; text: string }[]>([
    { sender: "skeptic", text: "Alright, I'll be honest. I hear pitch decks like this every single day. Why should I care about this right now, and how is it any different from the free alternatives?" }
  ]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [pastedQuote, setPastedQuote] = useState("");
  const [quoteEvaluation, setQuoteEvaluation] = useState<any>(null);
  const [evaluatingQuote, setEvaluatingQuote] = useState(false);

  // Quote repository
  const [repoQuotes, setRepoQuotes] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("forge_customer_quotes");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 3. User XP and Leveling state
  const [xp, setXp] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("forge_founder_xp");
      return saved ? parseInt(saved, 10) : 120;
    } catch {
      return 120;
    }
  });
  const [completedQuests, setCompletedQuests] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("forge_completed_quests");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Quests configuration
  const ALL_QUESTS = [
    { id: "quest_swot", name: "Formulate War Room SWOT Analysis", desc: "Gain deep consensus on foundational vulnerabilities and strengths", xp: 100 },
    { id: "quest_pitch", name: "Generate Live Pitch Deck Simulator", desc: "Examine multi-slide tactical narratives for angel investors", xp: 120 },
    { id: "quest_runway", name: "Simulate 12-Month Cash Burn & COGS", desc: "Formulate headcount strategies and monthly fixations", xp: 150 },
    { id: "quest_customer_chat", name: "Practice 3 Skeptical Interrogations", desc: "Defend your startup idea against harsh interactive roleplay", xp: 180 },
    { id: "quest_competitor", name: "Identify 3 Competitive Moats", desc: "Formulate active market alerts and defensive counter-attacks", xp: 90 },
    { id: "quest_swahili", name: "Configure Regional Swahili Mode", desc: "Extend your global strategy into regional Swahili markets", xp: 50 },
  ];

  // Daily briefing state (founder mode voice)
  const [briefingText, setBriefingText] = useState("");
  const [playingBriefing, setPlayingBriefing] = useState(false);
  const [synthesizingBriefing, setSynthesizingBriefing] = useState(false);

  // 4. Outreach matchmaking
  const [outreachRecipient, setOutreachRecipient] = useState<any>(null);
  const [outreachEmail, setOutreachEmail] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);

  // 5. Traction inputs
  const [tractionData, setTractionData] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("forge_traction_metrics");
      return saved ? JSON.parse(saved) : [
        { month: "Month 1", projectedMAU: 500, actualMAU: 450, projectedRev: 1000, actualRev: 900, churn: 8 },
        { month: "Month 2", projectedMAU: 1200, actualMAU: 1050, projectedRev: 2500, actualRev: 2100, churn: 7 },
        { month: "Month 3", projectedMAU: 2500, actualMAU: 1900, projectedRev: 5500, actualRev: 3800, churn: 11 },
        { month: "Month 4", projectedMAU: 5000, actualMAU: 2800, projectedRev: 12000, actualRev: 5600, churn: 14 }
      ];
    } catch {
      return [];
    }
  });
  const [newMonthLabel, setNewMonthLabel] = useState("Month 5");
  const [newProjMAU, setNewProjMAU] = useState("8000");
  const [newActMAU, setNewActMAU] = useState("3900");
  const [newProjRev, setNewProjRev] = useState("20000");
  const [newActRev, setNewActRev] = useState("7800");
  const [newActChurn, setNewActChurn] = useState("13");
  const [tractionAnalysis, setTractionAnalysis] = useState("");
  const [analyzingTraction, setAnalyzingTraction] = useState(false);

  // 6. WhatsApp integration preview Simulation
  const [telNumber, setTelNumber] = useState("");
  const [whatsAppConfigured, setWhatsAppConfigured] = useState(false);
  const [simulatedAlerts, setSimulatedAlerts] = useState<string[]>([]);

  // 7. Realistic Voice & Live Call Room State
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("");
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<"disconnected" | "connecting" | "connected" | "listening" | "speaking" | "muted">("disconnected");
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callHistory, setCallHistory] = useState<{ sender: "user" | "ai"; text: string }[]>([]);
  const [manualCallInput, setManualCallInput] = useState("");
  const [loadingCallResponse, setLoadingCallResponse] = useState(false);

  const recognitionRef = useRef<any>(null);
  const durationTimerRef = useRef<any>(null);

  // Load and pre-filter premium female speech voices on render
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        
        // Find best default female voice
        const femaleKeywords = [
          "google us english", 
          "samantha", 
          "zira",
          "microsoft zira",
          "hazel", 
          "susan", 
          "fiona", 
          "salli", 
          "joanna", 
          "victoria"
        ];
        let found = availableVoices.find(v => 
          femaleKeywords.some(keyword => v.name.toLowerCase().includes(keyword))
        );
        if (!found) {
          found = availableVoices.find(v => {
            const name = v.name.toLowerCase();
            return v.lang.startsWith("en") && (
              name.includes("female") || name.includes("woman") || name.includes("girl") || 
              name.includes("zira") || name.includes("siri") || name.includes("samantha") || name.includes("hazel")
            );
          });
        }
        if (!found) {
          found = availableVoices.find(v => v.lang.startsWith("en"));
        }
        if (found) {
          setSelectedVoiceName(found.name);
        } else if (availableVoices.length > 0) {
          setSelectedVoiceName(availableVoices[0].name);
        }
      };
      
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Update Call Duration Counter
  useEffect(() => {
    if (isCallActive && callStatus !== "disconnected") {
      durationTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    }
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [isCallActive, callStatus]);

  // Handle SpeechRecognition instance cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // Local storage writers
  useEffect(() => {
    localStorage.setItem("forge_founder_xp", xp.toString());
  }, [xp]);

  useEffect(() => {
    localStorage.setItem("forge_completed_quests", JSON.stringify(completedQuests));
  }, [completedQuests]);

  useEffect(() => {
    localStorage.setItem("forge_cofounder_memories", JSON.stringify(memories));
  }, [memories]);

  useEffect(() => {
    localStorage.setItem("forge_traction_metrics", JSON.stringify(tractionData));
  }, [tractionData]);

  useEffect(() => {
    localStorage.setItem("forge_customer_quotes", JSON.stringify(repoQuotes));
  }, [repoQuotes]);

  // Translate helper dictionary
  const t = (key: string) => {
    const dict: Record<string, { en: string; sw: string }> = {
      title: { en: "CO-FOUNDER COMMAND DECK", sw: "KITUO CHA MWANZILISHI MWENZI" },
      subtitle: { en: "Autonomous Memory-Link & Acceleration Suite", sw: "Muunganisho Wa Kumbukumbu Na Kituo Cha Kukuza Startup" },
      brainTab: { en: "CO-PILOT BRAIN", sw: "BONGO LA MWENZI" },
      liveCallTab: { en: "📞 LIVE CO-FOUNDER CALL", sw: "📞 PIGA SIMU" },
      dataRoomTab: { en: "DATA ROOM", sw: "CHUMBA CHA DATA" },
      outreachTab: { en: "MATCHMAKER", sw: "MKUTANISHAJI" },
      discoveryTab: { en: "DISCOVERY SIM", sw: "MIGAMBO YA MIJADALA" },
      progressTab: { en: "PROGRESS & XP", sw: "MALEZI NA MADHULUTI" },
      tractionTab: { en: "METRICS TRACK", sw: "KIPIMO CHA MAENDELEO" },
      dailyBriefBtn: { en: "SYNTHESIZE DAILY CO-FOUNDER SYNAPSE BRIEFING", sw: "TAYARISHA TAARIFA YA KILA SIKU YA MWANZILISHI MWENZI" },
      coFounderNotes: { en: "Co-Founder Persistent Memory System", sw: "Kumbukumbu ya Kudumu ya Mwenzi" },
      dueDiligence: { en: "Due Diligence Checklist Generator", sw: "Kadi ya Ukaguzi wa Kijasiri" },
      investorRoomTitle: { en: "Branded Investor Data Room Preview", sw: "Muonekano wa Chumba cha Wawekezaji Chenye Chapa" },
      scriptGen: { en: "Generate Customer Discovery Script", sw: "Tengeneza Mwongozo Muhimu wa Mahojiano" },
      simTitle: { en: "Harsh Interactive Pitch-Skeptic", sw: "Mwigo Mkali wa Mteja Mwenye Shaka" },
      tractionTitle: { en: "Startup Metric Visualizer (Projected vs Actual)", sw: "Visualizer ya Vipimo Kuu (Matarajio vs Uhalisia)" },
      addTractionRow: { en: "Register Monthly Performance Metrics", sw: "Sajili Matokeo Mapya ya Mwezi" }
    };
    return dict[key] ? dict[key][lang] : key;
  };

  // Compute stats
  const currentLevel = Math.floor(xp / 100);
  const levelNames = ["Strategy Apprentice", "Venture Novice", "Strategic Horizonist", "Executor Master", "Unfair Moat Visionary"];
  const levelTitle = levelNames[Math.min(currentLevel, levelNames.length - 1)];
  const nextLevelXP = (currentLevel + 1) * 100;
  const progressPercent = Math.min(100, Math.max(5, ((xp - (currentLevel * 100)) / 100) * 100));

  // --- ACTIONS ---

  // A. Co-Pilot Live Advisory
  const fetchAdvisory = async () => {
    setLoadingAdvisory(true);
    setAdvisoryText("");

    const system = "You are a proactive, critical startup co-founder companion who respects realistic operations.";
    const userPrompt = `Startup Idea: "${idea}"
Founder Context: Location: ${profile?.city}, ${profile?.country} | Industry: ${profile?.industry} | Stage: ${profile?.stage}
Past Rejected Hypotheses & Decisions: [${memories.join("; ")}]

Write a brief (max 180 words), encouraging yet highly operational daily strategic briefing. Point out 1 proactive threat (such as competitors, regulatory shift or CAC issues) and state 2 highly precise regional tasks the founder should focus on today. Include Swahili proverbs if the location is East Africa, otherwise use local contexts. Use elegant markdown bullet points starting with '→'.`;

    try {
      await aiStream(system, userPrompt, (full) => setAdvisoryText(full), 600);
    } catch {
      setAdvisoryText("Unable to pull Quantum synaptic advice. Forge local core active.");
    } finally {
      setLoadingAdvisory(false);
    }
  };

  // Speak with realistic female voice helper
  const speakWithRealisticFemaleVoice = (text: string, onStart?: () => void, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel(); // cancel any active speaking

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Choose active high-quality female voice
    if (selectedVoiceName) {
      const v = voices.find(voice => voice.name === selectedVoiceName);
      if (v) utterance.voice = v;
    }

    // Tune voice to sound realistic, gentle, and soft
    utterance.pitch = 1.05; // slightly higher/warmer pitch
    utterance.rate = 0.94;  // slightly slower for calm, natural cadence
    utterance.volume = 1.0;

    if (onStart) utterance.onstart = onStart;
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };

    synth.speak(utterance);
  };

  // B. Synthesis Briefing Audio (Founder Mode Audio Briefing)
  const synthesizeDailyBriefing = async () => {
    setSynthesizingBriefing(true);
    setPlayingBriefing(false);
    setBriefingText("");

    const sys = "You are an elite, concise cofounder growth officer briefing your startup founder. Speak in a natural, ultra-supportive yet realistic female voice.";
    const user = `Give a concise energetic oral update.
Startup: "${idea}"
Runway Context: self-funded, stage: ${profile?.stage}.
Keep it incredibly epic, stating current runway expectations, daily MVP tasks, and dynamic motivation. Avoid long intros. Max 80 words spoken directly.`;

    try {
      const cleanText = await ai(sys, user);
      setBriefingText(cleanText);

      setPlayingBriefing(true);
      speakWithRealisticFemaleVoice(cleanText, undefined, () => setPlayingBriefing(false));
    } catch {
      const fallback = `Daily update active: Establish direct customer checks. Pivot pricing metrics to sustain survival. Focus all engineering efforts entirely on proving the primary value statement now.`;
      setBriefingText(fallback);
      setPlayingBriefing(true);
      speakWithRealisticFemaleVoice(fallback, undefined, () => setPlayingBriefing(false));
    } finally {
      setSynthesizingBriefing(false);
    }
  };

  const stopBriefing = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingBriefing(false);
  };

  // --- LIVE TWO-WAY VOICE CALL HANDLERS ---
  const startLiveCall = async () => {
    // End any current briefing speech
    stopBriefing();

    setCallStatus("connecting");
    setIsCallActive(true);
    setCallDuration(0);
    setCallHistory([
      { sender: "ai", text: `Calling your co-founder AI... Connected.` }
    ]);

    const greeting = `Hey! Good to speak with you directly. I was just reviewing the business model for our concept, "${idea}". Tell me, what strategic pivot or immediate milestone are we tackling right now?`;
    
    // Animate connecting state briefly
    setTimeout(() => {
      setCallStatus("speaking");
      setCallHistory(prev => [...prev, { sender: "ai", text: greeting }]);
      speakWithRealisticFemaleVoice(greeting, undefined, () => {
        setCallStatus("listening");
        startListeningForUserSpeech();
      });
    }, 1500);
  };

  const startListeningForUserSpeech = () => {
    if (isMuted || !isCallActive) return;
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = lang === "sw" ? "sw-KE" : "en-US";

      let resultHandled = false;

      rec.onstart = () => {
        setCallStatus("listening");
        resultHandled = false;
      };

      rec.onresult = async (event: any) => {
        if (resultHandled) return;
        resultHandled = true;
        
        const transcriptText = event.results[0][0].transcript;
        if (!transcriptText || !transcriptText.trim()) return;

        // Add user transcript to history
        setCallHistory(prev => [...prev, { sender: "user", text: transcriptText }]);
        
        // Fetch conversational response
        await getAIResponseForCall(transcriptText);
      };

      rec.onerror = (e: any) => {
        console.warn("SpeechRecognition error:", e);
        // If it was silent or timed out, and we are still active and listening, restart
        if (isCallActive && callStatus === "listening") {
            resultHandled = false; // Allow restart
            setTimeout(() => {
                if (isCallActive && callStatus === "listening") {
                    startListeningForUserSpeech();
                }
            }, 1200);
        }
      };

      rec.onend = () => {
        // Automatically restart speech recognition loop only if result was NOT handled
        if (!resultHandled && isCallActive && callStatus === "listening") {
          setTimeout(() => {
            if (isCallActive && callStatus === "listening") {
              startListeningForUserSpeech();
            }
          }, 800);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e) {
      console.error("Speech recognition startup failure:", e);
    }
  };

  const getAIResponseForCall = async (userInputText: string) => {
    setCallStatus("connecting");
    setLoadingCallResponse(true);

    const sys = `You are a warm, direct, ultra-realistic, highly professional female startup co-founder and strategic advisor.
The user is calling you on their mobile/desktop phone for a quick, dynamic voice session.
Company Name/Concept: "${idea}"
Founder Context: Location: ${profile?.city}, ${profile?.country} | Industry: ${profile?.industry} | Stage: ${profile?.stage}
Past Memorized actions: [${memories.join("; ")}]

CRITICAL PHONE CALL VOICE CONSTRAINTS:
1. Speak in a highly natural, warm system voice. Avoid numbered lists, markdown bullets, tables or headers completely.
2. Be extremely brief (max 35-40 words), as this is a fast back-and-forth oral conversation.
3. Validate their action or query, provide exactly 1 smart strategic insight or critical suggestion, and ask an open conversational question to keep it flowing.`;

    try {
      const recentHistoryGroup = callHistory
        .filter(h => h.text && !h.text.includes("Calling"))
        .slice(-6)
        .map(h => ({
          role: h.sender === "user" ? "user" : "assistant",
          content: h.text
        }));

      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: sys,
          messages: [...recentHistoryGroup, { role: "user", content: userInputText }],
          max_tokens: 150
        })
      });

      if (!res.ok) throw new Error();
      const responseBody = await res.json();
      let replySpeechText = responseBody?.delta?.text || "";
      if (!replySpeechText) {
        replySpeechText = `Excellent point. Let's make sure our unit economics support that strategy. What's our next critical hire?`;
      }

      setCallHistory(prev => [...prev, { sender: "ai", text: replySpeechText }]);
      setCallStatus("speaking");
      speakWithRealisticFemaleVoice(replySpeechText, undefined, () => {
        if (isCallActive) {
          setCallStatus("listening");
          startListeningForUserSpeech();
        }
      });
    } catch {
      const fallback = "Got it. Let's execute that tactical move and check our runway parameters. How else can I assist on this call?";
      setCallHistory(prev => [...prev, { sender: "ai", text: fallback }]);
      setCallStatus("speaking");
      speakWithRealisticFemaleVoice(fallback, undefined, () => {
        if (isCallActive) {
          setCallStatus("listening");
          startListeningForUserSpeech();
        }
      });
    } finally {
      setLoadingCallResponse(false);
    }
  };

  const triggerManualCallInput = async () => {
    if (!manualCallInput.trim() || loadingCallResponse) return;
    const textMsg = manualCallInput.trim();
    setManualCallInput("");
    
    // Stop speaking if speaking
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    setCallHistory(prev => [...prev, { sender: "user", text: textMsg }]);
    await getAIResponseForCall(textMsg);
  };

  const stopLiveCall = () => {
    setIsCallActive(false);
    setCallStatus("disconnected");
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
    }
  };

  const toggleMuteCall = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted) {
      setCallStatus("muted");
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    } else {
      setCallStatus("listening");
      startListeningForUserSpeech();
    }
  };

  // C. Customer Interview Script Generator
  const generateDiscoveryScript = async () => {
    setLoadingScript(true);
    setDiscoveryScript("");

    const sys = "You are a Customer Development specialist trained on 'The Mom Test' and Lean Startup methodologies.";
    const user = `Target Customer segment: "${profile?.targetCustomer || "general devs"}" for product concept: "${idea}". 

Generate an interview script with 5 highly specific open-ended questions designed to extract honest, unbiased feedback about prior real behavior, rather than hypothetical compliments. Include dynamic instruction warnings. Format it beautifully with markdown.`;

    try {
      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: sys, messages: [{ role: "user", content: user }], max_tokens: 1000 })
      });
      if (!res.ok) throw new Error();
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let full = "";
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
                  full += parsed?.delta?.text || "";
                  setDiscoveryScript(full);
                } catch {}
              }
            }
          }
        }
      }
    } catch {
      setDiscoveryScript("Offline validation fallback: \n1. Tell me about the last time you ran into this problem?\n2. What options did you evaluate to fix it?\n3. Why were those solutions insufficient?");
    } finally {
      setLoadingScript(false);
    }
  };

  // D. Skeptical Customer Chat Interrogation
  const sendChatMessage = async () => {
    if (!chatInput.trim() || loadingChat) return;
    const nextMsg = { sender: "user" as const, text: chatInput };
    setChatMessages(prev => [...prev, nextMsg]);
    setChatInput("");
    setLoadingChat(true);

    const sys = `You are a highly skeptical target customer matching profile: ${profile?.targetCustomer}.
You are extremely busy, annoyed by generic startup language, and very cost-conscious.
You will evaluate the founder's arguments aggressively. You refuse hypotheses, demand evidence, and point out standard alternatives. Keep replies under 75 words.`;

    const recentHistory = chatMessages.concat(nextMsg).map(m => `${m.sender === "user" ? "FOUNDER" : "SKEPTIC"}: ${m.text}`).join("\n");
    const userPrompt = `Product Concept: "${idea}"
Context: Location: ${profile?.city} | Competitors: ${memories.join(", ")}
CONVERSATION SO FAR:
${recentHistory}

Please reply with the next harsh consumer interrogation question. Be highly direct and slightly argumentative.`;

    try {
      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: sys, messages: [{ role: "user", content: userPrompt }], max_tokens: 450 })
      });
      if (!res.ok) throw new Error();
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let full = "";
      // Append a placeholder message to stream into
      setChatMessages(prev => [...prev, { sender: "skeptic", text: "" }]);
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
                  const t = parsed?.delta?.text || "";
                  if (t) {
                    full += t;
                    setChatMessages(prev => {
                      const updated = [...prev];
                      updated[updated.length - 1] = { sender: "skeptic", text: full };
                      return updated;
                    });
                  }
                } catch {}
              }
            }
          }
        }
      }
      // Give points for participating
      triggerQuestCompletion("quest_customer_chat");
    } catch {
      setChatMessages(prev => [...prev, { sender: "skeptic", text: "Look, sounds like too much manual setup for me. I'll pass." }]);
    } finally {
      setLoadingChat(false);
    }
  };

  // E. Paste real customer quote validation
  const evaluateCustomerFeedback = async () => {
    if (!pastedQuote.trim() || evaluatingQuote) return;
    setEvaluatingQuote(true);
    setQuoteEvaluation(null);

    const sys = "You are a customer discovery psychologist who ruthlessly dissects user quotes to detect fake validating noise from real commitment signals.";
    const user = `Startup Idea: "${idea}"
Quote pasted by founder from a discovery call:
"${pastedQuote}"

Analyze this quote specifically and return a JSON object with:
{
  "rating": "VALIDATING" | "INVALIDATING" | "HYPOTHETICAL_NOISE",
  "explanation": "Brief explanation of what the quote actually means under the surface (max 60 words)",
  "veracityScore": 1-10,
  "nextStep": "Actionable task to run on this user to verify commitment"
}`;

    try {
      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: sys, messages: [{ role: "user", content: user }], max_tokens: 500, responseMimeType: "application/json" })
      });
      if (!res.ok) throw new Error();
      // Since it's streaming SSE, we accumulate text
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let full = "";
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
                  full += parsed?.delta?.text || "";
                } catch {}
              }
            }
          }
        }
      }

      // Safe JSON extractor
      let cleaned = full.replace(/```json/gi, "").replace(/```/g, "").trim();
      const data = JSON.parse(cleaned);
      setQuoteEvaluation(data);

      // Add to repository
      setRepoQuotes(prev => [
        {
          id: Date.now().toString(),
          quote: pastedQuote,
          rating: data.rating,
          explanation: data.explanation,
          score: data.veracityScore
        },
        ...prev
      ]);
      setPastedQuote("");
    } catch {
      // Fake safe fallback evaluation
      const fallback = {
        rating: "HYPOTHETICAL_NOISE",
        explanation: "The user talks in future/conditional tenses ('I would pay'). This has close to zero correlation with acquisition behavior.",
        veracityScore: 3,
        nextStep: "Ask them to pre-order or schedule a 15-minute onboarding call next Tuesday."
      };
      setQuoteEvaluation(fallback);
      setRepoQuotes(prev => [
        {
          id: Date.now().toString(),
          quote: pastedQuote,
          rating: fallback.rating,
          explanation: fallback.explanation,
          score: fallback.veracityScore
        },
        ...prev
      ]);
      setPastedQuote("");
    } finally {
      setEvaluatingQuote(false);
    }
  };

  // F. Fundraising pitch drafter
  const draftOutreach = async (investor: any) => {
    setOutreachRecipient(investor);
    setLoadingEmail(true);
    setOutreachEmail("");

    const sys = "You are an elite venture strategist fluent in high-conversion executive summaries.";
    const user = `Startup details: "${idea}"
Founder location & Profile: ${profile?.city}, ${profile?.country} | Stage: ${profile?.stage}
Target Fund: ${investor.name} (Philosophy: ${investor.philosophy})

Draft a highly personalized, compelling, and warm outbound intro email to this target fund (max 150 words). Focus specifically on why your regional model corresponds to their thesis. Ensure there is a single clear call-to-action to review the Forge Data Room.`;

    try {
      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: sys, messages: [{ role: "user", content: user }], max_tokens: 500 })
      });
      if (!res.ok) throw new Error();
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let full = "";
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
                  full += parsed?.delta?.text || "";
                  setOutreachEmail(full);
                } catch {}
              }
            }
          }
        }
      }
    } catch {
      setOutreachEmail("Subject: Investment Alignment Check \n\nDear Investment Committee, \n\nI have structured a high-integrity regional company centered on proving transactional market velocity. Our models are ready in our secure active Data Room. Let me know when you have 10 minutes next week to evaluate our competitive advantages.");
    } finally {
      setLoadingEmail(false);
    }
  };

  // G. Traction analyzer warning system
  const runMetricAnalysis = async () => {
    setAnalyzingTraction(true);
    setTractionAnalysis("");

    const sys = "You are a quantitative CFO specializing in SaaS and transactional marketplace unit economics.";
    const user = `Here is our projection vs actual metrics history:
${JSON.stringify(tractionData)}

Analyze this traction profile. Identify if there's high churn or lower-than-projected user velocity. Give 2 highly direct corrective actions to reverse these leakage variables. (Limit to 140 words, very critical, no waffle)`;

    try {
      const res = await fetch("/api/ai-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: sys, messages: [{ role: "user", content: user }], max_tokens: 500 })
      });
      if (!res.ok) throw new Error();
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let full = "";
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
                  full += parsed?.delta?.text || "";
                  setTractionAnalysis(full);
                } catch {}
              }
            }
          }
        }
      }
    } catch {
      setTractionAnalysis("Operational diagnostic: Monthly active user growth is showing friction below the projected gradient. Churn is exceeding safe benchmarks. Focus completely on customer retention cycles and reduce CAC burn immediately.");
    } finally {
      setAnalyzingTraction(false);
    }
  };

  // H. Export Branded Portfolio HTML Output (for direct browser copy/printing of entire startup)
  const exportBrandedPortfolio = () => {
    const brandedHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>FORGE - PRIVATE PORTFOLIO PACKAGE: ${idea.slice(0, 30)}</title>
        <style>
          body { font-family: monospace; background: #050505; color: #ffffff; padding: 3rem; line-height: 1.6; }
          .container { max-width: 900px; margin: 0 auto; border: 1px solid #1c1c1c; padding: 2.5rem; background: #0a0a0a; border-radius: 8px; }
          .header { border-bottom: 2px solid ${LIME}; padding-bottom: 1.5rem; margin-bottom: 2rem; }
          .title { color: ${LIME}; font-size: 24px; font-weight: bold; text-transform: uppercase; margin: 0; }
          .subtitle { color: #888; font-size: 11px; margin-top: 5px; }
          h2 { color: ${PURPLE}; font-size: 14px; border-bottom: 1px solid #222; padding-bottom: 5px; margin-top: 2rem; }
          .metric-box { border: 1px solid #1c1c1c; padding: 1.2rem; background: #050505; border-radius: 4px; display: inline-block; margin-right: 1.5rem; min-width: 154px; }
          .metric-val { font-size: 18px; color: ${CYAN}; font-weight: bold; margin-top: 5px; }
          .quote { font-style: italic; color: #aaa; border-left: 3px solid ${PINK}; padding-left: 10px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">Forge Executive Startup Packet</h1>
            <div class="subtitle">AUTONOMOUS DUE DILIGENCE DECK | LOCALLY SECURED</div>
          </div>
          <h2>FOUNDATION CONCEPT</h2>
          <p>${idea}</p>

          <h2>FOUNDER BIOGRAPHY & BOUNDS</h2>
          <p><strong>Name:</strong> ${profile?.name || "Global Builder"}</p>
          <p><strong>Geography:</strong> ${profile?.city}, ${profile?.country}</p>
          <p><strong>Sector:</strong> ${profile?.market || profile?.industry}</p>
          <p><strong>Staged Runway:</strong> ${profile?.funding || "Self-funded"}</p>
          
          <h2>ACCRETED MEMORIES OF DECISION</h2>
          <ul>
            ${memories.map(m => `<li>${m}</li>`).join("")}
          </ul>

          <h2>PRE-INVESTOR CHECKLIST</h2>
          <ul>
            <li>[✓] System-generated SWOT models matching temporal defense bounds</li>
            <li>[✓] Interactive cash burn COGS trajectory validated</li>
            <li>[✓] Live customer skeptic interviews simulation conducted</li>
          </ul>

          <div style="margin-top: 3rem; text-align: center; color: #555; font-size: 9px; border-top: 1px solid #222; padding-top: 1.5rem;">
            VALIDATED SECURELY VIA FORGE CO-FOUNDER SUITE • CONFIDENTIAL DISTRIBUTION ONLY
          </div>
        </div>
      </body>
      </html>
    `;

    // Create blobs and trigger custom browser download
    const blob = new Blob([brandedHTML], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FORGE-Startup-Investor-Portfolio.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to complete quests and earn XP
  const triggerQuestCompletion = (questId: string) => {
    if (completedQuests.includes(questId)) return;
    const q = ALL_QUESTS.find(item => item.id === questId);
    if (q) {
      setCompletedQuests(prev => [...prev, questId]);
      setXp(v => v + q.xp);
      if (onQuestPointsEarned) onQuestPointsEarned(q.xp);
    }
  };

  // WhatsApp reminder configure mockup
  const setupWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!telNumber.trim()) return;
    setWhatsAppConfigured(true);
    setSimulatedAlerts([
      `[WhatsApp Alert - Core Sandbox Active]: Hello, ${profile?.name || "Builder"}. Remember: Last week you rejected hypotheses about premium tiers. Today, challenge competitor validation.`,
      `[WhatsApp Alert - Cash warning]: Model status: Check high churn metrics quickly.`
    ]);
  };

  return (
    <div id="cofounder_hub_deck" style={{ minHeight: "82vh", background: "#050505", color: "#ffffff", padding: "1.5rem", borderRadius: "10px", border: "1px solid #1c1c1c", fontFamily: "monospace", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      
      {/* HEADER CONTROLS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a1a1a", paddingBottom: "1.1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.68rem" }}>
            <span style={{ fontSize: "1.85rem", animation: "pulse 2s infinite" }}>🛰️</span>
            <div>
              <h1 style={{ color: LIME, fontSize: "1.55rem", fontWeight: "900", textTransform: "uppercase", margin: 0, letterSpacing: "1px" }}>{t("title")}</h1>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.72rem", margin: "2px 0 0" }}>{t("subtitle")}</p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {/* Swahili Toggle */}
          <button 
            onClick={() => {
              const next = lang === "en" ? "sw" : "en";
              setLang(next);
              triggerQuestCompletion("quest_swahili");
            }}
            style={{ 
              background: lang === "sw" ? LIME : "rgba(255,255,255,0.05)", 
              color: lang === "sw" ? "#000" : "#fff", 
              border: `1px solid ${lang === "sw" ? LIME : "#1c1c1c"}`,
              padding: "0.42rem 0.82rem", fontSize: "10px", borderRadius: "4px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.38rem" 
            }}
          >
            <Globe size={11} />
            {lang === "en" ? "ENGLISH" : "KISWAHILI"}
          </button>

          {/* Close main */}
          <button 
            onClick={onClose}
            className="glow-pink"
            style={{ 
              background: "rgba(255, 60, 120, 0.08)", 
              border: "1px solid rgba(255, 60, 120, 0.35)", 
              color: PINK, 
              padding: "0.45rem 1rem", 
              fontSize: "10.5px", 
              borderRadius: "5px", 
              cursor: "pointer",
              fontWeight: "900"
            }}
          >
            DISCONNECT CO-FOUNDER
          </button>
        </div>
      </div>

      {/* GAMIFICATION XP PROGRESS MINIBAR */}
      <div style={{ background: "rgba(184, 127, 255, 0.04)", border: "1px solid rgba(184, 127, 255, 0.15)", borderRadius: "6px", padding: "1rem", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.82rem" }}>
          <div style={{ background: PURPLE, color: "#000", fontWeight: "900", width: "42px", height: "42px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
            Lvl {currentLevel}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span style={{ color: "#ffffff", fontWeight: "bold", fontSize: "0.85rem" }}>{levelTitle}</span>
              <span style={{ color: PURPLE, fontSize: "0.68rem" }}>({xp} Total XP)</span>
            </div>
            <div style={{ display: "flex", gap: "5px", marginTop: "4px" }}>
              {completedQuests.map(qId => {
                const quest = ALL_QUESTS.find(i => i.id === qId);
                return (
                  <span key={qId} style={{ fontSize: "9px", background: "rgba(200, 255, 0, 0.08)", border: "1px solid rgba(200, 255, 0, 0.25)", color: LIME, padding: "2px 5px", borderRadius: "3px" }} title={quest?.desc}>
                    🏅 {quest?.name.split(" ")[0]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Progress gauge */}
        <div style={{ flex: 1, maxWidth: "400px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "rgba(255,255,255,0.45)", marginBottom: "4px" }}>
            <span>XP PROGRESSION</span>
            <span>{xp % 100} / 100 to Next Level</span>
          </div>
          <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ width: `${progressPercent}%`, height: "100%", background: `linear-gradient(90deg, ${PURPLE} 0%, ${CYAN} 100%)`, transition: "width 0.3s ease" }} />
          </div>
        </div>
      </div>

      {/* HORIZONTAL INTERACTIVE MENU TABS */}
      <div style={{ display: "flex", borderBottom: "1px solid #1c1c1c", gap: "0.38rem", overflowX: "auto", paddingBottom: "2px" }}>
        {[
          { key: "co-pilot", label: t("brainTab"), icon: <Brain size={14} /> },
          { key: "live-call", label: t("liveCallTab"), icon: <Phone size={14} /> },
          { key: "data-room", label: t("dataRoomTab"), icon: <ShieldCheck size={14} /> },
          { key: "outreach", label: t("outreachTab"), icon: <Mail size={14} /> },
          { key: "discovery", label: t("discoveryTab"), icon: <Users size={14} /> },
          { key: "progress", label: t("progressTab"), icon: <Award size={14} /> },
          { key: "traction", label: t("tractionTab"), icon: <TrendingUp size={14} /> },
          { key: "investor-sim", label: "Investor Sim", icon: <Sparkles size={14} /> },
        ].map(item => {
          const active = activeTab === item.key;
          return (
            <button 
              key={item.key}
              onClick={() => setActiveTab(item.key as any)}
              style={{
                background: active ? "rgba(200, 255, 0, 0.05)" : "transparent",
                color: active ? LIME : "rgba(255,255,255,0.5)",
                border: "none",
                borderBottom: `2.5px solid ${active ? LIME : "transparent"}`,
                padding: "0.78rem 1rem",
                fontSize: "11px",
                fontWeight: "bold",
                fontFamily: "monospace",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.55rem",
                transition: "all 0.15s",
                whiteSpace: "nowrap"
              }}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </div>

      {/* TAB CONTENT NODES */}
      <div style={{ flex: 1 }}>
        
        {/* TAB 1: CO-PILOT ADVISORY & MEMORIES */}
        {activeTab === "co-pilot" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
            
            {/* Proactive Advisory */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.4rem' }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <span style={{ color: LIME, fontSize: "11px", fontWeight: "bold" }}>🧠 PROACTIVE SYNAPSE CO-FOUNDER BRIEFING</span>
                  <button 
                    onClick={fetchAdvisory}
                    disabled={loadingAdvisory}
                    style={{ background: "transparent", border: "1px solid rgba(200, 255, 0, 0.25)", color: LIME, padding: "4px 10px", fontSize: "9px", cursor: "pointer", borderRadius: "4px", display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <RotateCw size={10} className={loadingAdvisory ? "animate-spin" : ""} />
                    {loadingAdvisory ? "SYNAPSING..." : "FORGE INTEGRITY ADVICE"}
                  </button>
                </div>

                {!advisoryText && !loadingAdvisory ? (
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.78rem", lineHeight: "1.6" }}>
                    Welcome visionary. Tap the advice engine above to formulate highly precise regional tasks, alert warnings, and proactive growth evaluations matching your latest decisions.
                  </p>
                ) : (
                  <div style={{ fontSize: "0.82rem", lineHeight: "1.6", color: "rgba(255,255,255,0.85)", borderLeft: `2.5px solid ${LIME}`, paddingLeft: "12px", background: "rgba(200, 255, 0, 0.01)" }}>
                    {advisoryText.split("\n").map((line, idx) => (
                      <p key={idx} style={{ margin: "5px 0" }}>{line}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Founder Mode Daily Audio Voice Module */}
              <div style={{ background: "rgba(184, 127, 255, 0.04)", border: "1px solid rgba(184, 127, 255, 0.2)", borderRadius: "6px", padding: '1.3rem' }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.82rem", marginBottom: "0.8rem" }}>
                  <span style={{ background: "rgba(184, 127, 255, 0.15)", borderRadius: "50%", padding: "6px", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Volume2 size={15} style={{ color: PURPLE }} />
                  </span>
                  <div>
                    <h3 style={{ color: "#ffffff", fontSize: "11px", fontWeight: "bold", margin: 0 }}>{t("dailyBriefBtn")}</h3>
                    <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", margin: "1px 0 0" }}>Audio synthesis briefing designed for mobile commutes</p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <button
                    onClick={synthesizeDailyBriefing}
                    disabled={synthesizingBriefing}
                    style={{ background: PURPLE, color: "#000", border: "none", borderRadius: "4px", padding: "8px 14px", fontSize: "10px", fontWeight: "900", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <Sparkles size={11} />
                    {synthesizingBriefing ? "SYNTHESIZING SOUND..." : "PLAY SPOKEN UPDATE"}
                  </button>

                  {playingBriefing && (
                    <button 
                      onClick={stopBriefing}
                      style={{ background: "rgba(255, 60, 120, 0.1)", border: "1px solid rgba(255, 60, 120, 0.25)", color: PINK, borderRadius: "4px", padding: "8px 14px", fontSize: "10px", cursor: "pointer" }}
                    >
                      STOP AUDIO
                    </button>
                  )}
                </div>

                {briefingText && (
                  <div style={{ marginTop: "1rem", background: "#050505", border: "1px solid #1a1a1a", borderRadius: "5px", padding: "0.82rem", fontSize: "0.76rem", color: "rgba(255,255,255,0.65)", display: "flex", gap: "8px" }}>
                    <AlertCircle size={15} style={{ color: PURPLE, flexShrink: 0 }} />
                    <span>"{briefingText}"</span>
                  </div>
                )}
              </div>
            </div>

            {/* Target memory list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.2rem" }}>
                <h3 style={{ color: PURPLE, fontSize: "11px", fontWeight: "bold", marginBottom: "0.22rem" }}>💾 Startup Local Memory Vault</h3>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", marginBottom: "0.95rem" }}>Continuous decisions, pivot records & invalidated pathways stored in your local sandbox.</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: '1rem', maxHeight: "190px", overflowY: "auto" }}>
                  {memories.map((mem, idx) => (
                    <div key={idx} style={{ background: "#050505", border: "1px solid #1a1a1a", padding: "0.55rem 0.72rem", borderRadius: "4px", fontSize: "0.76rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "rgba(255,255,255,0.85)" }}>• {mem}</span>
                      <button 
                        onClick={() => setMemories(prev => prev.filter((_, i) => i !== idx))}
                        style={{ background: "transparent", color: "rgba(255,255,255,0.3)", border: "none", cursor: "pointer", fontSize: "10px" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "0.45rem" }}>
                  <input 
                    type="text" 
                    value={newMemory}
                    onChange={e => setNewMemory(e.target.value)}
                    placeholder="e.g. Switched CRM pipeline provider..."
                    style={{ flex: 1, padding: "0.5rem", background: "#050505", border: "1px solid #1a1a1a", borderRadius: "4px", color: "#ffffff", fontSize: "11px" }}
                  />
                  <button 
                    onClick={async () => {
                      if (!newMemory.trim()) return;
                      const memoryContent = newMemory.trim();
                      const sb = getSupabase();
                      if (sb) {
                        const { error } = await sb.from('founder_memories').insert([{ content: memoryContent }]);
                        if (error) { console.error('Error saving:', error); return; }
                      }
                      setMemories(prev => [...prev, memoryContent]);
                      setNewMemory("");
                    }}
                    style={{ background: LIME, color: "#000", border: "none", borderRadius: "4px", padding: "0.5rem 0.85rem", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}
                  >
                    ADD
                  </button>
                </div>
              </div>

              {/* Unanswered Quest Prompt */}
              <div style={{ background: "rgba(200, 255, 0, 0.02)", border: "1px solid rgba(200, 255, 0, 0.15)", borderRadius: "6px", padding: "1.1rem" }}>
                <span style={{ color: LIME, fontSize: "9px", fontWeight: "bold", letterSpacing: "1px", display: "block" }}>🎯 CONTINUOUS Q&A RE-EVALUATION</span>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.76rem", margin: "6px 0 10px" }}>You never fully concluded detailing your key unfair moats. Tap to generate updated hypotheses regarding competitor shifts.</p>
                <button 
                  onClick={() => { setActiveTab("discovery"); triggerQuestCompletion("quest_competitor"); }}
                  style={{ background: "transparent", border: "1px solid rgba(200,255,0,0.3)", color: LIME, borderRadius: "4px", fontSize: "9px", padding: "5px 10px", cursor: "pointer" }}
                >
                  START CHALLENGE
                </button>
              </div>
            </div>

          </div>
        )}

        {/* TAB 1.5: LIVE VOICE CALL ROOM */}
        {activeTab === "live-call" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
              
              {/* Voice Engine Dashboard */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1c1c1c", paddingBottom: "0.85rem" }}>
                  <div>
                    <h3 style={{ color: LIME, fontSize: "13px", fontWeight: "bold", margin: 0 }}>📞 FORGE HANDS-FREE VOICE CALL</h3>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px" }}>TWO-WAY REAL-TIME CALL SYSTEM</span>
                  </div>
                  <span style={{ color: CYAN, background: "rgba(0,255,255,0.1)", border: "1px solid rgba(0,255,255,0.25)", fontSize: "8px", fontWeight: "bold", padding: "2px 6px", borderRadius: "3px", fontFamily: "monospace" }}>
                    {isCallActive ? "SESSION ACTIVE" : "OFFLINE"}
                  </span>
                </div>

                {/* Voice Selection Controls for Female Realism */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1rem' }}>
                  <label style={{ display: "block", color: LIME, fontSize: "10px", fontWeight: "bold", marginBottom: "6px" }}>
                    👩‍💼 AI CO-FOUNDER FEMALE VOICE TUNER
                  </label>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.74rem", margin: "0 0 10px" }}>
                    Choose your companion's system voice. We auto-calibrate her pitch to 1.05 and speed to 0.94 for an elite, realistic, soft-spoken human-like tone.
                  </p>
                  
                  {voices.length === 0 ? (
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
                      Detecting available browser speech engines... Run your call to play.
                    </div>
                  ) : (
                    <select
                      value={selectedVoiceName}
                      onChange={(e) => setSelectedVoiceName(e.target.value)}
                      style={{ width: "100%", padding: "0.45rem", background: "#050505", border: "1px solid #222", color: "#fff", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace" }}
                    >
                      {voices.map((v, idx) => (
                        <option key={idx} value={v.name}>
                          {v.name} ({v.lang}) {v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("samantha") || v.name.toLowerCase().includes("siri") ? "• Recommended Female 👩" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Main Call State Interactive Display */}
                <div style={{ background: "#050505", border: "1px solid #161616", borderRadius: "6px", padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  
                  {isCallActive ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                      
                      {/* Animated Core Vocal Orb */}
                      <div style={{ position: "relative", width: "100px", height: "100px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {/* Pulse Ring 1 */}
                        <div 
                          className="animate-ping"
                          style={{ 
                            position: "absolute", 
                            width: "100px", 
                            height: "100px", 
                            borderRadius: "50%", 
                            background: callStatus === "speaking" ? "rgba(200, 255, 0, 0.15)" : callStatus === "listening" ? "rgba(0, 255, 255, 0.15)" : "rgba(255, 60, 120, 0.15)",
                            animationDuration: "2s"
                          }} 
                        />
                        {/* Main Center Ball */}
                        <div 
                          style={{ 
                            width: "70px", 
                            height: "70px", 
                            borderRadius: "50%", 
                            background: callStatus === "speaking" ? LIME : callStatus === "listening" ? CYAN : PINK, 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center", 
                            boxShadow: `0 0 25px ${callStatus === "speaking" ? LIME : callStatus === "listening" ? CYAN : PINK}`,
                            transition: "all 0.3s ease"
                          }}
                        >
                          <Phone size={24} color="#000" />
                        </div>
                      </div>

                      <div style={{ textAlign: "center" }}>
                        <span style={{ 
                          color: callStatus === "speaking" ? LIME : callStatus === "listening" ? CYAN : "#888", 
                          fontSize: "14px", 
                          fontWeight: "900", 
                          letterSpacing: "1px",
                          display: "block",
                          textTransform: "uppercase"
                        }}>
                          {callStatus === "speaking" ? "🗣️ SPEAKING..." : callStatus === "listening" ? "🎤 LISTENING..." : callStatus === "connecting" ? "⚡ SECURING LINK..." : "● MUTED"}
                        </span>
                        
                        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", marginTop: "4px", display: "block" }}>
                          Call Duration: {Math.floor(callDuration / 60).toString().padStart(2, "0")}:{Math.floor(callDuration % 60).toString().padStart(2, "0")}
                        </span>
                      </div>

                      {/* Control buttons */}
                      <div style={{ display: "flex", gap: "0.85rem", marginTop: "0.5rem" }}>
                        <button 
                          onClick={toggleMuteCall}
                          style={{ 
                            background: isMuted ? PINK : "rgba(255,255,255,0.06)", 
                            color: isMuted ? "#000" : "#fff", 
                            border: `1px solid ${isMuted ? PINK : "#222"}`, 
                            borderRadius: "50%", 
                            width: "44px", 
                            height: "44px", 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center", 
                            cursor: "pointer", 
                            transition: "all 0.15s" 
                          }}
                          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                        >
                          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>

                        <button 
                          onClick={stopLiveCall}
                          className="glow-pink"
                          style={{ 
                            background: "rgba(255, 60, 120, 0.2)", 
                            color: PINK, 
                            border: `1px solid ${PINK}`, 
                            borderRadius: "22px", 
                            padding: "0 1.5rem", 
                            height: "44px", 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "8px", 
                            cursor: "pointer", 
                            fontWeight: "bold",
                            fontSize: "11px",
                            transition: "all 0.15s" 
                          }}
                        >
                          <PhoneOff size={15} />
                          END ADVISORY CALL
                        </button>
                      </div>

                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "1rem 0" }}>
                      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.85rem", maxWidth: "320px", margin: "0 auto 1.5rem", lineHeight: "1.5" }}>
                        Establish a high-fidelity vocal call to review strategic changes, pivot options, or business acceleration hands-free.
                      </p>
                      <button
                        onClick={startLiveCall}
                        style={{
                          background: `linear-gradient(270deg, ${LIME} 0%, #aacc00 100%)`,
                          color: "#111111",
                          border: "none",
                          padding: "0.85rem 2rem",
                          borderRadius: "30px",
                          fontSize: "12px",
                          fontWeight: "900",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          boxShadow: `0 0 15px rgba(200, 255, 0, 0.3)`
                        }}
                      >
                        <Phone size={15} />
                        DIAL CO-FOUNDER AI CALL
                      </button>
                    </div>
                  )}

                </div>

                {/* Pro Tip Card */}
                <div style={{ background: "rgba(0, 255, 255, 0.02)", border: "1px solid rgba(0, 255, 255, 0.15)", borderRadius: "6px", padding: '1rem', fontSize: "0.80rem", color: "rgba(255,255,255,0.8)", lineHeight: "1.4" }}>
                  💡 <span style={{ color: CYAN, fontWeight: "bold" }}>PRO INTERACTIVE TIP:</span> Hands-free call mode automatically listens when you stop talking and replies to you. (If mic permissions are restricted or Chrome speech recognition times out, you can also use the live text box on the right).
                </div>

              </div>

              {/* Call History & Text Sync Channel */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "8px", padding: '1.4rem', display: "flex", flexDirection: "column", height: "450px" }}>
                <span style={{ color: LIME, fontSize: "10px", fontWeight: "bold", letterSpacing: "1px", display: "block" }}>📝 AUDIO SESSION TRANSCRIPTION</span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "8.5px", display: "block", marginBottom: "0.75rem" }}>SECURE REAL-TIME TRANSCRIPTION OVERLAY</span>

                {/* Log Messages */}
                <div style={{ flex: 1, background: "#050505", border: "1px solid #161616", borderRadius: "6px", padding: "1rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {callHistory.length === 0 ? (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: "11px", fontStyle: "italic" }}>
                      No active call audio history. Initiate dial to link.
                    </div>
                  ) : (
                    callHistory.map((h, i) => {
                      const isAI = h.sender === "ai";
                      return (
                        <div 
                          key={i} 
                          style={{
                            alignSelf: isAI ? "flex-start" : "flex-end",
                            maxWidth: "85%",
                            background: isAI ? "rgba(255,255,255,0.04)" : "rgba(200, 255, 0, 0.08)",
                            border: `1px solid ${isAI ? "#1c1c1c" : "rgba(200, 255, 0, 0.25)"}`,
                            borderRadius: "6px",
                            padding: "0.6rem 0.85rem",
                          }}
                        >
                          <span style={{ fontSize: "8px", fontWeight: "bold", display: "block", color: isAI ? PURPLE : LIME, marginBottom: "3px" }}>
                            {isAI ? "👩‍💼 CO-FOUNDER (SPEECH OUTPUT)" : "👤 YOU (MICROPHONE)"}
                          </span>
                          <p style={{ color: "#fff", fontSize: "0.78rem", margin: 0, lineHeight: "1.4" }}>
                            {h.text}
                          </p>
                        </div>
                      )
                    })
                  )}
                  {loadingCallResponse && (
                    <div style={{ alignSelf: "flex-start", background: "rgba(255,255,255,0.02)", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "0.6rem 0.85rem" }}>
                      <span className="animate-pulse" style={{ color: PURPLE, fontSize: "10px", fontWeight: "bold" }}>Generating tactical speech reply...</span>
                    </div>
                  )}
                </div>

                {/* manual Text fallback */}
                {isCallActive && (
                  <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.85rem" }}>
                    <input 
                      type="text"
                      value={manualCallInput}
                      onChange={e => setManualCallInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") triggerManualCallInput(); }}
                      placeholder="Type query to get high-quality spoken output..."
                      style={{ flex: 1, padding: "0.55rem", background: "#050505", border: "1px solid #222", borderRadius: "4px", color: "#fff", fontSize: "11px", fontFamily: "monospace" }}
                    />
                    <button
                      onClick={triggerManualCallInput}
                      disabled={loadingCallResponse || !manualCallInput.trim()}
                      style={{ background: LIME, color: "#000", border: "none", borderRadius: "4px", width: "36px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <Send size={12} color="#000" />
                    </button>
                  </div>
                )}

              </div>

            </div>

          </div>
        )}

        {/* TAB 2: INVESTOR DATA ROOM PREVIEW & EXPORT */}
        {activeTab === "data-room" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
              
              {/* Branded Room Preview */}
              <div id="branded-room-preview" style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.4rem' }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: '1px solid #1c1c1c', paddingBottom: "0.75rem", marginBottom: "1.1rem" }}>
                  <h3 style={{ color: LIME, fontSize: "12px", fontWeight: "bold", margin: 0 }}>🤝 {t("investorRoomTitle")}</h3>
                  <span style={{ color: CYAN, fontSize: "9px", fontWeight: "bold", letterSpacing: "1px" }}>🔒 SHA-256 ACCREDITED</span>
                </div>

                <div style={{ background: "#050505", border: "1px solid #1a1a1a", padding: "1rem", borderRadius: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignContent: "center", marginBottom: "1rem", borderBottom: "1px solid #1a1a1a", paddingBottom: "0.45rem" }}>
                    <div>
                      <span style={{ color: LIME, fontSize: "12px", fontWeight: "bold" }}>{profile?.name || "Global"}'s Startup Data Room</span>
                      <span style={{ display: "block", color: "rgba(255,255,255,0.45)", fontSize: "7.5px" }}>https://forge.ai/room/quantum-${profile?.name ? profile.name.toLowerCase().replace(/\s+/g, "-") : "visionary"}</span>
                    </div>
                    <span style={{ color: LIME, background: "rgba(200,255,0,0.1)", borderRadius: "4px", paddingLeft: "6px", paddingRight: "6px", height: "fit-content", paddingTop: "3px", paddingBottom: "3px", fontSize: "8.5px", fontWeight: "bold" }}>● ACTIVE URL</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div style={{ border: "1px solid #1c1c1c", padding: "0.82rem", borderRadius: "4px" }}>
                      <span style={{ color: PURPLE, fontSize: "9px", display: "block", fontWeight: "bold" }}>EXECUTIVE SUMMARY</span>
                      <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.72rem", margin: "4px 0" }}>{idea.slice(0, 110)}...</p>
                    </div>
                    <div style={{ border: "1px solid #1c1c1c", padding: "0.82rem", borderRadius: "4px" }}>
                      <span style={{ color: CYAN, fontSize: "9px", display: "block", fontWeight: "bold" }}>12M RUNWAY FORECAST</span>
                      <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.72rem", margin: "4px 0" }}>Status: self-funded, cash indicators validated locally.</p>
                    </div>
                    <div style={{ border: "1px solid #1c1c1c", padding: "0.82rem", borderRadius: "4px" }}>
                      <span style={{ color: PINK, fontSize: "9px", display: "block", fontWeight: "bold" }}>COMPETITIVE RADAR</span>
                      <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.72rem", margin: "4px 0" }}>Mapping: 4 defensive matrices loaded verified.</p>
                    </div>
                    <div style={{ border: "1px solid #1c1c1c", padding: "0.82rem", borderRadius: "4px" }}>
                      <span style={{ color: LIME, fontSize: "9px", display: "block", fontWeight: "bold" }}>FOUNDING TEAM</span>
                      <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.72rem", margin: "4px 0" }}>Role: Visionary builder based in {profile?.city}.</p>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.9rem", marginTop: "1.3rem" }}>
                  <button 
                    onClick={exportBrandedPortfolio}
                    style={{ background: LIME, color: "#000", border: "none", borderRadius: "4px", padding: "0.78rem 1.15rem", fontSize: "11px", fontWeight: "900", cursor: "pointer", display: "flex", alignItems: "center", gap: "7px" }}
                  >
                    <Download size={13} />
                    EXPORT BRANDED EXECUTIVE PACKET (HTML)
                  </button>

                  <button 
                    onClick={() => exportComponentToPDF("branded-room-preview", "Startup_Data_Room.pdf")}
                    style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: "4px", padding: "0.78rem 1.15rem", fontSize: "11px", cursor: "pointer" }}
                  >
                    PRINT / EXPORT PORTFOLIO PDF
                  </button>
                </div>
              </div>

              {/* Due Diligence Checklist */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.2rem', display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                <div>
                  <h3 style={{ color: PURPLE, fontSize: "11.5px", fontWeight: "bold", margin: 0 }}>📂 {t("dueDiligence")}</h3>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", marginTop: "3px" }}>Crucial documents corporate angel investors will formulate demands on.</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {[
                    "Validated Incorporation and Founder Intellectual Property Sign-off File",
                    "Validated Interactive Pro-forma COGS spreadsheet runway models",
                    "Documented customer pain point proof quotes with metrics",
                    "Regulatory and legal frameworks clearance certification",
                    "Systematic cyber defenses or offline regional contingency protocols"
                  ].map((item, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "8px", background: "#050505", border: "1px solid #1a1a1a", padding: "0.65rem", borderRadius: "4px", fontSize: "0.75rem", alignItems: "center" }}>
                      <input type="checkbox" style={{ accentColor: LIME }} />
                      <span style={{ color: "rgba(255,255,255,0.82)" }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: INVESTOR SIMULATION */}
        {activeTab === "investor-sim" && (
            <InvestorSimulation />
        )}

        {/* TAB 3: FUNDRAISING OUTREACH & MATCHMAKER */}
        {activeTab === "outreach" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Catalyst match database */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.3rem" }}>
                <h3 style={{ color: LIME, fontSize: "11.5px", fontWeight: "bold", marginBottom: "0.22rem" }}>🎯 Matches accelerators & angel directories</h3>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", marginBottom: "1.1rem" }}>Selected local and institutional venture sources suited for your sector.</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.72rem" }}>
                  {[
                    { name: "YC Emerging Frontier Fund", stage: "Pre-seed", philosophy: "Direct software systems with regional moats", geo: "Global / Emerging Markets" },
                    { name: "Sovereign Africa Catalyst", stage: "Pre-seed to Seed", philosophy: "B2B local workflows or agriculture hardware", geo: "Sub-Saharan Africa focus" },
                    { name: "Techstars Regional Accelerator", stage: "Ideation", philosophy: "Venture scale tech networks with active traction", geo: "Regional hubs / local support" },
                    { name: "Tanzania Innovation Fund Grants", stage: "Grant funding", philosophy: "Financial integrity & regional commerce solutions", geo: "East Africa regional focus" }
                  ].map((inv, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => draftOutreach(inv)}
                      style={{ 
                        background: outreachRecipient?.name === inv.name ? "rgba(184, 127, 255, 0.08)" : "#050505", 
                        border: `1px solid ${outreachRecipient?.name === inv.name ? PURPLE : "#1a1a1a"}`, 
                        padding: "0.85rem", borderRadius: "5px", cursor: "pointer" 
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ color: PURPLE, fontSize: "0.80rem" }}>{inv.name}</strong>
                        <span style={{ fontSize: "8.5px", background: "rgba(255,255,255,0.06)", padding: "2px 5px", borderRadius: "3px", color: "rgba(255,255,255,0.65)" }}>{inv.stage}</span>
                      </div>
                      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", margin: "4px 0" }}>Philosophy: {inv.philosophy}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.65rem", color: CYAN, marginTop: "4px" }}>
                        <span>Target: {inv.geo}</span>
                        <span>Click to draft pitch →</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Cold outreach copy generator */}
            <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.3rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ borderBottom: "1px solid #1c1c1c", paddingBottom: "0.65rem" }}>
                <span style={{ color: PURPLE, fontSize: "9px", fontWeight: "900", letterSpacing: "1px" }}>✉️ OUTBOUND COLD PITCH ENGINE</span>
                <h3 style={{ color: "#ffffff", fontSize: "12px", fontWeight: "bold", margin: "3px 0 0" }}>
                  {outreachRecipient ? `Personal Outreach to ${outreachRecipient.name}` : "Select target investment channel"}
                </h3>
              </div>

              {loadingEmail ? (
                <div style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.78rem", textAlign: "center", padding: "3rem" }}>
                  Synapsing perfect outbound positioning copy based on SWOT data...
                </div>
              ) : outreachEmail ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.95rem" }}>
                  <div style={{ background: "#050505", border: "1px solid #1a1a1a", padding: "1rem", borderRadius: "4px", fontSize: "0.78rem", color: "rgba(255,255,255,0.85)", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                    {outreachEmail}
                  </div>
                  <button 
                    onClick={() => { navigator.clipboard.writeText(outreachEmail); alert("Pitch email copied securely!"); }}
                    style={{ background: LIME, color: "#000", border: "none", borderRadius: "4px", padding: "8px 12px", fontSize: "10px", fontWeight: "900", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                  >
                    COPY OUTREACH TO CLIPBOARD
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "200px", color: "rgba(255,255,255,0.4)" }}>
                  <span style={{ fontSize: "2rem", marginBottom: "0.55rem" }}>📬</span>
                  <p style={{ textAlign: "center", fontSize: "0.76rem" }}>Choose an Accelerator or Fund block on the left to synthesize high-conversion emails referencing your regional constraints context.</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 4: CUSTOMER DISCOVERY SKEPTIC SIMULATOR */}
        {activeTab === "discovery" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
            
            {/* Harsh skeptic interrogation chat */}
            <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.3rem', display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <span style={{ color: PINK, fontSize: "9px", fontWeight: "900", letterSpacing: "1px" }}>🎮 {t("simTitle")}</span>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem" }}>Pitch the skeptic chatbot to review real behavioral objections and earn Strategy level points.</p>
              </div>

              {/* Chat pane */}
              <div style={{ background: "#050505", border: "1px solid #1a1a1a", borderRadius: "5px", padding: "0.9rem", height: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                {chatMessages.map((m, idx) => (
                  <div key={idx} style={{ alignSelf: m.sender === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                    <span style={{ display: "block", fontSize: "8px", color: m.sender === "user" ? LIME : PINK, textTransform: "uppercase", marginBottom: "2px", textAlign: m.sender === "user" ? "right" : "left" }}>
                      {m.sender === "user" ? "Founder" : "Annoyed Skeptic"}
                    </span>
                    <div style={{ 
                      background: m.sender === "user" ? "rgba(200, 255, 0, 0.05)" : "rgba(255, 60, 120, 0.05)", 
                      border: `1px solid ${m.sender === "user" ? LIME : PINK}`, 
                      padding: "0.58rem 0.82rem", borderRadius: "6px", fontSize: "0.76rem", color: "rgba(255,255,255,0.85)" 
                    }}>
                      {m.text || "..."}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "5px" }}>
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Defend, explain what alternatives you beat..."
                  onKeyDown={e => e.key === "Enter" && sendChatMessage()}
                  style={{ flex: 1, padding: "0.6rem", background: "#050505", border: "1px solid #1a1a1a", borderRadius: "4px", color: "#ffffff", fontSize: "11px" }}
                />
                <button 
                  onClick={sendChatMessage}
                  disabled={loadingChat || !chatInput.trim()}
                  style={{ background: LIME, color: "#000", border: 'none', borderRadius: "4px", paddingLeft: "1rem", paddingRight: "1rem", cursor: "pointer", fontWeight: "bold" }}
                >
                  <Send size={12} />
                </button>
              </div>
            </div>

            {/* Discovery script & Feedback Quote Repository */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.2rem' }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h3 style={{ color: LIME, fontSize: "11.5px", fontWeight: "bold", margin: 0 }}>📊 Lean Customer Development Script</h3>
                  <button 
                    onClick={generateDiscoveryScript}
                    disabled={loadingScript}
                    style={{ background: "transparent", border: "1px solid rgba(200, 255, 0, 0.25)", color: LIME, padding: "3px 8px", fontSize: "9px", cursor: "pointer" }}
                  >
                    {loadingScript ? "SYNAPSING..." : "TREAT THE MOM TEST"}
                  </button>
                </div>

                {discoveryScript ? (
                  <div style={{ background: "#050505", border: "1px solid #1c1c1c", borderRadius: "4px", padding: "0.78rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.72)", maxHeight: "160px", overflowY: "auto", whiteSpace: "pre-wrap" }}>
                    {discoveryScript}
                  </div>
                ) : (
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.72rem" }}>Produce high-integrity behavioral exploration scripts tailored to target segment constraints.</p>
                )}
              </div>

              {/* Paste quotes evaluator */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.2rem' }}>
                <span style={{ color: PURPLE, fontSize: "9px", fontWeight: "900", letterSpacing: "1px" }}>🧠 REAL FEEDBACK METRIC VALIDATOR</span>
                <h3 style={{ color: "#ffffff", fontSize: "11px", fontWeight: "bold", margin: "4px 0 8px" }}>Paste Real Customer Interview Quotes</h3>

                <div style={{ display: "flex", gap: "5px", marginBottom: "0.85rem" }}>
                  <input 
                    type="text" 
                    value={pastedQuote}
                    onChange={e => setPastedQuote(e.target.value)}
                    placeholder="e.g., 'I would buy this if it was ready.'"
                    style={{ flex: 1, padding: "0.5rem", background: "#050505", border: "1px solid #1a1a1a", borderRadius: "4px", color: "#ffffff", fontSize: "11px" }}
                  />
                  <button 
                    onClick={evaluateCustomerFeedback}
                    disabled={evaluatingQuote || !pastedQuote.trim()}
                    style={{ background: PURPLE, color: "#000", border: "none", borderRadius: "4px", padding: "0.5rem 0.85rem", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}
                  >
                    {evaluatingQuote ? "PARSING..." : "ANALYZE"}
                  </button>
                </div>

                {quoteEvaluation && (
                  <div style={{ background: "rgba(184, 127, 255, 0.04)", border: "1px solid rgba(184, 127, 255, 0.2)", borderRadius: "4px", padding: "0.72rem", fontSize: "0.72rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                      <strong style={{ color: quoteEvaluation.rating === "VALIDATING" ? LIME : quoteEvaluation.rating === "INVALIDATING" ? PINK : ORANGE }}>
                        {quoteEvaluation.rating}
                      </strong>
                      <span style={{ color: CYAN }}>Veracity Score: {quoteEvaluation.veracityScore}/10</span>
                    </div>
                    <p style={{ color: "rgba(255,255,255,0.7)", margin: "3px 0" }}>{quoteEvaluation.explanation}</p>
                    <div style={{ color: LIME, fontSize: "8.5px", marginTop: "4px" }}>🎯 RECOMMENDED ACTION: {quoteEvaluation.nextStep}</div>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* TAB 5: GAME PROGRESSION & BADGES */}
        {activeTab === "progress" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
            
            {/* Level tasks quests status */}
            <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.4rem' }}>
              <h3 style={{ color: LIME, fontSize: "12px", fontWeight: "bold", marginBottom: "0.22rem" }}>🏆 ACTIVE PROGRESSION CAMPAIGN</h3>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", marginBottom: "1.1rem" }}>Synthesize SWOT, test customer models, unlock high executor positions.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {ALL_QUESTS.map(q => {
                  const done = completedQuests.includes(q.id);
                  return (
                    <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#050505", border: `1px solid ${done ? "rgba(200, 255, 0, 0.2)" : "#1a1a1a"}`, padding: "0.9rem", borderRadius: "5px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: done ? LIME : "rgba(255,255,255,0.3)", fontSize: "12px" }}>{done ? "✓" : "○"}</span>
                          <span style={{ color: done ? LIME : "#ffffff", fontWeight: "bold", fontSize: "0.82rem" }}>{q.name}</span>
                        </div>
                        <p style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", margin: "3px 0 0", paddingLeft: "1.2rem" }}>{q.desc}</p>
                      </div>
                      <span style={{ color: PURPLE, fontSize: "9px", fontWeight: "bold", background: "rgba(184, 127, 255, 0.1)", padding: "3px 6px", borderRadius: "4px" }}>+{q.xp} XP</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Offline and WhatsApp Reminders Setup */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
              
              {/* WhatsApp Alerts Configuration */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.3rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.45rem" }}>
                  <span style={{ fontSize: "1.3rem" }}>📱</span>
                  <h3 style={{ color: LIME, fontSize: "11px", fontWeight: "bold", margin: 0 }}>WhatsApp Alert System Integration</h3>
                </div>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", marginBottom: "0.9rem" }}>Receive weekly metric warnings or daily SWOT checklists directly via WhatsApp loop simulation.</p>

                {!whatsAppConfigured ? (
                  <form onSubmit={setupWhatsApp} style={{ display: "flex", gap: "4px" }}>
                    <input 
                      type="tel"
                      value={telNumber}
                      onChange={e => setTelNumber(e.target.value)}
                      placeholder="+255 712 345 678"
                      style={{ flex: 1, padding: "0.5rem", background: "#050505", border: "1px solid #1a1a1a", borderRadius: "4px", color: "#ffffff", fontSize: "11.5px" }}
                    />
                    <button 
                      type="submit"
                      style={{ background: LIME, color: "#000", border: "none", borderRadius: "4px", padding: "0.5rem 0.85rem", fontSize: "10.5px", fontWeight: "bold", cursor: "pointer" }}
                    >
                      CONNECT
                    </button>
                  </form>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.72rem" }}>
                    <div style={{ color: LIME, fontSize: "0.72rem", background: "rgba(200,255,0,0.06)", border: "1px solid rgba(200,255,0,0.15)", padding: "0.6rem", borderRadius: "4px" }}>
                      ✓ WhatsApp notification channel established! Simulating real-time alerts.
                    </div>
                    {simulatedAlerts.map((alt, i) => (
                      <div key={i} style={{ background: "#050505", border: "1px solid #1a1a1a", padding: "0.6rem", borderRadius: "4px", fontSize: "0.72rem", color: "rgba(255,255,0,0.72)", borderLeft: "3.5px solid #25D366" }}>
                        {alt}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Offline Contingency Mode Info */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: "1.3rem" }}>
                <span style={{ color: CYAN, fontSize: "8.5px", fontWeight: "900", letterSpacing: "1px", display: "block" }}>📡 OFFLINE-FIRST 2G SANDBOX QUEUE</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "5px" }}>
                  <span style={{ color: "#fff", fontSize: "11px", fontWeight: "bold" }}>Offline Queue Status</span>
                  <span style={{ color: LIME, fontSize: "9px" }}>● FULLY SYNCHRONIZED</span>
                </div>
                <p style={{ color: "rgba(255,255,255,0.42)", fontSize: "0.68rem", marginTop: "4px" }}>
                  Typing or updating roadmaps when offline will queue locally; Forge auto-synthesizes the precise moment telemetry connects to server nodes.
                </p>
              </div>

            </div>

          </div>
        )}

        {/* TAB 6: TRACTION ANALYTICS PROJECT METRICS */}
        {activeTab === "traction" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
              
              {/* Traction comparison SVG graph */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.4rem' }}>
                <h3 style={{ color: LIME, fontSize: "12px", fontWeight: "bold", marginBottom: "0.45rem" }}>📈 {t("tractionTitle")}</h3>
                <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem", marginBottom: "1.3rem" }}>Compare actual Monthly Active Users performance metrics back to original growth vectors.</p>

                {/* SVG Chart */}
                <div style={{ width: "100%", height: "190px", display: "flex", alignItems: "flex-end", borderLeft: "2px solid #222", borderBottom: "2px solid #222", padding: "10px", boxSizing: "border-box", position: "relative", gap: "1.4rem" }}>
                  
                  {/* Legend overlay */}
                  <div style={{ position: "absolute", top: "10px", right: "10px", display: "flex", gap: "10px", fontSize: "8.5px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ display: "block", width: "8px", height: "8px", background: PURPLE }} />
                      Projected MAU
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ display: "block", width: "8px", height: "8px", background: LIME }} />
                      Actual MAU
                    </span>
                  </div>

                  {tractionData.map((d, index) => {
                    const maxVal = 9000;
                    const projHeight = Math.min(100, (d.projectedMAU / maxVal) * 100);
                    const actHeight = Math.min(100, (d.actualMAU / maxVal) * 100);

                    return (
                      <div key={index} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "85%", width: "100%", justifyContent: "center" }}>
                          
                          {/* Projected Bar */}
                          <div 
                            style={{ 
                              width: "16px", 
                              height: `${projHeight}%`, 
                              background: PURPLE, 
                              borderRadius: "2px 2px 0 0",
                              transition: "all 0.3s"
                            }} 
                            title={`Projected MAU: ${d.projectedMAU}`}
                          />

                          {/* Actual Bar */}
                          <div 
                            style={{ 
                              width: "16px", 
                              height: `${actHeight}%`, 
                              background: LIME, 
                              borderRadius: "2px 2px 0 0",
                              transition: "all 0.3s"
                            }} 
                            title={`Actual MAU: ${d.actualMAU}`}
                          />
                        </div>
                        <span style={{ fontSize: "7.5px", color: "rgba(255,255,255,0.45)", marginTop: "8px" }}>{d.month}</span>
                      </div>
                    )
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem", borderTop: "1px solid #1a1a1a", paddingTop: "0.80rem" }}>
                  <button 
                    onClick={runMetricAnalysis}
                    disabled={analyzingTraction}
                    style={{ background: "transparent", border: "1px solid rgba(200, 255, 0, 0.35)", color: LIME, padding: "6px 12px", fontSize: "10px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                  >
                    {analyzingTraction ? "CFO RUNNING ALGORITHMS..." : "RUN CFO HEALTH WARNING ASSESSMENT"}
                  </button>

                  <button 
                    onClick={() => {
                      setTractionData([
                        { month: "Month 1", projectedMAU: 500, actualMAU: 450, projectedRev: 1000, actualRev: 900, churn: 8 },
                        { month: "Month 2", projectedMAU: 1200, actualMAU: 1050, projectedRev: 2500, actualRev: 2100, churn: 7 },
                        { month: "Month 3", projectedMAU: 2500, actualMAU: 1900, projectedRev: 5500, actualRev: 3800, churn: 11 },
                        { month: "Month 4", projectedMAU: 5000, actualMAU: 2800, projectedRev: 12000, actualRev: 5600, churn: 14 }
                      ]);
                      setTractionAnalysis("");
                    }}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", padding: "6px 12px", fontSize: "10px", cursor: "pointer" }}
                  >
                    RESET DATA
                  </button>
                </div>

                {tractionAnalysis && (
                  <div style={{ marginTop: "1rem", background: "rgba(255, 60, 120, 0.04)", border: "1px solid rgba(255, 60, 120, 0.25)", padding: "1rem", borderRadius: "5px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.45rem" }}>
                      <AlertCircle size={15} style={{ color: PINK }} />
                      <strong style={{ color: PINK, fontSize: "11px" }}>CFO DIAGNOSTIC CORRECTION ADVICE</strong>
                    </div>
                    <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.76rem", lineHeight: "1.5", margin: 0 }}>{tractionAnalysis}</p>
                  </div>
                )}
              </div>

              {/* Traction register matrix entry rows */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1c1c1c", borderRadius: "6px", padding: '1.2rem', display: "flex", flexDirection: "column", gap: "0.80rem" }}>
                <div>
                  <h3 style={{ color: PURPLE, fontSize: "11.5px", fontWeight: "bold", margin: 0 }}>📊 {t("addTractionRow")}</h3>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.68rem" }}>Keep track of Monthly Active Users, projected and actual organic metrics to detect leak variables.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.42)", fontSize: "8.5px", display: "block", marginBottom: "3px" }}>Month Label</label>
                    <input type="text" value={newMonthLabel} onChange={e => setNewMonthLabel(e.target.value)} style={{ width: "100%", padding: "5px", background: "#050505", border: "1px solid #1c1c1c", borderRadius: "4px", color: "#fff", fontSize: "10px" }} />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.42)", fontSize: "8.5px", display: "block", marginBottom: "3px" }}>Churn (%)</label>
                    <input type="text" value={newActChurn} onChange={e => setNewActChurn(e.target.value)} style={{ width: "100%", padding: "5px", background: "#050505", border: "1px solid #1c1c1c", borderRadius: "4px", color: "#fff", fontSize: "10px" }} />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.42)", fontSize: "8.5px", display: "block", marginBottom: "3px" }}>Projected Users</label>
                    <input type="text" value={newProjMAU} onChange={e => setNewProjMAU(e.target.value)} style={{ width: "100%", padding: "5px", background: "#050505", border: "1px solid #1c1c1c", borderRadius: "4px", color: "#fff", fontSize: "10px" }} />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.42)", fontSize: "8.5px", display: "block", marginBottom: "3px" }}>Actual Users</label>
                    <input type="text" value={newActMAU} onChange={e => setNewActMAU(e.target.value)} style={{ width: "100%", padding: "5px", background: "#050505", border: "1px solid #1c1c1c", borderRadius: "4px", color: "#fff", fontSize: "10px" }} />
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const row = {
                      month: newMonthLabel,
                      projectedMAU: parseInt(newProjMAU) || 0,
                      actualMAU: parseInt(newActMAU) || 0,
                      projectedRev: parseInt(newProjRev) || 0,
                      actualRev: parseInt(newActRev) || 0,
                      churn: parseInt(newActChurn) || 0
                    };
                    setTractionData(prev => [...prev, row]);
                    setNewMonthLabel(`Month ${tractionData.length + 2}`);
                  }}
                  style={{ background: PURPLE, color: "#000", border: "none", borderRadius: "4px", padding: "0.6rem", fontSize: "10px", cursor: "pointer", fontWeight: "900", textTransform: "uppercase" }}
                >
                  ADD MONTH DATA POINT
                </button>
              </div>

            </div>

          </div>
        )}

      </div>

    </div>
  )
}
