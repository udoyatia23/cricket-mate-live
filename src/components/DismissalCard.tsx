import { useEffect, useState, useRef } from 'react';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';

interface DismissalCardProps {
  snapshot: ScoreboardSnapshot | null;
}

const formatDismissalType = (type: string): string => {
  const map: Record<string, string> = {
    bowled: 'Bowled',
    catch_out: 'Caught',
    caught: 'Caught',
    run_out: 'Run Out',
    run_out_non_striker: 'Run Out',
    stumping: 'Stumped',
    lbw: 'LBW',
    hit_wicket: 'Hit Wicket',
    mankad: 'Mankad',
    retired: 'Retired',
  };
  return map[type?.toLowerCase?.()] || type || 'Out';
};

const DismissalCard = ({ snapshot }: DismissalCardProps) => {
  const [visible, setVisible] = useState(false);
  const [animOut, setAnimOut] = useState(false);
  const [dismissalData, setDismissalData] = useState<ScoreboardSnapshot['dismissal'] | null>(null);
  const lastDismissalTs = useRef<number>(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!snapshot?.ts) return;
    const ts = snapshot.ts;

    // Only trigger when this is a NEW ts that also carries a dismissal
    if (!snapshot.dismissal) return;
    if (ts <= lastDismissalTs.current) return;

    // Record the ts of this dismissal so subsequent snapshots (next balls)
    // with the same or newer ts but no new dismissal don't re-trigger
    lastDismissalTs.current = ts;

    // Cancel any running timers
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (outTimer.current) clearTimeout(outTimer.current);

    // Capture the dismissal data at this moment
    const captured = snapshot.dismissal;
    setDismissalData(captured);
    setAnimOut(false);
    setVisible(true);

    // After 4.3s start exit animation
    outTimer.current = setTimeout(() => {
      setAnimOut(true);
    }, 4300);

    // After 5.2s hide completely
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setDismissalData(null);
    }, 5200);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (outTimer.current) clearTimeout(outTimer.current);
    };
    // Only depend on ts — avoids re-triggering on object reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.ts]);

  if (!visible || !dismissalData) return null;

  const strikeRate = dismissalData.balls > 0
    ? ((dismissalData.runs / dismissalData.balls) * 100).toFixed(1)
    : '0.0';

  const dismissStr = formatDismissalType(dismissalData.dismissalType);
  const bowlerStr = dismissalData.dismissedBy ? ` ${dismissalData.dismissedBy}` : '';

  // Split name for styling: first word lighter, rest bold
  const nameParts = dismissalData.name.trim().split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  return (
    <div
      className="w-full flex justify-center mb-1 pointer-events-none"
      style={{
        animation: animOut
          ? 'dismissalSlideOut 0.5s cubic-bezier(0.4,0,1,1) forwards'
          : 'dismissalSlideIn 0.45s cubic-bezier(0,0,0.2,1) forwards',
      }}
    >
      <style>{`
        @keyframes dismissalSlideIn {
          from { opacity: 0; transform: translateY(18px) scaleX(0.96); }
          to   { opacity: 1; transform: translateY(0)  scaleX(1); }
        }
        @keyframes dismissalSlideOut {
          from { opacity: 1; transform: translateY(0)  scaleX(1); }
          to   { opacity: 0; transform: translateY(12px) scaleX(0.97); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* Card wrapper */}
      <div
        className="relative overflow-hidden rounded-sm shadow-2xl"
        style={{
          width: 'min(92vw, 680px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.75), 0 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        {/* Gold accent top border */}
        <div
          className="h-[3px] w-full"
          style={{ background: 'linear-gradient(90deg, #c17a1a, #f5c842, #fff7c0, #f5c842, #c17a1a)' }}
        />

        {/* Main card body */}
        <div className="flex" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}>

          {/* Left accent stripe */}
          <div
            className="w-[5px] flex-shrink-0"
            style={{ background: 'linear-gradient(180deg, #e91e63, #c62828)' }}
          />

          {/* Content */}
          <div className="flex-1 px-4 py-3">

            {/* Top row: Name + Runs/Balls */}
            <div className="flex items-baseline justify-between gap-2 mb-[6px]">
              {/* Name */}
              <div className="flex items-baseline gap-1.5 min-w-0">
                {/* WICKET badge */}
                <span
                  className="flex-shrink-0 text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded-[2px] uppercase"
                  style={{
                    background: 'linear-gradient(135deg, #e91e63, #c62828)',
                    color: '#fff',
                    letterSpacing: '0.12em',
                  }}
                >
                  OUT
                </span>
                <span
                  className="font-display text-base md:text-lg font-normal text-white/70 uppercase tracking-wider truncate"
                >
                  {firstName}
                </span>
                {lastName && (
                  <span
                    className="font-display text-base md:text-lg font-black text-white uppercase tracking-wider truncate"
                  >
                    {lastName}
                  </span>
                )}
              </div>

              {/* Runs & Balls */}
              <div className="flex items-baseline gap-2 flex-shrink-0">
                <span
                  className="font-display font-black tabular-nums"
                  style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', color: '#f5c842', lineHeight: 1 }}
                >
                  {dismissalData.runs}
                </span>
                <span
                  className="font-display font-medium tabular-nums text-white/50"
                  style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)' }}
                >
                  ({dismissalData.balls}b)
                </span>
              </div>
            </div>

            {/* Gold divider */}
            <div
              className="w-full h-px mb-[6px]"
              style={{ background: 'linear-gradient(90deg, transparent, #f5c84280, transparent)' }}
            />

            {/* Dismissal row */}
            <div className="flex items-center gap-1.5 mb-[7px]">
              <span
                className="text-[10px] md:text-xs font-bold uppercase tracking-wider"
                style={{ color: '#e91e63' }}
              >
                {dismissStr}
              </span>
              {bowlerStr && (
                <>
                  <span className="text-white/30 text-[10px]">•</span>
                  <span className="text-white font-display font-black uppercase text-[10px] md:text-xs tracking-wider truncate">
                    {dismissalData.dismissedBy}
                  </span>
                </>
              )}
            </div>

            {/* Stats row */}
            <div
              className="flex items-center rounded-[3px] overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              {[
                { label: '4s', value: dismissalData.fours },
                { label: '6s', value: dismissalData.sixes },
                { label: 'SR', value: strikeRate },
              ].map((stat, i, arr) => (
                <div
                  key={stat.label}
                  className="flex-1 flex flex-col items-center py-2 gap-0.5"
                  style={{
                    borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  }}
                >
                  <span
                    className="font-display font-black tabular-nums"
                    style={{ fontSize: 'clamp(0.9rem, 3vw, 1.25rem)', color: stat.label === '4s' ? '#4fc3f7' : stat.label === '6s' ? '#f5c842' : '#a5d6a7' }}
                  >
                    {stat.value}
                  </span>
                  <span className="text-white/40 text-[9px] font-bold tracking-widest uppercase">
                    {stat.label === '4s' ? 'FOURS' : stat.label === '6s' ? 'SIXES' : 'STRIKE RATE'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gold accent bottom border */}
        <div
          className="h-[3px] w-full"
          style={{ background: 'linear-gradient(90deg, #c17a1a, #f5c842, #fff7c0, #f5c842, #c17a1a)' }}
        />

        {/* Auto-hide progress bar */}
        <div
          className="h-[2px] w-full"
          style={{
            background: '#e91e63',
            transformOrigin: 'left',
            animation: 'dismissalProgress 5s linear forwards',
          }}
        />
        <style>{`
          @keyframes dismissalProgress {
            from { transform: scaleX(1); }
            to   { transform: scaleX(0); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default DismissalCard;
