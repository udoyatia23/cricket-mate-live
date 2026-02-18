// Professional Match Summary Card — IPL-broadcast style
// Shows both innings with batting history (left) + bowling history (right)

import { Match, getOversString, getRunRate } from '@/types/cricket';

interface Props {
  match: Match;
  theme?: 'dark' | 'light' | 'premium' | 'forest';
}

// Theme configs
const THEMES = {
  dark: {
    bg: 'linear-gradient(180deg, #150f50 0%, #0d0a38 100%)',
    headerBg: 'linear-gradient(90deg, #1e1660, #2a1f80)',
    titleBg: 'linear-gradient(135deg, #1e1660dd, #2a1f80)',
    batRowEven: 'rgba(255,255,255,0.04)',
    batRowOdd: 'transparent',
    ballRowEven: 'rgba(0,0,0,0.15)',
    ballRowOdd: 'transparent',
    colHeaderBg: 'rgba(0,0,0,0.3)',
    accent: '#f5c842',
    statusBg: 'rgba(0,0,0,0.5)',
    text: '#fff',
    textSub: 'rgba(255,255,255,0.5)',
    border: 'rgba(255,255,255,0.08)',
  },
  light: {
    bg: '#fff',
    headerBg: 'linear-gradient(90deg, #f5f5f5, #ebebeb)',
    titleBg: 'linear-gradient(135deg, #ff6f00, #ff8f00)',
    batRowEven: '#f9f9f9',
    batRowOdd: '#fff',
    ballRowEven: '#f5f5f5',
    ballRowOdd: '#fff',
    colHeaderBg: '#eeeeee',
    accent: '#e65100',
    statusBg: '#fff3e0',
    text: '#1a1a2e',
    textSub: '#888',
    border: '#e0e0e0',
  },
  premium: {
    bg: 'linear-gradient(180deg, #16213e 0%, #0d1626 100%)',
    headerBg: 'linear-gradient(90deg, #1a2744, #0d1626)',
    titleBg: 'linear-gradient(135deg, #1a3a6c, #0d2044)',
    batRowEven: 'rgba(255,255,255,0.04)',
    batRowOdd: 'transparent',
    ballRowEven: 'rgba(0,0,0,0.15)',
    ballRowOdd: 'transparent',
    colHeaderBg: 'rgba(0,0,0,0.25)',
    accent: '#ffab40',
    statusBg: 'rgba(0,0,0,0.45)',
    text: '#fff',
    textSub: 'rgba(255,255,255,0.45)',
    border: 'rgba(255,255,255,0.07)',
  },
  forest: {
    bg: 'linear-gradient(180deg, #0d3b0d 0%, #071a07 100%)',
    headerBg: 'linear-gradient(90deg, #0d3b0d, #072307)',
    titleBg: 'linear-gradient(135deg, #1b5e20, #0d3b0d)',
    batRowEven: 'rgba(255,255,255,0.04)',
    batRowOdd: 'transparent',
    ballRowEven: 'rgba(0,0,0,0.2)',
    ballRowOdd: 'transparent',
    colHeaderBg: 'rgba(0,0,0,0.3)',
    accent: '#fdd835',
    statusBg: 'rgba(0,0,0,0.5)',
    text: '#fff',
    textSub: 'rgba(255,255,255,0.45)',
    border: 'rgba(255,255,255,0.07)',
  },
};

