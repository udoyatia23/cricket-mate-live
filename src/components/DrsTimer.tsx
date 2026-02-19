// DRS Timer overlay — bottom-right, counts 14→0, auto-hides when done
import { useState, useEffect, useRef } from 'react';

interface DrsTimerProps {
  drsTimerStart?: number; // epoch ms
}

const DRS_DURATION = 14; // seconds

export default function DrsTimer({ drsTimerStart }: DrsTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStart = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!drsTimerStart) return;
    // Don't re-trigger if same start value
    if (prevStart.current === drsTimerStart) return;
    prevStart.current = drsTimerStart;

    // Clear any running timer
    if (intervalRef.current) clearInterval(intervalRef.current);

    const computeLeft = () => {
      const elapsed = Math.floor((Date.now() - drsTimerStart) / 1000);
      return Math.max(0, DRS_DURATION - elapsed);
    };

    const initial = computeLeft();
    if (initial <= 0) return; // Already expired

    setSecondsLeft(initial);
    setVisible(true);
    // Trigger slide-in animation
    setTimeout(() => setAnimIn(true), 20);

    intervalRef.current = setInterval(() => {
      const left = computeLeft();
      setSecondsLeft(left);
      if (left <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        // Animate out then hide
        setAnimIn(false);
        setTimeout(() => setVisible(false), 500);
      }
    }, 200);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [drsTimerStart]);

  if (!visible || secondsLeft === null) return null;

  // Color transitions: green → yellow → red
  const pct = secondsLeft / DRS_DURATION;
  const timerColor = pct > 0.5 ? '#00e5ff' : pct > 0.25 ? '#ffeb3b' : '#ff1744';
  const glowColor = pct > 0.5 ? 'rgba(0,229,255,0.6)' : pct > 0.25 ? 'rgba(255,235,59,0.6)' : 'rgba(255,23,68,0.6)';

  // Circular progress ring
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const progress = (secondsLeft / DRS_DURATION) * circumference;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 90,
        right: 12,
        zIndex: 9999,
        transform: animIn ? 'translateX(0) scale(1)' : 'translateX(120%) scale(0.8)',
        opacity: animIn ? 1 : 0,
        transition: 'transform 0.45s cubic-bezier(0.175,0.885,0.32,1.275), opacity 0.35s ease',
        pointerEvents: 'none',
      }}
    >
      {/* Main widget */}
      <div
        style={{
          width: 110,
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: `0 0 24px ${glowColor}, 0 4px 32px rgba(0,0,0,0.8)`,
          fontFamily: 'Oswald, system-ui, sans-serif',
          border: `2px solid ${timerColor}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1a237e, #3949ab)',
            padding: '6px 4px 5px',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            }}
          >
            DRS TIMER
          </span>
        </div>

        {/* Timer body */}
        <div
          style={{
            background: 'linear-gradient(180deg, #0d0d2b 0%, #1a1a4e 100%)',
            padding: '10px 8px 12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* Circular progress */}
          <div style={{ position: 'relative', width: 74, height: 74 }}>
            <svg width={74} height={74} style={{ transform: 'rotate(-90deg)' }}>
              {/* Track */}
              <circle
                cx={37} cy={37} r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={5}
              />
              {/* Progress arc */}
              <circle
                cx={37} cy={37} r={radius}
                fill="none"
                stroke={timerColor}
                strokeWidth={5}
                strokeDasharray={circumference}
                strokeDashoffset={circumference - progress}
                strokeLinecap="round"
                style={{
                  filter: `drop-shadow(0 0 6px ${timerColor})`,
                  transition: 'stroke-dashoffset 0.2s linear, stroke 0.4s ease',
                }}
              />
            </svg>
            {/* Number inside ring */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: secondsLeft >= 10 ? 30 : 34,
                  fontWeight: 900,
                  color: timerColor,
                  textShadow: `0 0 16px ${timerColor}`,
                  lineHeight: 1,
                  transition: 'color 0.4s ease',
                  fontFamily: 'Oswald, system-ui, sans-serif',
                }}
              >
                {secondsLeft}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              width: '100%',
              height: 4,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(secondsLeft / DRS_DURATION) * 100}%`,
                background: `linear-gradient(90deg, ${timerColor}, ${timerColor}aa)`,
                borderRadius: 2,
                boxShadow: `0 0 8px ${timerColor}`,
                transition: 'width 0.2s linear, background 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
