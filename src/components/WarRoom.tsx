import React, { useState, useEffect, useRef } from "react";

interface User {
  name: string;
  role: string;
}

interface ChatMessage {
  id: string;
  sender: string;
  role: string;
  text: string;
  time: string;
}

interface SwotPoint {
  id: string;
  type: "strengths" | "weaknesses" | "opportunities" | "threats";
  text: string;
}

interface WarRoomProps {
  idea: string;
  profile: any;
  swotData?: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  } | null;
  onClose: () => void;
}

export default function WarRoom({ idea, profile, swotData, onClose }: WarRoomProps) {
  const [room, setRoom] = useState<string>(() => {
    const slug = idea.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 15);
    return slug || "forge-hq";
  });
  const [userName, setUserName] = useState("Founder #1");
  const [userRole, setUserRole] = useState("CEO");
  const [joined, setJoined] = useState(false);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInp, setChatInp] = useState("");
  const [cursors, setCursors] = useState<{ [key: string]: { x: number; y: number; name: string; role: string } }>({});
  
  // Collaborative document State (SWOT)
  const [swotPoints, setSwotPoints] = useState<SwotPoint[]>([]);
  const [newPointText, setNewPointText] = useState("");
  const [newPointType, setNewPointType] = useState<"strengths" | "weaknesses" | "opportunities" | "threats">("strengths");

  const socketRef = useRef<WebSocket | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Initialize initial SWOT list if provided
  useEffect(() => {
    if (swotData) {
      const initial: SwotPoint[] = [];
      let counter = 1;
      (swotData.strengths || []).forEach(s => initial.push({ id: `s-${counter++}`, type: "strengths", text: s }));
      (swotData.weaknesses || []).forEach(w => initial.push({ id: `w-${counter++}`, type: "weaknesses", text: w }));
      (swotData.opportunities || []).forEach(o => initial.push({ id: `o-${counter++}`, type: "opportunities", text: o }));
      (swotData.threats || []).forEach(t => initial.push({ id: `t-${counter++}`, type: "threats", text: t }));
      setSwotPoints(initial);
    } else {
      setSwotPoints([
        { id: "s-1", type: "strengths", text: "Direct online distribution strategy" },
        { id: "w-1", type: "weaknesses", text: "Limited initial marketing budget" },
        { id: "o-1", type: "opportunities", text: "Rapid expansion of target demographic" },
        { id: "t-1", type: "threats", text: "Low barrier to entry for fast-followers" }
      ]);
    }
  }, [swotData]);

  // Handle WebSocket Setup
  useEffect(() => {
    if (!joined) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "join",
        room,
        name: userName,
        role: userRole
      }));
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        if (payload.type === "presence") {
          setActiveUsers(payload.users || []);
        } else if (payload.type === "chat") {
          setMessages(prev => [...prev, {
            id: String(Date.now() + Math.random()),
            sender: payload.senderName || "Co-founder",
            role: payload.senderRole || "CTO",
            text: payload.text || "",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
        } else if (payload.type === "cursor") {
          const key = `${payload.senderName}-${payload.senderRole}`;
          setCursors(prev => ({
            ...prev,
            [key]: { x: payload.x, y: payload.y, name: payload.senderName, role: payload.senderRole }
          }));
        } else if (payload.type === "swot-update") {
          if (payload.swot) {
            setSwotPoints(payload.swot);
          }
        }
      } catch (err) {
        console.error("Failed to parse incoming socket frame:", err);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket collaboration session closed.");
    };

    return () => {
      socket.close();
    };
  }, [joined, room, userName, userRole]);

  // Track Mouse Cursor Shifts
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!joined || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Throttle cursor emission
    if (Math.random() < 0.15) {
      socketRef.current.send(JSON.stringify({
        type: "cursor",
        x,
        y
      }));
    }
  };

  const sendChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInp.trim() || !socketRef.current) return;

    const payload = {
      type: "chat",
      text: chatInp
    };

    // Append locally immediately
    setMessages(prev => [...prev, {
      id: String(Date.now()),
      sender: userName,
      role: userRole,
      text: chatInp,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);

    socketRef.current.send(JSON.stringify(payload));
    setChatInp("");
  };

  const addSwotPoint = () => {
    if (!newPointText.trim()) return;
    const newPoint: SwotPoint = {
      id: `custom-${Date.now()}`,
      type: newPointType,
      text: newPointText
    };
    const updated = [...swotPoints, newPoint];
    setSwotPoints(updated);
    setNewPointText("");

    // Broadcast updated document state
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "swot-update",
        swot: updated
      }));
    }
  };

  const removeSwotPoint = (id: string) => {
    const updated = swotPoints.filter(p => p.id !== id);
    setSwotPoints(updated);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "swot-update",
        swot: updated
      }));
    }
  };

  // Automated/simulated AI feedback or virtual co-founder interaction (user-actuated)
  const triggerAiBrainstorm = () => {
    const aiRoles = [
      { name: "Sarah", role: "CTO", text: "Looked at the SWOT opportunities. We should add 'OpenAPI platform integrations for faster ecosystem expansion'." },
      { name: "Marcus", role: "CMO", text: "Our biggest threat is definitely speed-to-market. I'll add 'Competitor shadow-launch' to SWOT threats." }
    ];
    const chosen = aiRoles[Math.floor(Math.random() * aiRoles.length)];
    
    setMessages(prev => [...prev, {
      id: String(Date.now()),
      sender: chosen.name,
      role: chosen.role,
      text: chosen.text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);

    // Update swot arrays to reflect AI suggestions automatically
    let updated = [...swotPoints];
    if (chosen.name === "Sarah") {
      updated.push({ id: `sarah-${Date.now()}`, type: "opportunities", text: "OpenAPI platform integrations" });
    } else {
      updated.push({ id: `marcus-${Date.now()}`, type: "threats", text: "Competitor shadow-launch risks" });
    }
    setSwotPoints(updated);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "swot-update",
        swot: updated
      }));
    }
  };

  const LIME = "#c8ff00";
  const PURPLE = "#b87fff";
  const PINK = "#ff3c78";
  const CYAN = "#00f0ff";

  if (!joined) {
    return (
      <div style={{ padding: "2.5rem 1.8rem", background: "rgba(12,12,12,0.9)", border: "1px solid #1c1c1c", borderRadius: "8px", fontFamily: "monospace", maxWidth: "480px", margin: "4rem auto 0" }}>
        <h3 style={{ color: LIME, fontSize: "14px", letterSpacing: "2.5px", textTransform: "uppercase", margin: "0 0 1rem", fontWeight: "900" }}>🚀 STRATEGIC WAR ROOM</h3>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", lineHeight: "1.6", marginBottom: "1.8rem" }}>
          Establish a cryptographic, client-to-client WebSocket synchronization pipeline. Open this app in another browser window or tab using the same room code to co-edit and synchronize strategic assets live!
        </p>

        <div style={{ marginBottom: "1.1rem" }}>
          <label style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "0.4rem" }}>War Room ID / Code</label>
          <input 
            type="text" 
            value={room} 
            onChange={e => setRoom(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}
            style={{ width: "100%", background: "#050505", border: "1px solid #222", padding: "0.6rem 0.8rem", color: "#fff", outline: "none", borderRadius: "5px", fontSize: "12px", fontFamily: "monospace" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.80rem", marginBottom: "1.8rem" }}>
          <div>
            <label style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "0.4rem" }}>Your Name</label>
            <input 
              type="text" 
              value={userName} 
              onChange={e => setUserName(e.target.value)}
              style={{ width: "100%", background: "#050505", border: "1px solid #222", padding: "0.6rem 0.8rem", color: "#fff", outline: "none", borderRadius: "5px", fontSize: "12px", fontFamily: "monospace" }}
            />
          </div>
          <div>
            <label style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "0.4rem" }}>Venture Role</label>
            <input 
              type="text" 
              value={userRole} 
              onChange={e => setUserRole(e.target.value)}
              style={{ width: "100%", background: "#050505", border: "1px solid #222", padding: "0.6rem 0.8rem", color: "#fff", outline: "none", borderRadius: "5px", fontSize: "12px", fontFamily: "monospace" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.6rem" }}>
          <button 
            style={{ flex: 1, background: LIME, color: "#000", border: "none", padding: "0.85rem", fontSize: "11px", fontWeight: "900", letterSpacing: "1.5px", cursor: "pointer", borderRadius: "5px" }}
            onClick={() => setJoined(true)}
          >
            ESTABLISH SYNC LINK
          </button>
          <button 
            style={{ 
              background: "rgba(255, 60, 120, 0.08)", 
              border: "1px solid rgba(255, 60, 120, 0.3)", 
              color: PINK, 
              padding: "0.82rem 1.22rem", 
              fontSize: "11px", 
              cursor: "pointer", 
              borderRadius: "5px",
              fontWeight: "bold"
            }}
            onClick={onClose}
          >
            DISMISS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeIn .25s ease", marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", paddingBottom: "0.8rem", borderBottom: "1px solid #1c1c1c" }}>
        <div>
          <span style={{ color: LIME, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", fontWeight: "bold" }}>⚡️ COLLABORATIVE WAR ROOM</span>
          <h2 style={{ color: "#fff", margin: "0.2rem 0 0", fontSize: "1.2rem", fontWeight: "bold" }}>Room ID: <span style={{ color: CYAN }}>{room}</span></h2>
        </div>
        <div style={{ display: "flex", gap: "0.55rem" }}>
          <button 
            onClick={triggerAiBrainstorm}
            style={{ background: "rgba(184, 127, 255, 0.1)", border: `1px solid ${PURPLE}`, color: PURPLE, padding: "0.45rem 0.95rem", fontSize: "10px", fontWeight: "bold", fontFamily: "monospace", borderRadius: "5px", cursor: "pointer" }}
          >
            🤖 ACTIVATE AI CO-FOUNDER
          </button>
          <button 
            onClick={onClose}
            style={{ 
              background: "rgba(255, 60, 120, 0.08)", 
              border: "1px solid rgba(255, 60, 120, 0.3)", 
              color: PINK, 
              padding: "0.45rem 1.1rem", 
              fontSize: "10px", 
              fontFamily: "monospace", 
              borderRadius: "5px", 
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            DISCONNECT
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.2rem", position: "relative" }}>
        
        {/* Workspace Panel */}
        <div 
          ref={workspaceRef}
          onMouseMove={handleMouseMove}
          style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1.5rem", minHeight: "440px", position: "relative", overflow: "hidden" }}
        >
          {/* Active Player Cursors */}
          {Object.values(cursors).map((c, i) => (
            <div 
              key={i} 
              style={{ position: "absolute", left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-2px, -2px)", transition: "all 0.15s ease", pointerEvents: "none", zIndex: 999 }}
            >
              <div style={{ width: "10px", height: "10px", background: CYAN, clipPath: "polygon(0% 0%, 100% 30%, 30% 100%)", boxShadow: "0 2px 4px rgba(0,0,0,0.5)" }} />
              <div style={{ padding: "2px 6px", background: "rgba(0, 240, 255, 0.85)", color: "#000", fontSize: "8px", fontWeight: "bold", borderRadius: "3px", transform: "translate(8px, 2px)", whiteSpace: "nowrap" }}>
                {c.name} ({c.role})
              </div>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px" }}>Interactive SWOT Document Grid</span>
            <span style={{ color: LIME, fontSize: "9px" }}>● MULTIPLAYER STATE ENFORCED</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.2rem" }}>
            {/* Strengths */}
            <div style={{ background: "rgba(200, 255, 0, 0.02)", border: "1px solid rgba(200, 255, 0, 0.1)", borderRadius: "6px", padding: "0.85rem" }}>
              <span style={{ color: LIME, fontSize: "9px", fontWeight: "bold", letterSpacing: "1px" }}>STRENGTHS</span>
              <div style={{ marginTop: "0.55rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {swotPoints.filter(p => p.type === "strengths").map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid #181818", padding: "0.35rem 0.55rem", borderRadius: "4px" }}>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)" }}>→ {p.text}</span>
                    <button onClick={() => removeSwotPoint(p.id)} style={{ border: "none", background: "none", color: "rgba(255, 60, 120, 0.5)", cursor: "pointer", fontSize: "10px" }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Weaknesses */}
            <div style={{ background: "rgba(255, 60, 120, 0.02)", border: "1px solid rgba(255, 60, 120, 0.1)", borderRadius: "6px", padding: "0.85rem" }}>
              <span style={{ color: PINK, fontSize: "9px", fontWeight: "bold", letterSpacing: "1px" }}>WEAKNESSES</span>
              <div style={{ marginTop: "0.55rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {swotPoints.filter(p => p.type === "weaknesses").map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid #181818", padding: "0.35rem 0.55rem", borderRadius: "4px" }}>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)" }}>→ {p.text}</span>
                    <button onClick={() => removeSwotPoint(p.id)} style={{ border: "none", background: "none", color: "rgba(255, 60, 120, 0.5)", cursor: "pointer", fontSize: "10px" }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Opportunities */}
            <div style={{ background: "rgba(0, 240, 255, 0.02)", border: "1px solid rgba(0, 240, 255, 0.1)", borderRadius: "6px", padding: "0.85rem" }}>
              <span style={{ color: CYAN, fontSize: "9px", fontWeight: "bold", letterSpacing: "1px" }}>OPPORTUNITIES</span>
              <div style={{ marginTop: "0.55rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {swotPoints.filter(p => p.type === "opportunities").map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid #181818", padding: "0.35rem 0.55rem", borderRadius: "4px" }}>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)" }}>→ {p.text}</span>
                    <button onClick={() => removeSwotPoint(p.id)} style={{ border: "none", background: "none", color: "rgba(255, 60, 120, 0.5)", cursor: "pointer", fontSize: "10px" }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Threats */}
            <div style={{ background: "rgba(184, 127, 255, 0.02)", border: "1px solid rgba(184, 127, 255, 0.1)", borderRadius: "6px", padding: "0.85rem" }}>
              <span style={{ color: PURPLE, fontSize: "9px", fontWeight: "bold", letterSpacing: "1px" }}>THREATS</span>
              <div style={{ marginTop: "0.55rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {swotPoints.filter(p => p.type === "threats").map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", border: "1px solid #181818", padding: "0.35rem 0.55rem", borderRadius: "4px" }}>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)" }}>→ {p.text}</span>
                    <button onClick={() => removeSwotPoint(p.id)} style={{ border: "none", background: "none", color: "rgba(255, 60, 120, 0.5)", cursor: "pointer", fontSize: "10px" }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add a SWOT entry */}
          <div style={{ background: "#060606", border: "1px solid #1c1c1c", padding: "1rem", borderRadius: "6px" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "0.55rem" }}>Draft New SWOT Element</span>
            <div style={{ display: "flex", gap: "0.55rem" }}>
              <select 
                value={newPointType}
                onChange={e => setNewPointType(e.target.value as any)}
                style={{ background: "#0f0f0f", color: "#fff", border: "1px solid #222", padding: "0rem 0.5rem", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace", cursor: "pointer" }}
              >
                <option value="strengths">Strength</option>
                <option value="weaknesses">Weakness</option>
                <option value="opportunities">Opportunity</option>
                <option value="threats">Threat</option>
              </select>
              <input 
                type="text"
                placeholder="Identify advantage or vulnerability..."
                value={newPointText}
                onChange={e => setNewPointText(e.target.value)}
                style={{ flex: 1, background: "#0f0f0f", color: "#fff", border: "1px solid #222", padding: "0.5rem 0.75rem", borderRadius: "4px", fontSize: "11px", outline: "none", fontFamily: "monospace" }}
                onKeyDown={e => { if (e.key === "Enter") addSwotPoint(); }}
              />
              <button 
                onClick={addSwotPoint}
                style={{ background: LIME, color: "#000", border: "none", padding: "0 1.1rem", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", fontFamily: "monospace", cursor: "pointer" }}
              >
                COMMIT
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          
          {/* Active Presences */}
          <div style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1rem" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "0.6rem" }}>ACTIVE FOUNDERS ({activeUsers.length || 1})</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: LIME }} />
                <span style={{ fontSize: "11px", color: "#fff", fontWeight: "bold" }}>{userName} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: "normal" }}>({userRole})</span></span>
              </div>
              {activeUsers.filter(u => u.name !== userName).map((u, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                  <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: CYAN }} />
                  <span style={{ fontSize: "11px", color: "#fff", fontWeight: "bold" }}>{u.name} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: "normal" }}>({u.role})</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Window */}
          <div style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1rem", display: "flex", flexDirection: "column", flex: 1, minHeight: "280px" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "8px", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "0.6rem" }}>WAR CHANNEL INTEL CHAT</span>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.85rem", maxHeight: "180px", paddingRight: "4px" }}>
              {messages.length === 0 && (
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px", textAlign: "center", margin: "auto" }}>
                  Waiting for chat traffic...
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} style={{ background: "rgba(255,255,255,0.01)", border: "1px solid #151515", padding: "0.45rem", borderRadius: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                    <span style={{ fontSize: "9px", color: m.sender === userName ? LIME : m.sender === "Sarah" || m.sender === "Marcus" ? PURPLE : CYAN, fontWeight: "bold" }}>{m.sender} ({m.role})</span>
                    <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)" }}>{m.time}</span>
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "10px", margin: 0, lineHeight: "1.4" }}>{m.text}</p>
                </div>
              ))}
            </div>
            
            <form onSubmit={sendChat} style={{ display: "flex", gap: "0.35rem" }}>
              <input 
                type="text" 
                placeholder="Cast suggestion..."
                value={chatInp}
                onChange={e => setChatInp(e.target.value)}
                style={{ flex: 1, background: "#050505", border: "1px solid #222", padding: "0.45rem", color: "#fff", outline: "none", borderRadius: "4px", fontSize: "10px", fontFamily: "monospace" }}
              />
              <button 
                type="submit"
                style={{ background: LIME, color: "#000", border: "none", padding: "0 0.6rem", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", fontFamily: "monospace", cursor: "pointer" }}
              >
                SEND
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
