import React, { useState } from "react";

interface RunwayProps {
  idea: string;
  onClose: () => void;
}

export default function RunwaySandbox({ idea, onClose }: RunwayProps) {
  // Live control knobs
  const [cash, setCash] = useState(150000); // Initial Capital Reserves
  const [fixedBurn, setFixedBurn] = useState(12000); // Fixed monthly burn
  const [cogs, setCogs] = useState(25); // Cost of Goods sold (Margins)
  const [avgTicket, setAvgTicket] = useState(150); // Transaction order value
  const [volume, setVolume] = useState(120); // Monthly transactions
  const [headcount, setHeadcount] = useState(2); // Team size (each employee adds $8500 burden)

  // Calculations
  const averageHourlyBurden = 8500;
  const totalMonthlyBurn = fixedBurn + (headcount * averageHourlyBurden);
  const revenuePerUnit = avgTicket;
  const marginPerUnit = revenuePerUnit * (1 - cogs / 100);
  
  const monthlyGrossRevenue = volume * revenuePerUnit;
  const monthlyTotalMargins = volume * marginPerUnit;
  
  const monthlyNetProfitLoss = monthlyTotalMargins - totalMonthlyBurn;
  
  // Break-even transaction count
  const breakEvenVolume = marginPerUnit > 0 ? Math.ceil(totalMonthlyBurn / marginPerUnit) : 0;
  
  // Cash depletion calculation (12 Months Trajectory analysis)
  const trajectory: number[] = [];
  let tempCash = cash;
  let deathMonth: number | null = null;

  for (let m = 0; m <= 12; m++) {
    trajectory.push(tempCash);
    if (tempCash <= 0 && deathMonth === null) {
      deathMonth = m;
    }
    tempCash += monthlyNetProfitLoss;
  }

  const isProfitable = monthlyNetProfitLoss > 0;
  const monthsOfSurvival = isProfitable ? "∞ Profitable" : 
                            monthlyNetProfitLoss === 0 ? "Infinite Break-Even" : 
                            deathMonth !== null ? `${deathMonth} Months` : "0 Months";

  // Auto-generate helper to parse numeric amounts for neat readouts
  const formatUSD = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
  };

  const LIME = "#c8ff00";
  const PURPLE = "#b87fff";
  const PINK = "#ff3c78";
  const CYAN = "#00f0ff";

  // Build points string for SVG cash trajectory height mapping
  const maxVal = Math.max(...trajectory, cash, 10000);
  const minVal = Math.min(...trajectory, 0);
  const valSpan = (maxVal - minVal) || 1;

  const svgPoints = trajectory.map((val, idx) => {
    const x = 10 + (idx / 12) * 80;
    const y = 80 - ((val - minVal) / valSpan) * 65;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{ animation: "fadeIn .25s ease", marginTop: "1rem" }}>
      
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", paddingBottom: "0.8rem", borderBottom: "1px solid #1c1c1c" }}>
        <div>
          <span style={{ color: LIME, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", fontWeight: "bold" }}>📊 VENTURE CAPITAL RUNWAY SANDBOX</span>
          <h2 style={{ color: "#fff", margin: "0.2rem 0 0", fontSize: "1.2rem", fontWeight: "bold" }}>Financial Trajectory & COGS Sandbox</h2>
        </div>
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
          CLOSE ENGINE
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1rem" }}>
        
        {/* Sliders Panel */}
        <div style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1.5rem" }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "1.25rem" }}>Interactive Control Cockpit</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            
            {/* Reserves */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "11px", fontFamily: "monospace" }}>Current Cash Reserves</span>
                <span style={{ color: LIME, fontSize: "11px", fontWeight: "bold" }}>{formatUSD(cash)}</span>
              </div>
              <input 
                type="range" 
                min="5000" 
                max="1000000" 
                step="5000"
                value={cash} 
                onChange={e => setCash(Number(e.target.value))}
                style={{ width: "100%", accentColor: LIME }}
              />
            </div>

            {/* Operating fixed burn */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "11px", fontFamily: "monospace" }}>Fixed Monthly Operational Burn <span style={{ color: "rgba(255,255,255,0.3)" }}>(Lease, Hosting, Server)</span></span>
                <span style={{ color: PINK, fontSize: "11px", fontWeight: "bold" }}>{formatUSD(fixedBurn)}/mo</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="50000" 
                step="500"
                value={fixedBurn} 
                onChange={e => setFixedBurn(Number(e.target.value))}
                style={{ width: "100%", accentColor: PINK }}
              />
            </div>

            {/* Team Size (Burdened employee expenses) */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "11px", fontFamily: "monospace" }}>FTE Headcount <span style={{ color: "rgba(255,255,255,0.3)" }}>(Assumes {formatUSD(averageHourlyBurden)} average burden/mo per staff)</span></span>
                <span style={{ color: PURPLE, fontSize: "11px", fontWeight: "bold" }}>{headcount} employees (+{formatUSD(headcount * averageHourlyBurden)} burn)</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="20" 
                step="1"
                value={headcount} 
                onChange={e => setHeadcount(Number(e.target.value))}
                style={{ width: "100%", accentColor: PURPLE }}
              />
            </div>

            {/* COGS */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "11px", fontFamily: "monospace" }}>Cost of Goods Sold (COGS)</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: "bold" }}>{cogs}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="90" 
                step="5"
                value={cogs} 
                onChange={e => setCogs(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#888" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {/* Average order price */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "10px", fontFamily: "monospace" }}>Average Order Ticket</span>
                  <span style={{ color: CYAN, fontSize: "10px", fontWeight: "bold" }}>{formatUSD(avgTicket)}</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="1500" 
                  step="5"
                  value={avgTicket} 
                  onChange={e => setAvgTicket(Number(e.target.value))}
                  style={{ width: "100%", accentColor: CYAN }}
                />
              </div>

              {/* Volume */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "10px", fontFamily: "monospace" }}>Monthly Volume</span>
                  <span style={{ color: CYAN, fontSize: "10px", fontWeight: "bold" }}>{volume} units</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1000" 
                  step="10"
                  value={volume} 
                  onChange={e => setVolume(Number(e.target.value))}
                  style={{ width: "100%", accentColor: CYAN }}
                />
              </div>
            </div>

          </div>
        </div>

        {/* Computations Dashboard */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          
          {/* Main depletion state indicator banner */}
          <div style={{ background: isProfitable ? "rgba(200, 255, 0, 0.08)" : "rgba(255, 60, 120, 0.08)", border: `1px solid ${isProfitable ? LIME : PINK}`, borderRadius: "8px", padding: '1rem', textAlign: "center" }}>
            <span style={{ fontSize: "8.5px", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1px", display: "block" }}>Venture Survival Horizon</span>
            <span style={{ fontSize: "1.45rem", color: isProfitable ? LIME : PINK, fontWeight: "900", display: "block", margin: "4px 0" }}>{monthsOfSurvival}</span>
            <span style={{ fontSize: "9.5px", color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>
              {isProfitable ? "Revenues cover fully burdened overhead!" : `Venture exhausts backup cash in ${deathMonth || 0} months at this rate.`}
            </span>
          </div>

          {/* Computations list */}
          <div style={{ background: "#0c0c0c", border: "1px solid #1c1c1c", borderRadius: "8px", padding: "1rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #1c1c1c", paddingBottom: "0.45rem" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>Total Monthly Overhead:</span>
              <span style={{ color: PINK, fontSize: "10.5px", fontWeight: "bold" }}>{formatUSD(totalMonthlyBurn)}/mo</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #1c1c1c", paddingBottom: "0.45rem" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>Gross Monthly Revenues:</span>
              <span style={{ color: "#fff", fontSize: "10.5px", fontWeight: "bold" }}>{formatUSD(monthlyGrossRevenue)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #1c1c1c", paddingBottom: "0.45rem" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>Venture Margins ({100 - cogs}%):</span>
              <span style={{ color: CYAN, fontSize: "10.5px", fontWeight: "bold" }}>{formatUSD(monthlyTotalMargins)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #1c1c1c", paddingBottom: "0.45rem" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>Net Monthly Profit/Loss:</span>
              <span style={{ color: isProfitable ? LIME : PINK, fontSize: "11px", fontWeight: "bold" }}>{isProfitable ? "+" : ""}{formatUSD(monthlyNetProfitLoss)}/mo</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.2rem" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>Break-Even Order Target:</span>
              <span style={{ color: LIME, fontSize: "11px", fontWeight: "bold" }}>{breakEvenVolume === 0 ? "Infinite" : `${breakEvenVolume} unit sales`}</span>
            </div>

            {/* Trajectory Graph Plotter */}
            <div style={{ marginTop: "1rem", flex: 1, display: "flex", flexDirection: "column" }}>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.4rem", display: "block" }}>12M CUMULATIVE LIQUIDITY RUNWAY TRAJECTORY</span>
              
              <div style={{ background: "#050505", border: "1px solid #151515", borderRadius: "5px", height: "85px", position: "relative" }}>
                <svg viewBox="0 0 100 80" style={{ width: "100%", height: "85px" }}>
                  
                  {/* Trajectory line */}
                  <polyline 
                    fill="none" 
                    stroke={isProfitable ? LIME : PINK} 
                    strokeWidth="1.5"
                    points={svgPoints} 
                  />

                  {/* Draw circles on points */}
                  {trajectory.map((val, idx) => {
                    const x = 10 + (idx / 12) * 80;
                    const y = 80 - ((val - minVal) / valSpan) * 65;
                    return (
                      <circle key={idx} cx={x} cy={y} r="1" fill={val <= 0 ? PINK : LIME} />
                    );
                  })}

                  {/* Zero threshold line */}
                  {minVal < 0 && (
                    <line 
                      x1="10" 
                      y1={80 - ((0 - minVal) / valSpan) * 65} 
                      x2="90" 
                      y2={80 - ((0 - minVal) / valSpan) * 65} 
                      stroke="rgba(255,255,255,0.06)" 
                      strokeWidth="0.5" 
                      strokeDasharray="2,2" 
                    />
                  )}
                </svg>
                
                {/* Horizontal scale indicators */}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 8px 0", fontSize: "7px", color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>
                  <span>Month 0</span>
                  <span>Month 6</span>
                  <span>Month 12</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
