import { useState, useEffect, useRef } from 'react';
import { getRunRate } from '@/types/cricket';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';
import { Match } from '@/types/cricket';

interface TickerProps {
  snapshot: ScoreboardSnapshot | null;
  match: Match | null;
  variant?: 'dark' | 'light' | 'premium';
}

type TickerItem = { label: string; value: string };

function buildTickerItems(s: ScoreboardSnapshot | null, m: Match | null): TickerItem[] {
  const items: TickerItem[] = [];

  // 1. Toss result
  if (s || m) {
    const tossWonBy = s?.tossWonBy ?? m?.tossWonBy ?? 0;
    const optedTo = s?.optedTo ?? m?.optedTo ?? 'bat';
    const tossTeam = tossWonBy === 0
      ? (s?.t1?.name || m?.team1?.name || 'Team 1')
      : (s?.t2?.name || m?.team2?.name || 'Team 2');
    items.push({ label: 'TOSS', value: `${tossTeam.toUpperCase()} WON · OPTED TO ${optedTo.toUpperCase()}` });
  }

  // 2. Run Rate
  const inn = s?.inn;
  if (inn && inn.balls > 0) {
    const bpo = s?.bpo || 6;
    const rr = getRunRate(inn.runs, inn.balls, bpo);
    items.push({ label: 'RUN RATE', value: rr });
  }

  // 3. Venue / Location
  const venue = s?.venue;
  if (venue && venue.trim()) {
    items.push({ label: 'VENUE', value: venue.toUpperCase() });
  }

  return items;
}

const INTERVAL_MS = 10000; // 10 seconds

export default function ScoreboardTicker({ snapshot, match, variant = 'dark' }: TickerProps) {
  const items = buildTickerItems(snapshot, match);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (items.length <= 1) { setCurrentIndex(0); return; }
    timerRef.current = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % items.length);
        setAnimating(false);
      }, 400);
    }, INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  if (items.length === 0) return null;

  const safeIdx = currentIndex % Math.max(items.length, 1);
  const item = items[safeIdx];

  const bgStyle = variant === 'light'
    ? { background: 'linear-gradient(135deg, #4a148c, #311b92)' }
    : variant === 'premium'
    ? { background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }
    : { background: 'linear-gradient(135deg, #0d0a38, #150f50)' };

  const labelColor = variant === 'light' ? 'text-amber-300' : variant === 'premium' ? 'text-amber-400' : 'text-amber-300';

  return (
    <div
      className="w-full flex items-center justify-center py-[3px] overflow-hidden"
      style={bgStyle}
    >
      <div
        className={`flex items-center gap-2 transition-all duration-400 ${animating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}
        style={{ transition: 'opacity 0.4s ease, transform 0.4s ease' }}
      >
        <span className={`${labelColor} text-[9px] md:text-[10px] font-display font-black tracking-widest`}>
          {item.label}
        </span>
        <span className="text-white/50 text-[8px]">•</span>
        <span className="text-white text-[9px] md:text-[10px] font-display font-bold tracking-wider">
          {item.value}
        </span>
      </div>
    </div>
  );
}
