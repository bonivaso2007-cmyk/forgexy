import React, { useState, useEffect } from "react";
import { Command, BrainCircuit, Rocket, LayoutDashboard, FileText, Zap } from "lucide-react";

export default function CommandPalette({ isOpen, onClose, navigateTo }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
      <div className="bg-zinc-900/90 border border-zinc-700 rounded-2xl w-full max-w-lg shadow-2xl glass p-2 backdrop-blur-md">
        <input 
          autoFocus 
          className="w-full p-4 bg-transparent border-b border-zinc-700 text-white outline-none" 
          placeholder="Search tools (e.g. War Room, Pitch Deck)..." 
        />
        <div className="py-2">
            <button onClick={() => { navigateTo("co-pilot"); onClose(); }} className="w-full flex items-center gap-2 text-left p-3 hover:bg-zinc-800/50 text-zinc-300 text-sm rounded-lg"><LayoutDashboard size={16}/> Dashboard</button>
            <button onClick={() => { navigateTo("war-room"); onClose(); }} className="w-full flex items-center gap-2 text-left p-3 hover:bg-zinc-800/50 text-zinc-300 text-sm rounded-lg"><BrainCircuit size={16}/> War Room</button>
            <button onClick={() => { navigateTo("pitch-deck"); onClose(); }} className="w-full flex items-center gap-2 text-left p-3 hover:bg-zinc-800/50 text-zinc-300 text-sm rounded-lg"><Rocket size={16}/> Pitch Deck</button>
            <button onClick={() => { navigateTo("investor-sim"); onClose(); }} className="w-full flex items-center gap-2 text-left p-3 hover:bg-zinc-800/50 text-zinc-300 text-sm rounded-lg"><Zap size={16}/> Investor Simulation</button>
            <button onClick={onClose} className="w-full flex items-center gap-2 text-left p-3 hover:bg-zinc-800/50 text-red-400 text-sm rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
}
