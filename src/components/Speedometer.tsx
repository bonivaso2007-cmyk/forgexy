import React, { useState, useEffect } from "react";

interface SpeedometerProps {
  score: number;
  label?: string;
  size?: number;
}

export function Speedometer({ score, label = "SYS SCORE", size = 120 }: SpeedometerProps) {
  const [currentScore, setCurrentScore] = useState(0);

  useEffect(() => {
    setCurrentScore(0);
    let startTimestamp: number | null = null;
    const duration = 1500; // 1.5 seconds smooth transition

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setCurrentScore(easeProgress * score);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    const animFrame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animFrame);
  }, [score]);

  const getColor = (val: number) => {
    if (val >= 80) return "#C8FF00"; // Sovereign Gilt / Exceptional
    if (val >= 60) return "#C8A24E"; // Solid Sand
    return "#FF3C78"; // Crimson Oxblood / Gaps
  };

  const activeColor = getColor(currentScore);

  const radius = 40;
  const strokeWidth = 7;
  const strokeDasharray = 2 * Math.PI * radius; // Approx 251.32
  const angleRange = 240; // 240 degrees arc range leaves a 120 degree gap at the bottom
  const maxStroke = (angleRange / 360) * strokeDasharray;
  const strokeDashoffset = strokeDasharray - (currentScore / 100) * maxStroke;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: `${size}px`,
      height: `${size}px`,
      position: "relative",
      fontFamily: "monospace"
    }}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        style={{ transform: "rotate(-210deg)" }} // Rotates so the gap is symmetrical at the bottom
      >
        <defs>
          <radialGradient id="gaugeGlowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="65%" stopColor="#050505" stopOpacity="0.8" />
            <stop offset="100%" stopColor={activeColor} stopOpacity="0.1" />
          </radialGradient>
          <filter id="gaugeGlowEffect" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Backing circle background color */}
        <circle
          cx="50"
          cy="50"
          r={radius - 2}
          fill="url(#gaugeGlowGrad)"
        />

        {/* Greyed-out Background Arc Track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDasharray - maxStroke}
          strokeLinecap="round"
        />

        {/* Dashed speedometer ticks around the dial */}
        {[...Array(11)].map((_, i) => {
          const tickAngle = -30 + i * (angleRange / 10); // relative to our rotated starting point
          const rad = (tickAngle * Math.PI) / 180;
          const x1 = 50 + (radius - 5) * Math.cos(rad);
          const y1 = 50 + (radius - 5) * Math.sin(rad);
          const x2 = 50 + (radius - 1) * Math.cos(rad);
          const y2 = 50 + (radius - 1) * Math.sin(rad);

          // Calculate if this tick has been passed by currentScore
          const isPassed = (i / 10) * 100 <= currentScore;

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isPassed ? activeColor : "rgba(255,255,255,0.08)"}
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity={isPassed ? 1 : 0.4}
              style={{ transition: "stroke 0.2s, opacity 0.2s" }}
            />
          );
        })}

        {/* Active Value Ring Path */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={activeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          filter="url(#gaugeGlowEffect)"
          style={{ transition: "stroke 0.3s" }}
        />

        {/* Physical speedometer Pointer Needle */}
        {(() => {
          const needleAngle = -30 + (currentScore / 100) * angleRange;
          const rad = (needleAngle * Math.PI) / 180;
          const needleLength = radius - 6;
          const targetX = 50 + needleLength * Math.cos(rad);
          const targetY = 50 + needleLength * Math.sin(rad);
          return (
            <g>
              {/* Backside counter-weight of needle */}
              <line
                x1={50 - 5 * Math.cos(rad)}
                y1={50 - 5 * Math.sin(rad)}
                x2={targetX}
                y2={targetY}
                stroke={activeColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                filter="url(#gaugeGlowEffect)"
              />
              {/* Center pivot point cap */}
              <circle
                cx="50"
                cy="50"
                r="3"
                fill="#ffffff"
                stroke={activeColor}
                strokeWidth="1.2"
              />
            </g>
          );
        })()}
      </svg>

      {/* Pure text stats aligned inside overlay */}
      <div style={{
        position: "absolute",
        top: "48%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none"
      }}>
        <span style={{
          fontSize: `${size * 0.17}px`,
          fontWeight: "900",
          color: activeColor,
          lineHeight: 1,
          fontFamily: "monospace",
          textShadow: `0 0 10px ${activeColor}44`
        }}>
          {Math.round(currentScore)}%
        </span>
        <span style={{
          fontSize: "8px",
          color: "rgba(255, 255, 255, 0.4)",
          letterSpacing: "1px",
          fontWeight: "bold",
          marginTop: "3px",
          textTransform: "uppercase"
        }}>
          {label}
        </span>
      </div>
    </div>
  );
}
