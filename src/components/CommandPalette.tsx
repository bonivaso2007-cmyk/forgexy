import React, { useState, useEffect, useRef, useCallback } from "react";

const LIME = "#C8FF00";
const PINK = "#FF3C78";
const PURPLE = "#B87FFF";
const CYAN = "#00FFFF";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: string;
  category: "navigation" | "tools" | "ideas" | "actions";
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  ideas: Array<{ id: string; text: string; score?: number; label?: string }>;
  onLoadIdea: (idea: any) => void;
  onNavigate: (path: string) => void;
  onOpenTool: (tool: string) => void;
  onIntelQuery: (query: string) => void;
  onNewIdea: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  ideas,
  onLoadIdea,
  onNavigate,
  onOpenTool,
  onIntelQuery,
  onNewIdea
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build commands list
  const commands: Command[] = [
    // Actions
    { id: "new-idea", label: "Start New Idea", shortcut: "N", icon: "💡", category: "actions", action: () => { onNewIdea(); onClose(); } },
    { id: "intel-search", label: "Search Market Intel...", shortcut: "I", icon: "🔍", category: "actions", action: () => { onIntelQuery(query); onClose(); } },

    // Tools
    { id: "tool-warroom", label: "Open War Room", icon: "🤝", category: "tools", action: () => { onOpenTool("warroom"); onClose(); } },
    { id: "tool-pitch", label: "Open Pitch Deck Simulator", icon: "🎨", category: "tools", action: () => { onOpenTool("pitchdeck"); onClose(); } },
    { id: "tool-landscape", label: "Open Market Landscape", icon: "🗺️", category: "tools", action: () => { onOpenTool("landscape"); onClose(); } },
    { id: "tool-runway", label: "Open Runway Sandbox", icon: "📊", category: "tools", action: () => { onOpenTool("runway"); onClose(); } },
    { id: "tool-investor", label: "Practice Investor Pitch", icon: "🎤", category: "tools", action: () => { onOpenTool("investor"); onClose(); } },
    { id: "tool-sentinel", label: "Open Venture Sentinel", icon: "🌌", category: "tools", action: () => { onOpenTool("sentinel"); onClose(); } },
    { id: "tool-cofounder", label: "Open Co-Pilot Command Deck", icon: "🛰️", category: "tools", action: () => { onOpenTool("cofounder"); onClose(); } },

    // Navigation
    { id: "nav-profile", label: "Open Profile", icon: "👤", category: "navigation", action: () => { onNavigate("profile"); onClose(); } },
    { id: "nav-vault", label: "Open Idea Vault", icon: "📁", category: "navigation", action: () => { onNavigate("vault"); onClose(); } },
  ];

  // Add saved ideas as commands
  ideas.slice(0, 5).forEach((idea, i) => {
    commands.push({
      id: `idea-${idea.id}`,
      label: `Load: "${idea.text.slice(0, 40)}${idea.text.length > 40 ? "..." : ""}"`,
      icon: "💡",
      category: "ideas",
      action: () => { onLoadIdea(idea); onClose(); }
    });
  });

  // Filter commands based on query
  const filteredCommands = query.trim()
    ? commands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
        break;
      case "Escape":
        onClose();
        break;
    }
  }, [filteredCommands, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const selected = listRef.current?.children[selectedIndex] as HTMLElement;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const categoryLabel = (cat: string) => {
    switch (cat) {
      case "actions": return "ACTIONS";
      case "tools": return "TOOLS";
      case "navigation": return "NAVIGATION";
      case "ideas": return "SAVED IDEAS";
      default: return cat.toUpperCase();
    }
  };

  let lastCategory = "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        fontFamily: "monospace"
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        style={{
          width: "100%",
          maxWidth: "580px",
          background: "#0a0a0a",
          border: "1px solid #1c1c1c",
          borderRadius: "12px",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)",
          overflow: "hidden",
          animation: "slideDown 0.15s ease-out"
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid #1c1c1c"
        }}>
          <span style={{ color: LIME, fontSize: "1.1rem" }}>⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tools, ideas, or type a query..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "#fff",
              fontSize: "1rem",
              outline: "none",
              fontFamily: "monospace"
            }}
          />
          <span style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: "0.75rem",
            padding: "4px 8px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "4px",
            border: "1px solid rgba(255,255,255,0.1)"
          }}>ESC</span>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            maxHeight: "380px",
            overflowY: "auto",
            padding: "0.5rem 0.75rem"
          }}
        >
          {filteredCommands.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🔍</div>
              No results found
            </div>
          ) : (
            filteredCommands.map((cmd, i) => {
              const showCategoryHeader = cmd.category !== lastCategory;
              if (showCategoryHeader) lastCategory = cmd.category;

              return (
                <div key={cmd.id}>
                  {showCategoryHeader && (
                    <div style={{
                      color: "rgba(255,255,255,0.35)",
                      fontSize: "0.65rem",
                      letterSpacing: "2px",
                      padding: "0.75rem 0.5rem 0.35rem",
                      fontWeight: "bold"
                    }}>
                      {categoryLabel(cmd.category)}
                    </div>
                  )}
                  <div
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.65rem 0.75rem",
                      borderRadius: "6px",
                      cursor: "pointer",
                      background: i === selectedIndex ? "rgba(200, 255, 0, 0.08)" : "transparent",
                      border: `1px solid ${i === selectedIndex ? "rgba(200, 255, 0, 0.2)" : "transparent"}`,
                      transition: "all 0.1s"
                    }}
                  >
                    <span style={{ fontSize: "1rem" }}>{cmd.icon}</span>
                    <span style={{
                      flex: 1,
                      color: i === selectedIndex ? "#fff" : "rgba(255,255,255,0.7)",
                      fontSize: "0.85rem"
                    }}>
                      {cmd.label}
                    </span>
                    {cmd.shortcut && (
                      <span style={{
                        color: "rgba(255,255,255,0.3)",
                        fontSize: "0.7rem",
                        padding: "2px 6px",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: "3px"
                      }}>
                        {cmd.shortcut}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderTop: "1px solid #1c1c1c",
          color: "rgba(255,255,255,0.25)",
          fontSize: "0.7rem"
        }}>
          <span>↑↓ to navigate · Enter to select</span>
          <span style={{ color: LIME, opacity: 0.7 }}>FORGE COMMAND PALETTE</span>
        </div>
      </div>
    </div>
  );
}
