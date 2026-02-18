import { useState, useEffect, useRef } from 'react';
import { getRunRate } from '@/types/cricket';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';
import { Match } from '@/types/cricket';

interface TickerProps {
  snapshot: ScoreboardSnapshot | null;
  match: Match | null;
  variant?: 'dark' | 'light' | 'premium';
}

type TickerItem = { label: string; value: string; highlight?: boolean };

function calcWinProbability(s: ScoreboardSnapshot | null, m: Match | null): { team1: number; team2: number } | null {
  // Only meaningful in 2nd innings of a chase
  const match = m;
  if (!match || match.innings.length < 2) return null;
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];
  if (!inn2 || inn2.isComplete) return null;

  const bpo = match.ballsPerOver || 6;
  const totalBalls = match.overs * bpo;
  const target = inn1.runs + 1;
  const runsNeeded = target - inn2.runs;
  const ballsLeft = totalBalls - inn2.balls;
  const wicketsLeft = 10 - inn2.wickets;

  if (ballsLeft <= 0) return runsNeeded <= 0 ? { team1: 5, team2: 95 } : { team1: 95, team2: 5 };
  if (runsNeeded <= 0) return { team1: 5, team2: 95 };
  if (wicketsLeft <= 0) return { team1: 95, team2: 5 };

  // CRR vs RRR comparison
  const crr = inn2.balls > 0 ? (inn2.runs / inn2.balls) * bpo : 0;
  const rrr = (runsNeeded / ballsLeft) * bpo;

  // Resource factor: balls + wickets remaining
  const ballResource = ballsLeft / totalBalls;
  const wicketResource = wicketsLeft / 10;
  const resourceFactor = (ballResource * 0.6 + wicketResource * 0.4);

  // Chasing team probability: 50% base, adjust for RRR vs CRR, resources
  const rateAdvantage = rrr > 0 ? (crr / rrr - 1) : 0;
  let chasingProb = 50 + rateAdvantage * 25 + (resourceFactor - 0.5) * 20;
  chasingProb = Math.max(5, Math.min(95, chasingProb));

  // inn2 batting team is chasing
  const chasingIsTeam2 = inn2.battingTeamIndex === 1;
  if (chasingIsTeam2) {
    return { team1: Math.round(100 - chasingProb), team2: Math.round(chasingProb) };
  } else {
    return { team1: Math.round(chasingProb), team2: Math.round(100 - chasingProb) };
  }
}

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

  // 2. Current Run Rate (CRR)
  const inn = s?.inn;
  if (inn && inn.balls > 0) {
    const bpo = s?.bpo || 6;
    const rr = getRunRate(inn.runs, inn.balls, bpo);
    items.push({ label: 'CRR', value: rr });
  }

  // 3. Required Run Rate (RRR) — only in 2nd innings chase
  if (m && m.innings.length >= 2 && m.innings[1] && !m.innings[1].isComplete) {
    const inn1 = m.innings[0];
    const inn2 = m.innings[1];
    const bpo = m.ballsPerOver || 6;
    const totalBalls = m.overs * bpo;
    const target = inn1.runs + 1;
    const runsNeeded = target - inn2.runs;
    const ballsLeft = totalBalls - inn2.balls;
    if (ballsLeft > 0 && runsNeeded > 0) {
      const rrr = ((runsNeeded / ballsLeft) * bpo).toFixed(2);
      items.push({ label: 'RRR', value: rrr });
    }
  }

  // 4. Win Probability
  const winProb = calcWinProbability(s, m);
  if (winProb && m) {
    const t1 = m.team1.name.toUpperCase();
    const t2 = m.team2.name.toUpperCase();
    items.push({
      label: 'WIN %',
      value: `${t1} ${winProb.team1}% · ${t2} ${winProb.team2}%`,
      highlight: true,
    });
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

  const labelColor = variant === 'light' ? '#fcd34d' : variant === 'premium' ? '#fbbf24' : '#fcd34d';
  const isWinItem = item.highlight;

  return (
    <div
      className="w-full flex items-center justify-center py-[3px] overflow-hidden"
      style={bgStyle}
    >
      <div
        className={`flex items-center gap-2 ${animating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}
        style={{ transition: 'opacity 0.4s ease, transform 0.4s ease' }}
      >
        <span
          className="text-[9px] md:text-[10px] font-display font-black tracking-widest"
          style={{ color: isWinItem ? '#4ade80' : labelColor }}
        >
          {item.label}
        </span>
        <span className="text-white/50 text-[8px]">•</span>
        <span
          className="text-[9px] md:text-[10px] font-display font-bold tracking-wider"
          style={{ color: isWinItem ? '#fde68a' : 'white' }}
        >
          {item.value}
        </span>
      </div>
    </div>
  );
}
