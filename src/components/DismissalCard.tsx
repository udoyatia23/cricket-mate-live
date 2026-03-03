import { useEffect, useState, useRef } from 'react';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';
import duckWalkGif from '@/assets/duck-walk.gif';

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

  // Track last triggered dismissal timestamp to avoid re-triggering on subsequent balls
  const lastDismissalTs = useRef<number>(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ts = snapshot?.ts;
    const dismissal = snapshot?.dismissal;

    // Must have a timestamp and a dismissal payload
    if (!ts || !dismissal) return;

    // Only trigger if this is a NEW dismissal event (strictly greater ts)
    if (ts <= lastDismissalTs.current) return;

    // Lock this dismissal timestamp so no subsequent ball (same or later ts without a new dismissal)
    // can re-trigger the card
    lastDismissalTs.current = ts;

    // Cancel any currently running timers before starting fresh
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (outTimer.current) {
      clearTimeout(outTimer.current);
      outTimer.current = null;
    }

    // Capture dismissal data at this exact moment
    setDismissalData({ ...dismissal });
    setAnimOut(false);
    setVisible(true);

    // After 4.3s start exit animation
    outTimer.current = setTimeout(() => {
      setAnimOut(true);
    }, 4300);

    // After 5.2s hide completely and clear data
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setDismissalData(null);
    }, 5200);

    // Cleanup: cancel timers if component unmounts mid-animation
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (outTimer.current) clearTimeout(outTimer.current);
    };
    // Only react to ts changes — prevents re-triggering when other snapshot fields update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.ts]);

  if (!visible || !dismissalData) return null;

  const isDuck = dismissalData.runs === 0;

  const strikeRate = dismissalData.balls > 0
    ? ((dismissalData.runs / dismissalData.balls) * 100).toFixed(1)
    : '0.0';

  const dismissStr = formatDismissalType(dismissalData.dismissalType);
  const bowlerStr = dismissalData.dismissedBy ? ` ${dismissalData.dismissedBy}` : '';

  // Split name for styling: first word lighter, rest bold
  const nameParts = dismissalData.name.trim().split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  // ─── DUCK OUT CARD (0 runs) ───
  if (isDuck) {
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
          @keyframes duckWalk {
            from { transform: translateX(80px); }
            to   { transform: translateX(-80px); }
          }
          @keyframes dismissalProgress {
            from { transform: scaleX(1); }
            to   { transform: scaleX(0); }
          }
        `}</style>

        <div style={{ width: 'min(92vw, 680px)' }}>
          {/* Duck animation area */}
          <div className="flex justify-center mb-[-14px] relative" style={{ zIndex: 2 }}>
            <div style={{ animation: 'duckWalk 3s linear infinite alternate', width: 110, height: 100 }}>
              <img src={duckWalkGif} alt="Duck walk" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          </div>

          {/* Info bar */}
          <div className="relative overflow-hidden rounded-sm shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.75)' }}>
            <div className="flex" style={{ background: 'linear-gradient(180deg, #37474f 0%, #263238 100%)' }}>
              {/* Content */}
              <div className="flex-1 px-5 py-3">
                {/* Top row: Name + Score */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-base md:text-lg font-black text-white uppercase tracking-wider truncate">
                    {dismissalData.name}
                  </span>
                  <span className="font-display font-black tabular-nums text-white flex-shrink-0" style={{ fontSize: 'clamp(1.2rem, 3.5vw, 1.6rem)' }}>
                    {dismissalData.runs} ({dismissalData.balls})
                  </span>
                </div>

                {/* Bottom row: Dismissal info + Strike rate */}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <div className="flex items-center gap-2 text-white/70 text-xs md:text-sm font-bold uppercase tracking-wider truncate">
                    <span>{dismissStr}</span>
                    {dismissalData.dismissedBy && (
                      <>
                        <span className="text-white/30">•</span>
                        <span>b {dismissalData.dismissedBy}</span>
                      </>
                    )}
                  </div>
                  <span className="text-white/60 text-xs md:text-sm font-bold uppercase tracking-wider flex-shrink-0">
                    STRIKE RATE: {strikeRate}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-[2px] w-full" style={{ background: '#e91e63', transformOrigin: 'left', animation: 'dismissalProgress 5s linear forwards' }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── NORMAL DISMISSAL CARD (runs > 0) ───
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
        @keyframes dismissalProgress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
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
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #f5c842, #fff7c0, #f5c842, #c17a1a)' }} />

        {/* Main card body */}
        <div className="flex" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}>
          {/* Left accent stripe */}
          <div className="w-[5px] flex-shrink-0" style={{ background: 'linear-gradient(180deg, #e91e63, #c62828)' }} />

          {/* Content */}
          <div className="flex-1 px-4 py-3">
            {/* Top row: Name + Runs/Balls */}
            <div className="flex items-baseline justify-between gap-2 mb-[6px]">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="flex-shrink-0 text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded-[2px] uppercase" style={{ background: 'linear-gradient(135deg, #e91e63, #c62828)', color: '#fff', letterSpacing: '0.12em' }}>OUT</span>
                <span className="font-display text-base md:text-lg font-normal text-white/70 uppercase tracking-wider truncate">{firstName}</span>
                {lastName && <span className="font-display text-base md:text-lg font-black text-white uppercase tracking-wider truncate">{lastName}</span>}
              </div>
              <div className="flex items-baseline gap-2 flex-shrink-0">
                <span className="font-display font-black tabular-nums" style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', color: '#f5c842', lineHeight: 1 }}>{dismissalData.runs}</span>
                <span className="font-display font-medium tabular-nums text-white/50" style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)' }}>({dismissalData.balls}b)</span>
              </div>
            </div>

            {/* Gold divider */}
            <div className="w-full h-px mb-[6px]" style={{ background: 'linear-gradient(90deg, transparent, #f5c84280, transparent)' }} />

            {/* Dismissal row */}
            <div className="flex items-center gap-1.5 mb-[7px]">
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider" style={{ color: '#e91e63' }}>{dismissStr}</span>
              {bowlerStr && (
                <>
                  <span className="text-white/30 text-[10px]">•</span>
                  <span className="text-white font-display font-black uppercase text-[10px] md:text-xs tracking-wider truncate">{dismissalData.dismissedBy}</span>
                </>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center rounded-[3px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {[
                { label: '4s', value: dismissalData.fours },
                { label: '6s', value: dismissalData.sixes },
                { label: 'SR', value: strikeRate },
              ].map((stat, i, arr) => (
                <div key={stat.label} className="flex-1 flex flex-col items-center py-2 gap-0.5" style={{ borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                  <span className="font-display font-black tabular-nums" style={{ fontSize: 'clamp(0.9rem, 3vw, 1.25rem)', color: stat.label === '4s' ? '#4fc3f7' : stat.label === '6s' ? '#f5c842' : '#a5d6a7' }}>{stat.value}</span>
                  <span className="text-white/40 text-[9px] font-bold tracking-widest uppercase">{stat.label === '4s' ? 'FOURS' : stat.label === '6s' ? 'SIXES' : 'STRIKE RATE'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gold accent bottom border */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #f5c842, #fff7c0, #f5c842, #c17a1a)' }} />

        {/* Auto-hide progress bar */}
        <div className="h-[2px] w-full" style={{ background: '#e91e63', transformOrigin: 'left', animation: 'dismissalProgress 5s linear forwards' }} />
      </div>
    </div>
  );
};

export default DismissalCard;
