import { useEffect, useState, useMemo } from 'react';
import { Match } from '@/types/cricket';
import { getMatchesForTournament } from '@/lib/store';
import { Trophy, TrendingUp, Target, Zap, Star } from 'lucide-react';

type TourStatsMode =
  | 'tour_points'
  | 'tour_points_tied'
  | 'tour_batters'
  | 'tour_bowlers'
  | 'tour_boundaries'
  | 'tour_series';

interface Props {
  tournamentId: string;
  mode: TourStatsMode;
  variant?: 'forest' | 'dark' | 'blue' | 'purple';
}

// ── helpers ──────────────────────────────────────────────────────────────────
interface TeamStat {
  name: string;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  runsFor: number;
  ballsFor: number;
  runsAgainst: number;
  ballsAgainst: number;
  nrr: number;
}

function calcNRR(rf: number, bf: number, ra: number, ba: number, bpo = 6) {
  if (!bf || !ba) return 0;
  return parseFloat(((rf / bf) * bpo - (ra / ba) * bpo).toFixed(2));
}

// ── Theme tokens ─────────────────────────────────────────────────────────────
const THEMES = {
  forest: {
    bg: 'linear-gradient(180deg, #071207 0%, #0a1f0a 100%)',
    header: 'linear-gradient(135deg, #155215, #0d3b0d)',
    accent: '#fdd835',
    rowEven: 'rgba(255,255,255,0.025)',
    rowOdd: 'transparent',
    border: 'rgba(253,216,53,0.18)',
    subText: 'rgba(255,255,255,0.45)',
  },
  dark: {
    bg: 'linear-gradient(180deg, #0a0a0a 0%, #141414 100%)',
    header: 'linear-gradient(135deg, #1a1a1a, #111)',
    accent: '#fdd835',
    rowEven: 'rgba(255,255,255,0.025)',
    rowOdd: 'transparent',
    border: 'rgba(253,216,53,0.18)',
    subText: 'rgba(255,255,255,0.45)',
  },
  blue: {
    bg: 'linear-gradient(180deg, #050d1a 0%, #071529 100%)',
    header: 'linear-gradient(135deg, #0d2257, #091940)',
    accent: '#64b5f6',
    rowEven: 'rgba(100,181,246,0.04)',
    rowOdd: 'transparent',
    border: 'rgba(100,181,246,0.18)',
    subText: 'rgba(255,255,255,0.45)',
  },
  purple: {
    bg: 'linear-gradient(180deg, #0d0514 0%, #130820 100%)',
    header: 'linear-gradient(135deg, #2d1b69, #1a0e3d)',
    accent: '#ce93d8',
    rowEven: 'rgba(206,147,216,0.04)',
    rowOdd: 'transparent',
    border: 'rgba(206,147,216,0.18)',
    subText: 'rgba(255,255,255,0.45)',
  },
};

