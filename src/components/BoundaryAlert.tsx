import { useState, useEffect, useRef } from 'react';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';

interface BoundaryAlertProps {
  snapshot: ScoreboardSnapshot | null;
  variant?: 'dark' | 'light' | 'premium';
}

export default function BoundaryAlert({ snapshot, variant = 'dark' }: BoundaryAlertProps) {
  const [visible, setVisible] = useState(false);
  const [alertType, setAlertType] = useState<'fours' | 'sixes'>('fours');
  const [count, setCount] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastFours = useRef(-1);
  const lastSixes = useRef(-1);

  useEffect(() => {
    if (!snapshot) return;
    const fours = snapshot.totalFours || 0;
    const sixes = snapshot.totalSixes || 0;

    // Initialize on first snapshot (don't trigger)
    if (lastFours.current === -1) { lastFours.current = fours; lastSixes.current = sixes; return; }

    let triggered = false;

    // Check if sixes increased
    if (sixes > lastSixes.current) {
      setAlertType('sixes');
      setCount(sixes);
      triggered = true;
    }
    // Check if fours increased (sixes take priority if both)
    else if (fours > lastFours.current) {
      setAlertType('fours');
      setCount(fours);
      triggered = true;
    }

    lastFours.current = fours;
    lastSixes.current = sixes;

    if (triggered) {
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 5000);
    }
  }, [snapshot?.totalFours, snapshot?.totalSixes]);

  useEffect(() => {
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  if (!visible) return null;

  const isFour = alertType === 'fours';
  const icon = isFour ? '4' : '6';
  const label = isFour ? 'FOURS' : 'SIXES';

  const bgStyle = variant === 'light'
    ? { background: isFour ? 'linear-gradient(135deg, #1565c0, #1976d2)' : 'linear-gradient(135deg, #2e7d32, #388e3c)' }
    : variant === 'premium'
    ? { background: isFour ? 'linear-gradient(135deg, #1a237e, #283593)' : 'linear-gradient(135deg, #1b5e20, #2e7d32)' }
    : { background: isFour ? 'linear-gradient(135deg, #0d47a1, #1565c0)' : 'linear-gradient(135deg, #1b5e20, #2e7d32)' };

  return (
    <div
      className="w-full flex items-center justify-center py-1.5 overflow-hidden"
      style={{
        ...bgStyle,
        animation: 'boundarySlideIn 0.4s ease-out',
      }}
    >
      <style>{`
        @keyframes boundarySlideIn {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes boundaryPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center font-display font-black text-sm"
          style={{
            backgroundColor: isFour ? '#2196f3' : '#4caf50',
            color: '#fff',
            boxShadow: `0 0 12px ${isFour ? 'rgba(33,150,243,0.5)' : 'rgba(76,175,80,0.5)'}`,
            animation: 'boundaryPulse 1s ease-in-out infinite',
          }}
        >
          {icon}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display font-black text-white text-xl md:text-2xl tabular-nums" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
            {count}
          </span>
          <span className="font-display font-bold text-white/80 text-[11px] md:text-xs tracking-widest">
            {label}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: isFour ? '#64b5f6' : '#81c784', opacity: 0.7 + (i * 0.05) }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
