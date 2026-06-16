import React, { useState } from "react";
import { MapPin } from "lucide-react";

export default function LocationSelector({ onLocationSelect }) {
  const [city, setCity] = useState("");
  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
      <h3 className="text-lime-400 font-bold mb-2 flex items-center gap-2"><MapPin size={16} />Set Location Context</h3>
      <input 
        value={city} 
        onChange={(e) => setCity(e.target.value)} 
        placeholder="Enter your city/country..." 
        className="w-full p-2 bg-zinc-950 border border-zinc-700 rounded text-sm text-white" 
      />
      <button 
        onClick={() => onLocationSelect(city)} 
        className="mt-2 w-full p-2 bg-lime-400 text-black font-bold rounded text-sm"
      >
        Update Context
      </button>
    </div>
  );
}