const TourStatsDisplay = ({ tournamentId, mode, variant = 'forest' }: Props) => {
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const theme = THEMES[variant];
  const GOLD = theme.accent;

  useEffect(() => {
    setLoading(true);
    getMatchesForTournament(tournamentId)
      .then(ms => setAllMatches(ms))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  const finished = useMemo(() => allMatches.filter(m => m.status === 'finished'), [allMatches]);

  // ── Points Table ────────────────────────────────────────────────────────────
  const pointsTable = useMemo<TeamStat[]>(() => {
    const map: Record<string, TeamStat> = {};
    const ensure = (n: string) => {
      if (!map[n]) map[n] = { name: n, matches: 0, wins: 0, losses: 0, ties: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0 };
    };
    finished.forEach(m => {
      const bpo = m.ballsPerOver || 6;
      const t1 = m.team1.name, t2 = m.team2.name;
      ensure(t1); ensure(t2);
      map[t1].matches++; map[t2].matches++;
      m.innings.forEach(inn => {
        const bat = inn.battingTeamIndex === 0 ? t1 : t2;
        const bowl = inn.battingTeamIndex === 0 ? t2 : t1;
        map[bat].runsFor += inn.runs; map[bat].ballsFor += inn.balls;
        map[bowl].runsAgainst += inn.runs; map[bowl].ballsAgainst += inn.balls;
      });
      if (m.winner) {
        if (m.winner === t1) { map[t1].wins++; map[t2].losses++; map[t1].points += 2; }
        else if (m.winner === t2) { map[t2].wins++; map[t1].losses++; map[t2].points += 2; }
        else {
          // tied
          map[t1].ties++; map[t2].ties++;
          if (mode === 'tour_points_tied') { map[t1].points += 1; map[t2].points += 1; }
          else { map[t1].points += 1; map[t2].points += 1; }
        }
      }
      map[t1].nrr = calcNRR(map[t1].runsFor, map[t1].ballsFor, map[t1].runsAgainst, map[t1].ballsAgainst, bpo);
      map[t2].nrr = calcNRR(map[t2].runsFor, map[t2].ballsFor, map[t2].runsAgainst, map[t2].ballsAgainst, bpo);
    });
    return Object.values(map).sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  }, [finished, mode]);

  // ── Top Batters ─────────────────────────────────────────────────────────────
  const topBatters = useMemo(() => {
    const map: Record<string, { name: string; team: string; runs: number; balls: number; fours: number; sixes: number; matches: number; best: number; bestBalls: number }> = {};
    allMatches.forEach(m => {
      [m.team1, m.team2].forEach(team => {
        team.players.forEach(p => {
          if (p.ballsFaced === 0 && p.runs === 0) return;
          const key = `${p.name}__${team.name}`;
          if (!map[key]) map[key] = { name: p.name, team: team.name, runs: 0, balls: 0, fours: 0, sixes: 0, matches: 0, best: 0, bestBalls: 0 };
          map[key].runs += p.runs; map[key].balls += p.ballsFaced;
          map[key].fours += p.fours; map[key].sixes += p.sixes;
          map[key].matches++;
          if (p.runs > map[key].best) { map[key].best = p.runs; map[key].bestBalls = p.ballsFaced; }
        });
      });
    });
    return Object.values(map).sort((a, b) => b.runs - a.runs).slice(0, 10);
  }, [allMatches]);

  // ── Top Bowlers ─────────────────────────────────────────────────────────────
  const topBowlers = useMemo(() => {
    const map: Record<string, { name: string; team: string; wickets: number; runs: number; balls: number; matches: number; bestW: number; bestR: number }> = {};
    allMatches.forEach(m => {
      [m.team1, m.team2].forEach(team => {
        team.players.forEach(p => {
          if (p.bowlingBalls === 0) return;
          const key = `${p.name}__${team.name}`;
          if (!map[key]) map[key] = { name: p.name, team: team.name, wickets: 0, runs: 0, balls: 0, matches: 0, bestW: 0, bestR: 0 };
          map[key].wickets += p.bowlingWickets; map[key].runs += p.bowlingRuns; map[key].balls += p.bowlingBalls;
          map[key].matches++;
          if (p.bowlingWickets > map[key].bestW || (p.bowlingWickets === map[key].bestW && p.bowlingRuns < map[key].bestR)) {
            map[key].bestW = p.bowlingWickets; map[key].bestR = p.bowlingRuns;
          }
        });
      });
    });
    return Object.values(map).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, 10);
  }, [allMatches]);

  // ── Boundaries ──────────────────────────────────────────────────────────────
  const topBoundaries = useMemo(() => {
    const map: Record<string, { name: string; team: string; fours: number; sixes: number; matches: number }> = {};
    allMatches.forEach(m => {
      [m.team1, m.team2].forEach(team => {
        team.players.forEach(p => {
          if (p.fours === 0 && p.sixes === 0) return;
          const key = `${p.name}__${team.name}`;
          if (!map[key]) map[key] = { name: p.name, team: team.name, fours: 0, sixes: 0, matches: 0 };
          map[key].fours += p.fours; map[key].sixes += p.sixes; map[key].matches++;
        });
      });
    });
    return Object.values(map).sort((a, b) => (b.fours + b.sixes) - (a.fours + a.sixes)).slice(0, 10);
  }, [allMatches]);

  // ── Player of Series (MOM count) ────────────────────────────────────────────
  const topSeries = useMemo(() => {
    const map: Record<string, { name: string; count: number; totalRuns: number; totalWickets: number }> = {};
    finished.forEach(m => {
      if (!m.mom) return;
      if (!map[m.mom]) map[m.mom] = { name: m.mom, count: 0, totalRuns: 0, totalWickets: 0 };
      map[m.mom].count++;
      // Try to find stats
      [...m.team1.players, ...m.team2.players].forEach(p => {
        if (p.name === m.mom) {
          map[m.mom].totalRuns += p.runs;
          map[m.mom].totalWickets += p.bowlingWickets;
        }
      });
    });
    return Object.values(map).sort((a, b) => b.count - a.count || b.totalRuns - a.totalRuns).slice(0, 10);
  }, [finished]);

  // ── Shared layout ────────────────────────────────────────────────────────────
  const hc = 'px-3 py-2 text-center text-[10px] font-black uppercase tracking-widest';
  const td = 'px-3 py-2.5 text-center text-[13px] tabular-nums';

  const Wrapper = ({ children, icon, title }: { children: React.ReactNode; icon: React.ReactNode; title: string }) => (
    <div
      className="w-[90vw] max-w-[820px] mx-auto overflow-hidden rounded-2xl"
      style={{ background: theme.bg, boxShadow: `0 16px 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,0,0,0.4), inset 0 1px 0 ${GOLD}30` }}
    >
      {/* Gold top line */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4" style={{ background: theme.header }}>
        <div style={{ color: GOLD }}>{icon}</div>
        <span className="font-display text-xl font-black text-white uppercase tracking-widest">{title}</span>
        <div className="flex-1 h-px ml-2" style={{ background: `linear-gradient(90deg, ${GOLD}60, transparent)` }} />
        <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: `${GOLD}20`, color: GOLD }}>TOURNAMENT</span>
      </div>
      <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${GOLD}60, transparent)` }} />
      {children}
      {/* Gold bottom line */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
    </div>
  );

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3" style={{ borderColor: `${GOLD} transparent ${GOLD} ${GOLD}` }} />
          <p className="text-sm font-display tracking-widest" style={{ color: GOLD }}>LOADING STATS...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // POINTS TABLE
  // ══════════════════════════════════════════════════════════════
  if (mode === 'tour_points' || mode === 'tour_points_tied') {
    return (
      <Wrapper icon={<Trophy className="w-6 h-6" />} title={mode === 'tour_points_tied' ? 'POINTS TABLE  (TIED = +1)' : 'POINTS TABLE'}>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: `linear-gradient(135deg, ${GOLD}ee, ${GOLD}bb)` }}>
              <th className={`${hc} text-left pl-5 text-black`}>#</th>
              <th className={`${hc} text-left text-black`}>TEAM</th>
              <th className={`${hc} text-black`}>M</th>
              <th className={`${hc} text-black`}>W</th>
              <th className={`${hc} text-black`}>L</th>
              <th className={`${hc} text-black`}>T</th>
              <th className={`${hc} text-black font-black text-sm`}>PTS</th>
              <th className={`${hc} text-black`}>NRR</th>
            </tr>
          </thead>
          <tbody>
            {pointsTable.map((t, i) => (
              <tr
                key={t.name}
                style={{
                  background: i % 2 === 0 ? theme.rowEven : theme.rowOdd,
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <td className={`${td} text-left pl-5 font-black text-lg`} style={{ color: GOLD }}>{i + 1}</td>
                <td className={`${td} text-left font-black text-white text-base`}>{t.name}</td>
                <td className={`${td}`} style={{ color: theme.subText }}>{t.matches}</td>
                <td className={`${td} font-black`} style={{ color: '#66bb6a' }}>{t.wins}</td>
                <td className={`${td}`} style={{ color: '#ef5350' }}>{t.losses}</td>
                <td className={`${td}`} style={{ color: '#ffa726' }}>{t.ties}</td>
                <td className={`${td} text-xl font-black`} style={{ color: GOLD }}>{t.points}</td>
                <td className={`${td} font-black`} style={{ color: t.nrr >= 0 ? '#66bb6a' : '#ef5350' }}>
                  {t.nrr >= 0 ? '+' : ''}{t.nrr.toFixed(3)}
                </td>
              </tr>
            ))}
            {pointsTable.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 font-display tracking-widest text-sm" style={{ color: theme.subText }}>No finished matches yet</td></tr>
            )}
          </tbody>
        </table>
      </Wrapper>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TOP BATTERS
  // ══════════════════════════════════════════════════════════════
  if (mode === 'tour_batters') {
    return (
      <Wrapper icon={<TrendingUp className="w-6 h-6" />} title="TOP RUN SCORERS">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: `linear-gradient(135deg, ${GOLD}ee, ${GOLD}bb)` }}>
              <th className={`${hc} text-left pl-5 text-black`}>#</th>
              <th className={`${hc} text-left text-black`}>BATSMAN</th>
              <th className={`${hc} text-black`}>TEAM</th>
              <th className={`${hc} text-black font-black text-sm`}>RUNS</th>
              <th className={`${hc} text-black`}>M</th>
              <th className={`${hc} text-black`}>BALLS</th>
              <th className={`${hc} text-black`}>4s</th>
              <th className={`${hc} text-black`}>6s</th>
              <th className={`${hc} text-black`}>BEST</th>
            </tr>
          </thead>
          <tbody>
            {topBatters.map((b, i) => (
              <tr key={`${b.name}-${b.team}`} style={{ background: i % 2 === 0 ? theme.rowEven : theme.rowOdd, borderBottom: `1px solid ${theme.border}` }}>
                <td className={`${td} text-left pl-5 font-black text-lg`} style={{ color: GOLD }}>{i + 1}</td>
                <td className={`${td} text-left font-black text-white text-base`}>{b.name}</td>
                <td className={`${td} text-sm`} style={{ color: theme.subText }}>{b.team}</td>
                <td className={`${td} text-xl font-black`} style={{ color: GOLD }}>{b.runs}</td>
                <td className={`${td}`} style={{ color: theme.subText }}>{b.matches}</td>
                <td className={`${td}`} style={{ color: theme.subText }}>{b.balls}</td>
                <td className={`${td} font-black`} style={{ color: '#ffa726' }}>{b.fours}</td>
                <td className={`${td} font-black`} style={{ color: '#ab47bc' }}>{b.sixes}</td>
                <td className={`${td} text-sm font-mono`} style={{ color: '#66bb6a' }}>{b.best}({b.bestBalls})</td>
              </tr>
            ))}
            {topBatters.length === 0 && (
              <tr><td colSpan={9} className="text-center py-10 font-display tracking-widest text-sm" style={{ color: theme.subText }}>No batting data yet</td></tr>
            )}
          </tbody>
        </table>
      </Wrapper>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TOP BOWLERS
  // ══════════════════════════════════════════════════════════════
  if (mode === 'tour_bowlers') {
    return (
      <Wrapper icon={<Target className="w-6 h-6" />} title="TOP WICKET TAKERS">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: `linear-gradient(135deg, ${GOLD}ee, ${GOLD}bb)` }}>
              <th className={`${hc} text-left pl-5 text-black`}>#</th>
              <th className={`${hc} text-left text-black`}>BOWLER</th>
              <th className={`${hc} text-black`}>TEAM</th>
              <th className={`${hc} text-black font-black text-sm`}>WKT</th>
              <th className={`${hc} text-black`}>M</th>
              <th className={`${hc} text-black`}>RUNS</th>
              <th className={`${hc} text-black`}>OVERS</th>
              <th className={`${hc} text-black`}>ECON</th>
              <th className={`${hc} text-black`}>BEST</th>
            </tr>
          </thead>
          <tbody>
            {topBowlers.map((b, i) => {
              const bpo = 6;
              const econ = b.balls > 0 ? ((b.runs / b.balls) * bpo).toFixed(2) : '0.00';
              const overs = `${Math.floor(b.balls / bpo)}.${b.balls % bpo}`;
              return (
                <tr key={`${b.name}-${b.team}`} style={{ background: i % 2 === 0 ? theme.rowEven : theme.rowOdd, borderBottom: `1px solid ${theme.border}` }}>
                  <td className={`${td} text-left pl-5 font-black text-lg`} style={{ color: GOLD }}>{i + 1}</td>
                  <td className={`${td} text-left font-black text-white text-base`}>{b.name}</td>
                  <td className={`${td} text-sm`} style={{ color: theme.subText }}>{b.team}</td>
                  <td className={`${td} text-xl font-black`} style={{ color: GOLD }}>{b.wickets}</td>
                  <td className={`${td}`} style={{ color: theme.subText }}>{b.matches}</td>
                  <td className={`${td}`} style={{ color: theme.subText }}>{b.runs}</td>
                  <td className={`${td}`} style={{ color: theme.subText }}>{overs}</td>
                  <td className={`${td} font-bold`} style={{ color: '#64b5f6' }}>{econ}</td>
                  <td className={`${td} font-mono text-sm`} style={{ color: '#66bb6a' }}>{b.bestW}-{b.bestR}</td>
                </tr>
              );
            })}
            {topBowlers.length === 0 && (
              <tr><td colSpan={9} className="text-center py-10 font-display tracking-widest text-sm" style={{ color: theme.subText }}>No bowling data yet</td></tr>
            )}
          </tbody>
        </table>
      </Wrapper>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TOP 4/6 STRIKERS
  // ══════════════════════════════════════════════════════════════
  if (mode === 'tour_boundaries') {
    return (
      <Wrapper icon={<Zap className="w-6 h-6" />} title="TOP BOUNDARY STRIKERS">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: `linear-gradient(135deg, ${GOLD}ee, ${GOLD}bb)` }}>
              <th className={`${hc} text-left pl-5 text-black`}>#</th>
              <th className={`${hc} text-left text-black`}>PLAYER</th>
              <th className={`${hc} text-black`}>TEAM</th>
              <th className={`${hc} text-black`}>M</th>
              <th className={`${hc} text-black font-black`}>4s</th>
              <th className={`${hc} text-black font-black`}>6s</th>
              <th className={`${hc} text-black font-black text-sm`}>TOTAL</th>
              <th className={`${hc} text-black`}>BOUNDARY%</th>
            </tr>
          </thead>
          <tbody>
            {topBoundaries.map((b, i) => {
              const total = b.fours + b.sixes;
              const fourPct = total > 0 ? Math.round((b.fours / total) * 100) : 0;
              return (
                <tr key={`${b.name}-${b.team}`} style={{ background: i % 2 === 0 ? theme.rowEven : theme.rowOdd, borderBottom: `1px solid ${theme.border}` }}>
                  <td className={`${td} text-left pl-5 font-black text-lg`} style={{ color: GOLD }}>{i + 1}</td>
                  <td className={`${td} text-left font-black text-white text-base`}>{b.name}</td>
                  <td className={`${td} text-sm`} style={{ color: theme.subText }}>{b.team}</td>
                  <td className={`${td}`} style={{ color: theme.subText }}>{b.matches}</td>
                  <td className={`${td} text-lg font-black`} style={{ color: '#ffa726' }}>{b.fours}</td>
                  <td className={`${td} text-lg font-black`} style={{ color: '#ab47bc' }}>{b.sixes}</td>
                  <td className={`${td} text-xl font-black`} style={{ color: GOLD }}>{total}</td>
                  <td className={`${td}`}>
                    <div className="flex items-center gap-1.5 justify-center">
                      <div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div className="h-full rounded-full" style={{ width: `${fourPct}%`, background: `linear-gradient(90deg, #ffa726, ${GOLD})` }} />
                      </div>
                      <span className="text-xs" style={{ color: theme.subText }}>{fourPct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {topBoundaries.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 font-display tracking-widest text-sm" style={{ color: theme.subText }}>No boundary data yet</td></tr>
            )}
          </tbody>
        </table>
      </Wrapper>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TOP PLAYER OF SERIES
  // ══════════════════════════════════════════════════════════════
  if (mode === 'tour_series') {
    return (
      <Wrapper icon={<Star className="w-6 h-6" />} title="PLAYER OF THE SERIES">
        <div className="p-4 space-y-3">
          {topSeries.length === 0 && (
            <p className="text-center py-10 font-display tracking-widest text-sm" style={{ color: theme.subText }}>No MOM awards yet</p>
          )}
          {topSeries.map((p, i) => (
            <div
              key={p.name}
              className="flex items-center gap-4 px-5 py-4 rounded-xl"
              style={{
                background: i === 0
                  ? `linear-gradient(135deg, ${GOLD}22, ${GOLD}08)`
                  : i === 1
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${i === 0 ? GOLD + '60' : theme.border}`,
                boxShadow: i === 0 ? `0 0 20px ${GOLD}20` : 'none',
              }}
            >
              {/* Rank medal */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0"
                style={{
                  background: i === 0
                    ? `linear-gradient(135deg, ${GOLD}, #f57f17)`
                    : i === 1
                    ? 'linear-gradient(135deg, #bdbdbd, #9e9e9e)'
                    : i === 2
                    ? 'linear-gradient(135deg, #a1665e, #6d4c41)'
                    : 'rgba(255,255,255,0.1)',
                  color: i < 3 ? '#000' : 'rgba(255,255,255,0.5)',
                  boxShadow: i === 0 ? `0 4px 12px ${GOLD}50` : 'none',
                }}
              >
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="font-display font-black text-white text-lg uppercase tracking-wider truncate">{p.name}</p>
                <p className="text-xs mt-0.5" style={{ color: theme.subText }}>
                  Runs: <span className="font-bold text-white">{p.totalRuns}</span>
                  {p.totalWickets > 0 && <> · Wkts: <span className="font-bold text-white">{p.totalWickets}</span></>}
                </p>
              </div>

              {/* MOM count */}
              <div className="text-center flex-shrink-0">
                <div className="text-4xl font-black font-display" style={{ color: i === 0 ? GOLD : 'rgba(255,255,255,0.7)' }}>{p.count}</div>
                <div className="text-[10px] font-display font-bold tracking-widest uppercase" style={{ color: theme.subText }}>MOM</div>
              </div>

              {/* Star icons */}
              <div className="flex gap-0.5 flex-shrink-0">
                {Array.from({ length: Math.min(p.count, 5) }).map((_, si) => (
                  <Star key={si} className="w-4 h-4" style={{ color: i === 0 ? GOLD : 'rgba(255,255,255,0.3)', fill: i === 0 ? GOLD : 'rgba(255,255,255,0.15)' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Wrapper>
    );
  }

  return null;
};

export default TourStatsDisplay;