export default function MatchSummaryCard({ match, theme = 'dark' }: Props) {
  const T = THEMES[theme];
  const bpo = match.ballsPerOver;

  // Status bar text
  const buildStatus = (): string => {
    if (match.winner) return `${match.winner} won by ${match.winMargin}`;
    if (match.innings.length < 2 || !match.innings[1]) {
      const inn = match.innings[0];
      const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
      return `${bt.name}: ${inn.runs}/${inn.wickets} (${getOversString(inn.balls, bpo)} ov)`;
    }
    const inn2 = match.innings[1];
    const inn1 = match.innings[0];
    if (!inn2.isComplete) {
      const target = inn1.runs + 1;
      const runsNeeded = target - inn2.runs;
      const ballsDone = inn2.balls;
      const totalBalls = match.overs * bpo;
      const ballsLeft = totalBalls - ballsDone;
      const bt2 = inn2.battingTeamIndex === 0 ? match.team1 : match.team2;
      if (runsNeeded > 0 && ballsLeft > 0) {
        return `${bt2.name} need ${runsNeeded} run${runsNeeded !== 1 ? 's' : ''} from ${ballsLeft} ball${ballsLeft !== 1 ? 's' : ''}`;
      }
    }
    return match.status === 'finished'
      ? (match.winner ? `${match.winner} won by ${match.winMargin}` : 'Match Complete')
      : `${match.matchType} | Match ${match.matchNo}`;
  };

  const divider = (
    <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }} />
  );

  return (
    <div
      className="w-[95vw] max-w-[900px] mx-auto overflow-hidden rounded-xl"
      style={{ boxShadow: '0 12px 60px rgba(0,0,0,0.7)', fontFamily: 'Oswald, system-ui, sans-serif' }}
    >
      {/* === TITLE BAR === */}
      <div
        className="flex items-center justify-center gap-4 px-5 py-2.5"
        style={{ background: T.titleBg, borderBottom: `2px solid ${T.accent}` }}
      >
        <div style={{ width: 24, height: 2, background: T.accent }} />
        <span className="font-display font-black text-white uppercase tracking-[0.25em] text-base md:text-lg drop-shadow-lg">
          MATCH SUMMARY
        </span>
        <div style={{ width: 24, height: 2, background: T.accent }} />
      </div>

      {/* Match meta */}
      <div className="text-center py-1 px-4" style={{ background: T.bg }}>
        <span style={{ color: T.textSub, fontSize: 11, letterSpacing: '0.12em', fontWeight: 700 }}>
          {match.matchType?.toUpperCase()} &nbsp;|&nbsp; MATCH {match.matchNo}
          {match.tossWonBy !== undefined &&
            ` | TOSS: ${match.tossWonBy === 0 ? match.team1.name : match.team2.name} (${match.optedTo})`}
        </span>
      </div>

      {divider}

      {/* === INNINGS SECTIONS === */}
      {match.innings.map((inn, inIdx) => {
        const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
        const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
        const btColor = inn.battingTeamIndex === 0 ? (match.team1.color || '#1976d2') : (match.team2.color || '#d32f2f');
        const bltColor = inn.bowlingTeamIndex === 0 ? (match.team1.color || '#1976d2') : (match.team2.color || '#d32f2f');

        // Batting: players who have batted + current non-out batsmen
        const currentStrikerId = inn.currentStrikerId;
        const currentNonStrikerId = inn.currentNonStrikerId;
        const batters = bt.players.filter(p =>
          p.ballsFaced > 0 || p.isOut ||
          p.id === currentStrikerId || p.id === currentNonStrikerId
        );

        // Bowling: only players who bowled
        const bowlers = blt.players.filter(p => p.bowlingBalls > 0)
          .sort((a, b) => b.bowlingBalls - a.bowlingBalls);

        const extras = inn.extras
          ? inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes
          : 0;

        return (
          <div key={inIdx} style={{ background: T.bg }}>
            {/* Team header row */}
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ background: `linear-gradient(135deg, ${btColor}dd, ${btColor}88)` }}
            >
              <div className="flex items-center gap-2">
                {bt.logo && bt.logo.length < 500 && (
                  <img src={bt.logo} alt={bt.name} className="w-7 h-7 object-contain rounded-sm" />
                )}
                <span className="font-display font-black text-white uppercase tracking-wider text-sm md:text-base drop-shadow">
                  {bt.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
                  OVERS {getOversString(inn.balls, bpo)}
                </span>
                <span className="font-display font-black text-white text-xl md:text-2xl drop-shadow-lg" style={{ letterSpacing: '0.05em' }}>
                  {inn.runs}–{inn.wickets}
                </span>
              </div>
            </div>

            {/* Two-column content: batting left, bowling right */}
            <div className="flex" style={{ borderBottom: `1px solid ${T.border}` }}>
              {/* LEFT: Batting */}
              <div className="flex-1 min-w-0" style={{ borderRight: `1px solid ${T.border}` }}>
                {/* Column headers */}
                <div
                  className="flex items-center px-2 py-1"
                  style={{ background: T.colHeaderBg, borderBottom: `1px solid ${T.border}` }}
                >
                  <span className="flex-1" style={{ fontSize: 10, fontWeight: 800, color: T.textSub, letterSpacing: '0.12em' }}>BATTER</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: T.textSub, width: 34, textAlign: 'right', letterSpacing: '0.08em' }}>R</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: T.textSub, width: 30, textAlign: 'right', letterSpacing: '0.08em' }}>B</span>
                </div>
                {/* Rows */}
                {batters.length === 0 && (
                  <div className="px-3 py-3" style={{ color: T.textSub, fontSize: 11, textAlign: 'center' }}>No data</div>
                )}
                {batters.map((p, i) => {
                  const isStriker = p.id === currentStrikerId;
                  const isNotOut = !p.isOut && (p.id === currentStrikerId || p.id === currentNonStrikerId);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center px-2 py-[5px]"
                      style={{
                        background: i % 2 === 0 ? T.batRowEven : T.batRowOdd,
                        borderBottom: `1px solid ${T.border}`,
                        minHeight: 28,
                      }}
                    >
                      {/* Striker arrow */}
                      <span style={{ width: 10, flexShrink: 0, color: T.accent, fontSize: 9, fontWeight: 900 }}>
                        {isStriker ? '▶' : ''}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span
                          className="font-display uppercase tracking-wide truncate block"
                          style={{ fontSize: 12, fontWeight: 700, color: T.text }}
                        >
                          {p.name}
                        </span>
                        {isNotOut && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#4caf50', letterSpacing: '0.05em' }}>NOT OUT</span>
                        )}
                        {p.isOut && p.dismissalType && (
                          <span style={{ fontSize: 9, color: T.textSub, letterSpacing: '0.03em' }} className="truncate block">
                            {p.dismissalType}{p.dismissedBy ? ` b ${p.dismissedBy}` : ''}
                          </span>
                        )}
                      </div>
                      <span
                        className="tabular-nums font-display font-black"
                        style={{ width: 34, textAlign: 'right', fontSize: 14, color: T.text }}
                      >
                        {p.runs}{isNotOut ? '*' : ''}
                      </span>
                      <span
                        className="tabular-nums"
                        style={{ width: 30, textAlign: 'right', fontSize: 11, color: T.textSub }}
                      >
                        {p.ballsFaced}
                      </span>
                    </div>
                  );
                })}
                {/* Extras row */}
                <div className="flex items-center px-2 py-1" style={{ background: T.colHeaderBg }}>
                  <span style={{ flex: 1, fontSize: 10, color: T.textSub, fontWeight: 700 }}>EXTRAS</span>
                  <span style={{ fontSize: 10, color: T.textSub, fontWeight: 700 }}>{extras}</span>
                </div>
              </div>

              {/* RIGHT: Bowling */}
              <div style={{ width: '42%', flexShrink: 0 }}>
                {/* Column headers */}
                <div
                  className="flex items-center px-2 py-1"
                  style={{ background: T.colHeaderBg, borderBottom: `1px solid ${T.border}` }}
                >
                  <span className="flex-1" style={{ fontSize: 10, fontWeight: 800, color: T.textSub, letterSpacing: '0.12em' }}>BOWLER</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: T.textSub, width: 48, textAlign: 'right' }}>W–R</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: T.textSub, width: 32, textAlign: 'right' }}>OV</span>
                </div>
                {/* Rows */}
                {bowlers.length === 0 && (
                  <div className="px-3 py-3" style={{ color: T.textSub, fontSize: 11, textAlign: 'center' }}>No data</div>
                )}
                {bowlers.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center px-2 py-[5px]"
                    style={{
                      background: i % 2 === 0 ? T.ballRowEven : T.ballRowOdd,
                      borderBottom: `1px solid ${T.border}`,
                      minHeight: 28,
                    }}
                  >
                    <span
                      className="flex-1 font-display uppercase tracking-wide truncate"
                      style={{ fontSize: 12, fontWeight: 700, color: T.text }}
                    >
                      {p.name}
                    </span>
                    <span
                      className="tabular-nums font-display font-black"
                      style={{
                        width: 48,
                        textAlign: 'right',
                        fontSize: 13,
                        color: p.bowlingWickets > 0 ? '#ef5350' : T.text,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {p.bowlingWickets}–{p.bowlingRuns}
                    </span>
                    <span
                      className="tabular-nums"
                      style={{ width: 32, textAlign: 'right', fontSize: 11, color: T.textSub }}
                    >
                      {getOversString(p.bowlingBalls, bpo)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {inIdx < match.innings.length - 1 && divider}
          </div>
        );
      })}

      {divider}

      {/* === STATUS BAR === */}
      <div
        className="flex items-center justify-center px-5 py-2.5"
        style={{ background: T.statusBg }}
      >
        <span
          className="font-display font-black uppercase tracking-[0.15em] text-center"
          style={{ color: T.accent, fontSize: 13, letterSpacing: '0.15em', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
        >
          {buildStatus()}
        </span>
      </div>
    </div>
  );
}
