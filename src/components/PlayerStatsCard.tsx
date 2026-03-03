// Player Stats Card — Compact overlay with slide animation
// Batsman: slides from LEFT, Bowler: slides from RIGHT

import { ScoreboardSnapshot } from '@/lib/broadcastTypes';
import { getOversString } from '@/types/cricket';

interface Props {
  snapshot: ScoreboardSnapshot | null;
}

export default function PlayerStatsCard({ snapshot }: Props) {
  const ps = snapshot?.playerStats;
  if (!ps) return null;

  const isBatsman = ps.type === 'batsman';
  const teamColor = ps.teamColor || '#1565c0';
  const position = isBatsman ? 'left' : 'right';

  // Batsman stats
  const batAvg = ps.totalWickets > 0 ? (ps.totalRuns / ps.totalWickets).toFixed(1) : ps.totalRuns > 0 ? ps.totalRuns.toFixed(1) : '0.0';
  const batSR = ps.totalBalls > 0 ? ((ps.totalRuns / ps.totalBalls) * 100).toFixed(1) : '0.0';
  const currentSR = ps.currentBalls > 0 ? ((ps.currentRuns / ps.currentBalls) * 100).toFixed(1) : '0.0';

  // Bowler stats
  const bpo = snapshot?.bpo || 6;
  const bowlAvg = ps.totalWickets > 0 ? (ps.totalBowlingRuns / ps.totalWickets).toFixed(1) : '-';
  const bowlEcon = ps.totalBowlingBalls > 0 ? ((ps.totalBowlingRuns / ps.totalBowlingBalls) * bpo).toFixed(2) : '0.00';
  const bowlSR = ps.totalWickets > 0 ? (ps.totalBowlingBalls / ps.totalWickets).toFixed(1) : '-';

  const rows: { label: string; value: string; highlight?: boolean }[] = isBatsman
    ? [
        { label: 'MATCHES', value: String(ps.matches) },
        { label: 'TOTAL RUNS', value: String(ps.totalRuns) },
        { label: 'AVERAGE', value: batAvg },
        { label: 'STRIKE RATE', value: batSR, highlight: true },
        { label: 'FOURS / SIXES', value: `${ps.totalFours} / ${ps.totalSixes}` },
        { label: "TODAY'S RUNS", value: `${ps.currentRuns} (${ps.currentBalls}b)`, highlight: true },
        { label: "TODAY'S SR", value: currentSR },
      ]
    : [
        { label: 'MATCHES', value: String(ps.matches) },
        { label: 'WICKETS', value: String(ps.totalWickets) },
        { label: 'AVERAGE', value: bowlAvg },
        { label: 'ECONOMY', value: bowlEcon, highlight: true },
        { label: 'STRIKE RATE', value: bowlSR },
        { label: "TODAY'S FIGURES", value: `${ps.currentBowlingWickets}/${ps.currentBowlingRuns} (${getOversString(ps.currentBowlingBalls, bpo)})`, highlight: true },
      ];

  return (
    <div
      className={`fixed ${position === 'left' ? 'left-0' : 'right-0'} bottom-[62px] z-40`}
      style={{
        animation: position === 'left'
          ? 'slideInFromLeft 0.4s ease-out forwards'
          : 'slideInFromRight 0.4s ease-out forwards',
      }}
    >
      <style>{`
        @keyframes slideInFromLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div
        className="overflow-hidden"
        style={{
          fontFamily: 'Oswald, system-ui, sans-serif',
          width: '280px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          borderRadius: position === 'left' ? '0 10px 10px 0' : '10px 0 0 10px',
        }}
      >
        {/* Header with team color */}
        <div
          className="relative px-4 py-2 text-center"
          style={{ background: `linear-gradient(135deg, ${teamColor}dd, ${teamColor}88)` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-[9px] font-bold tracking-[0.15em] uppercase">
              {ps.teamName}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[8px] font-black tracking-[0.12em] uppercase"
              style={{
                background: isBatsman ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)',
                color: '#fff',
              }}
            >
              {isBatsman ? 'BATSMAN' : 'BOWLER'}
            </span>
          </div>
          <h2
            className="font-display font-black text-white text-lg uppercase tracking-wider drop-shadow-lg"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
          >
            {ps.name}
          </h2>
        </div>

        {/* Gold divider */}
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, #f5c842, transparent)' }} />

        {/* Stats rows — compact */}
        <div style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0a38 100%)' }}>
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="flex items-center justify-between px-4 py-1.5"
              style={{
                background: row.highlight
                  ? 'linear-gradient(90deg, rgba(245,200,66,0.12), transparent)'
                  : i % 2 === 0
                  ? 'rgba(255,255,255,0.03)'
                  : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span
                className="font-display font-bold uppercase tracking-[0.1em]"
                style={{
                  fontSize: 10,
                  color: row.highlight ? '#f5c842' : 'rgba(255,255,255,0.6)',
                }}
              >
                {row.label}
              </span>
              <span
                className="font-display font-black tabular-nums"
                style={{
                  fontSize: 13,
                  color: row.highlight ? '#f5c842' : '#fff',
                  textShadow: row.highlight ? '0 0 6px rgba(245,200,66,0.3)' : 'none',
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom accent */}
        <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${teamColor}, transparent)` }} />
      </div>
    </div>
  );
}
