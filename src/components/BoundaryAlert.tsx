import { useState, useEffect, useRef } from 'react';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';

interface BoundaryAlertProps {
  snapshot: ScoreboardSnapshot | null;
  variant?: 'dark' | 'light' | 'premium';
  barHeight?: number; // height of the scoreboard bar in px
}

export default function BoundaryAlert({ snapshot, variant = 'dark', barHeight = 68 }: BoundaryAlertProps) {
  const [visible, setVisible] = useState(false);
  const [alertType, setAlertType] = useState<'fours' | 'sixes'>('fours');
  const [count, setCount] = useState(0);
  const [animIn, setAnimIn] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const animTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastFours = useRef(-1);
  const lastSixes = useRef(-1);

  useEffect(() => {
    if (!snapshot) return;
    const fours = snapshot.totalFours || 0;
    const sixes = snapshot.totalSixes || 0;

    // Initialize on first snapshot (don't trigger)
    if (lastFours.current === -1) {
      lastFours.current = fours;
      lastSixes.current = sixes;
      return;
    }

    let triggered = false;
    let type: 'fours' | 'sixes' = 'fours';
    let newCount = 0;

    // Sixes take priority
    if (sixes > lastSixes.current) {
      type = 'sixes';
      newCount = sixes;
      triggered = true;
    } else if (fours > lastFours.current) {
      type = 'fours';
      newCount = fours;
      triggered = true;
    }

    lastFours.current = fours;
    lastSixes.current = sixes;

    if (triggered) {
      setAlertType(type);
      setCount(newCount);
      setVisible(true);
      setAnimIn(false);

      // Slight delay for slide-up animation
      if (animTimer.current) clearTimeout(animTimer.current);
      animTimer.current = setTimeout(() => setAnimIn(true), 30);

      // Auto-hide after 5 seconds
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setAnimIn(false);
        setTimeout(() => setVisible(false), 400);
      }, 5000);
    }
  }, [snapshot?.totalFours, snapshot?.totalSixes]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, []);

  if (!visible) return null;

  const isFour = alertType === 'fours';

  // Colors per type
  const cardBg = isFour
    ? 'linear-gradient(160deg, #1a237e 0%, #283593 50%, #1565c0 100%)'
    : 'linear-gradient(160deg, #880e4f 0%, #ad1457 50%, #c2185b 100%)';

  const borderColor = isFour ? '#f5c842' : '#f5c842';

  const accentColor = isFour ? '#42a5f5' : '#f06292';
  const glowColor = isFour ? 'rgba(33,150,243,0.5)' : 'rgba(233,30,99,0.5)';

  const label = isFour ? 'TOTAL FOURS' : 'TOTAL SIXES';
  const icon = isFour ? '4' : '6';

  // Variant-specific border glow
  const boxShadow = `0 8px 32px rgba(0,0,0,0.6), 0 0 0 3px ${borderColor}, 0 0 24px ${glowColor}`;

  // ticker ~22px + 5px gold line + barHeight = total offset from bottom
  const bottomOffset = barHeight + 22 + 5;

  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'absolute',
        bottom: `${bottomOffset}px`,
        left: '0',
        zIndex: 50,
        transform: animIn ? 'translateY(0px)' : 'translateY(40px)',
        transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease',
        opacity: animIn ? 1 : 0,
      }}
    >
      <style>{`
        @keyframes boundaryPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
        @keyframes countGlow {
          0%, 100% { text-shadow: 0 0 10px rgba(255,255,255,0.3); }
          50% { text-shadow: 0 0 25px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.4); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* Card */}
      <div
        style={{
          background: cardBg,
          boxShadow,
          borderRadius: '6px 6px 0 0',
          width: '130px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Top accent bar */}
        <div style={{
          height: '4px',
          background: `linear-gradient(90deg, ${borderColor}, ${accentColor}, ${borderColor})`,
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s linear infinite',
        }} />

        {/* Icon badge top-right */}
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: accentColor,
          boxShadow: `0 0 12px ${glowColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Oswald, system-ui, sans-serif',
          fontWeight: 900,
          fontSize: '14px',
          color: '#fff',
          animation: 'boundaryPulse 1.2s ease-in-out infinite',
        }}>
          {icon}
        </div>

        {/* Content */}
        <div style={{ padding: '10px 12px 12px 12px' }}>
          {/* Label */}
          <div style={{
            fontFamily: 'Oswald, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: 'rgba(255,255,255,0.7)',
            marginBottom: '2px',
            textTransform: 'uppercase',
          }}>
            {label}
          </div>

          {/* Big number */}
          <div style={{
            fontFamily: 'Oswald, system-ui, sans-serif',
            fontWeight: 900,
            fontSize: '52px',
            lineHeight: 1,
            color: '#ffffff',
            animation: 'countGlow 1.5s ease-in-out infinite',
            letterSpacing: '-2px',
          }}>
            {count}
          </div>

          {/* Dot indicators */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: accentColor,
                  opacity: 0.4 + (i / Math.max(count, 1)) * 0.6,
                  boxShadow: `0 0 4px ${glowColor}`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Bottom gold border */}
        <div style={{
          height: '3px',
          background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)`,
        }} />
      </div>
    </div>
  );
}
