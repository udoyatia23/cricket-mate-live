import { useMemo } from 'react';
import { Match } from '@/types/cricket';
import { Trophy, TrendingUp, Zap, Target, Star } from 'lucide-react';

interface Props {
  matches: Match[];
}

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

interface BatsmanStat {
  name: string;
  team: string;
  runs: number;
  matches: number;
  balls: number;
  fours: number;
  sixes: number;
  bestRuns: number;
  bestBalls: number;
}

interface BowlerStat {
  name: string;
  team: string;
  wickets: number;
  matches: number;
  runsConceded: number;
  balls: number;
  bestWickets: number;
  bestRuns: number;
}

interface BoundaryStat {
  name: string;
  team: string;
  matches: number;
  fours: number;
  sixes: number;
  total: number;
}

function calcNRR(runsFor: number, ballsFor: number, runsAgainst: number, ballsAgainst: number, bpo = 6): number {
  if (ballsFor === 0 || ballsAgainst === 0) return 0;
  const rrf = (runsFor / ballsFor) * bpo;
  const rra = (runsAgainst / ballsAgainst) * bpo;
  return parseFloat((rrf - rra).toFixed(2));
}

const TournamentStats = ({ matches }: Props) => {
  const finished = useMemo(() => matches.filter(m => m.status === 'finished'), [matches]);

  // ── Points Table ────────────────────────────────────────────────────────────
  const pointsTable = useMemo<TeamStat[]>(() => {
    const map: Record<string, TeamStat> = {};

    const ensure = (name: string) => {
      if (!map[name]) map[name] = { name, matches: 0, wins: 0, losses: 0, ties: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0 };
    };

    finished.forEach(m => {
      const bpo = m.ballsPerOver || 6;
      const t1 = m.team1.name;
      const t2 = m.team2.name;
      ensure(t1); ensure(t2);
      map[t1].matches++; map[t2].matches++;

      // Gather innings runs/balls
      m.innings.forEach(inn => {
        const batTeam = inn.battingTeamIndex === 0 ? t1 : t2;
        const bowlTeam = inn.battingTeamIndex === 0 ? t2 : t1;
        map[batTeam].runsFor += inn.runs;
        map[batTeam].ballsFor += inn.balls;
        map[bowlTeam].runsAgainst += inn.runs;
        map[bowlTeam].ballsAgainst += inn.balls;
      });

      if (m.winner) {
        if (m.winner === t1) { map[t1].wins++; map[t1].points += 2; map[t2].losses++; }
        else if (m.winner === t2) { map[t2].wins++; map[t2].points += 2; map[t1].losses++; }
        else { map[t1].ties++; map[t1].points++; map[t2].ties++; map[t2].points++; }
      }

      map[t1].nrr = calcNRR(map[t1].runsFor, map[t1].ballsFor, map[t1].runsAgainst, map[t1].ballsAgainst, bpo);
      map[t2].nrr = calcNRR(map[t2].runsFor, map[t2].ballsFor, map[t2].runsAgainst, map[t2].ballsAgainst, bpo);
    });

    return Object.values(map).sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  }, [finished]);

  // ── Top Batsmen ─────────────────────────────────────────────────────────────
  const topBatsmen = useMemo<BatsmanStat[]>(() => {
    const map: Record<string, BatsmanStat> = {};

    matches.forEach(m => {
      [m.team1, m.team2].forEach((team, ti) => {
        team.players.forEach(p => {
          if (p.ballsFaced === 0 && p.runs === 0) return;
          const key = `${p.name}__${team.name}`;
          if (!map[key]) map[key] = { name: p.name, team: team.name, runs: 0, matches: 0, balls: 0, fours: 0, sixes: 0, bestRuns: 0, bestBalls: 0 };
          map[key].runs += p.runs;
          map[key].balls += p.ballsFaced;
          map[key].fours += p.fours;
          map[key].sixes += p.sixes;
          map[key].matches++;
          if (p.runs > map[key].bestRuns) { map[key].bestRuns = p.runs; map[key].bestBalls = p.ballsFaced; }
        });
      });
    });

    return Object.values(map).sort((a, b) => b.runs - a.runs || b.bestRuns - a.bestRuns).slice(0, 20);
  }, [matches]);

  // ── Top Bowlers ─────────────────────────────────────────────────────────────
  const topBowlers = useMemo<BowlerStat[]>(() => {
    const map: Record<string, BowlerStat> = {};

    matches.forEach(m => {
      [m.team1, m.team2].forEach(team => {
        team.players.forEach(p => {
          if (p.bowlingBalls === 0) return;
          const key = `${p.name}__${team.name}`;
          if (!map[key]) map[key] = { name: p.name, team: team.name, wickets: 0, matches: 0, runsConceded: 0, balls: 0, bestWickets: 0, bestRuns: 0 };
          map[key].wickets += p.bowlingWickets;
          map[key].runsConceded += p.bowlingRuns;
          map[key].balls += p.bowlingBalls;
          map[key].matches++;
          if (p.bowlingWickets > map[key].bestWickets || (p.bowlingWickets === map[key].bestWickets && p.bowlingRuns < map[key].bestRuns)) {
            map[key].bestWickets = p.bowlingWickets;
            map[key].bestRuns = p.bowlingRuns;
          }
        });
      });
    });

    return Object.values(map).sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded).slice(0, 20);
  }, [matches]);

  // ── Boundaries Striker ───────────────────────────────────────────────────────
  const boundaryStrikers = useMemo<BoundaryStat[]>(() => {
    const map: Record<string, BoundaryStat> = {};

    matches.forEach(m => {
      [m.team1, m.team2].forEach(team => {
        team.players.forEach(p => {
          if (p.fours === 0 && p.sixes === 0) return;
          const key = `${p.name}__${team.name}`;
          if (!map[key]) map[key] = { name: p.name, team: team.name, matches: 0, fours: 0, sixes: 0, total: 0 };
          map[key].fours += p.fours;
          map[key].sixes += p.sixes;
          map[key].total = map[key].fours + map[key].sixes;
          map[key].matches++;
        });
      });
    });

    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [matches]);

  // ── Tournament Boundaries ───────────────────────────────────────────────────
  const { totalFours, totalSixes } = useMemo(() => {
    let totalFours = 0, totalSixes = 0;
    matches.forEach(m => {
      [m.team1, m.team2].forEach(team => team.players.forEach(p => {
        totalFours += p.fours; totalSixes += p.sixes;
      }));
    });
    return { totalFours, totalSixes };
  }, [matches]);

  // ── MOM List ─────────────────────────────────────────────────────────────────
  const momList = useMemo(() => {
    return finished
      .filter(m => m.mom)
      .map(m => ({ player: m.mom!, match: `${m.team1.name} vs ${m.team2.name}`, matchNo: m.matchNo }))
      .reverse();
  }, [finished]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const headerCell = "px-3 py-2 text-center text-xs font-bold uppercase tracking-wide";
  const cell = "px-3 py-2.5 text-center text-sm";
  const evenRow = "bg-[#0a2a1a]";
  const oddRow = "bg-[#0d1f15]";

  const SectionTitle = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-[#fdd835]">{icon}</div>
      <h3 className="font-display text-xl font-bold text-white">{title}</h3>
      <div className="flex-1 h-px bg-gradient-to-r from-[#fdd835]/40 to-transparent ml-2" />
    </div>
  );

  if (matches.length === 0) {
    return (
      <div className="text-center py-20">
        <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-lg">No matches available for stats yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">

      {/* ── POINTS TABLE ──────────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<Trophy className="w-5 h-5" />} title="POINTS TABLE" />
        <div className="overflow-x-auto rounded-xl border border-[#fdd835]/30 shadow-lg">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-[#fdd835] to-[#f9a825] text-black">
                <th className={`${headerCell} text-left pl-4`}>#</th>
                <th className={`${headerCell} text-left`}>TEAM</th>
                <th className={headerCell}>M</th>
                <th className={headerCell}>W</th>
                <th className={headerCell}>L</th>
                <th className={headerCell}>PTS</th>
                <th className={headerCell}>NRR</th>
              </tr>
            </thead>
            <tbody>
              {pointsTable.map((t, i) => (
                <tr key={t.name} className={`border-b border-[#1a3a25] ${i % 2 === 0 ? evenRow : oddRow} hover:bg-[#1a3a25]/50 transition-colors`}>
                  <td className={`${cell} text-left pl-4 font-bold text-[#fdd835]`}>{i + 1}</td>
                  <td className={`${cell} text-left font-semibold text-white`}>{t.name}</td>
                  <td className={`${cell} text-[#90caf9]`}>{t.matches}</td>
                  <td className={`${cell} text-green-400 font-bold`}>{t.wins}</td>
                  <td className={`${cell} text-red-400`}>{t.losses}</td>
                  <td className={`${cell} font-bold text-[#fdd835] text-base`}>{t.points}</td>
                  <td className={`${cell} ${t.nrr >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.nrr >= 0 ? '+' : ''}{t.nrr.toFixed(2)}
                  </td>
                </tr>
              ))}
              {pointsTable.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No finished matches yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── TOP BATSMEN ───────────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<TrendingUp className="w-5 h-5" />} title="HIGHEST RUNS SCORER" />
        <div className="overflow-x-auto rounded-xl border border-[#fdd835]/30 shadow-lg">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-[#fdd835] to-[#f9a825] text-black">
                <th className={`${headerCell} text-left pl-4`}>#</th>
                <th className={`${headerCell} text-left`}>NAME</th>
                <th className={headerCell}>RUNS</th>
                <th className={headerCell}>M</th>
                <th className={headerCell}>BALLS</th>
                <th className={`${headerCell} text-left`}>TEAM</th>
                <th className={headerCell}>BEST</th>
              </tr>
            </thead>
            <tbody>
              {topBatsmen.slice(0, 10).map((b, i) => (
                <tr key={`${b.name}-${b.team}`} className={`border-b border-[#1a3a25] ${i % 2 === 0 ? evenRow : oddRow} hover:bg-[#1a3a25]/50 transition-colors`}>
                  <td className={`${cell} text-left pl-4 font-bold text-[#fdd835]`}>{i + 1}</td>
                  <td className={`${cell} text-left font-semibold text-white`}>{b.name}</td>
                  <td className={`${cell} font-bold text-[#fdd835] text-base`}>{b.runs}</td>
                  <td className={`${cell} text-[#90caf9]`}>{b.matches}</td>
                  <td className={`${cell} text-muted-foreground`}>{b.balls}</td>
                  <td className={`${cell} text-left text-sm text-[#90caf9]`}>{b.team}</td>
                  <td className={`${cell} text-green-400 font-mono text-xs`}>{b.bestRuns}({b.bestBalls})</td>
                </tr>
              ))}
              {topBatsmen.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No batting data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── TOP BOWLERS ───────────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<Target className="w-5 h-5" />} title="HIGHEST WICKETS TAKER" />
        <div className="overflow-x-auto rounded-xl border border-[#fdd835]/30 shadow-lg">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-[#fdd835] to-[#f9a825] text-black">
                <th className={`${headerCell} text-left pl-4`}>#</th>
                <th className={`${headerCell} text-left`}>NAME</th>
                <th className={headerCell}>WKT</th>
                <th className={headerCell}>M</th>
                <th className={headerCell}>RUNS</th>
                <th className={`${headerCell} text-left`}>TEAM</th>
                <th className={headerCell}>BEST</th>
              </tr>
            </thead>
            <tbody>
              {topBowlers.slice(0, 10).map((b, i) => (
                <tr key={`${b.name}-${b.team}`} className={`border-b border-[#1a3a25] ${i % 2 === 0 ? evenRow : oddRow} hover:bg-[#1a3a25]/50 transition-colors`}>
                  <td className={`${cell} text-left pl-4 font-bold text-[#fdd835]`}>{i + 1}</td>
                  <td className={`${cell} text-left font-semibold text-white`}>{b.name}</td>
                  <td className={`${cell} font-bold text-[#fdd835] text-base`}>{b.wickets}</td>
                  <td className={`${cell} text-[#90caf9]`}>{b.matches}</td>
                  <td className={`${cell} text-muted-foreground`}>{b.runsConceded}</td>
                  <td className={`${cell} text-left text-sm text-[#90caf9]`}>{b.team}</td>
                  <td className={`${cell} text-green-400 font-mono text-xs`}>{b.bestWickets}-{b.bestRuns}</td>
                </tr>
              ))}
              {topBowlers.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No bowling data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── BOUNDARY STRIKERS ─────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={<Zap className="w-5 h-5" />} title="HIGHEST BOUNDARIES STRIKER" />
        <div className="overflow-x-auto rounded-xl border border-[#fdd835]/30 shadow-lg">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-[#fdd835] to-[#f9a825] text-black">
                <th className={`${headerCell} text-left pl-4`}>#</th>
                <th className={`${headerCell} text-left`}>NAME</th>
                <th className={headerCell}>M</th>
                <th className={headerCell}>4s</th>
                <th className={headerCell}>6s</th>
                <th className={headerCell}>TOTAL</th>
                <th className={`${headerCell} text-left`}>TEAM</th>
              </tr>
            </thead>
            <tbody>
              {boundaryStrikers.slice(0, 10).map((b, i) => (
                <tr key={`${b.name}-${b.team}`} className={`border-b border-[#1a3a25] ${i % 2 === 0 ? evenRow : oddRow} hover:bg-[#1a3a25]/50 transition-colors`}>
                  <td className={`${cell} text-left pl-4 font-bold text-[#fdd835]`}>{i + 1}</td>
                  <td className={`${cell} text-left font-semibold text-white`}>{b.name}</td>
                  <td className={`${cell} text-[#90caf9]`}>{b.matches}</td>
                  <td className={`${cell} text-orange-400 font-bold`}>{b.fours}</td>
                  <td className={`${cell} text-purple-400 font-bold`}>{b.sixes}</td>
                  <td className={`${cell} font-bold text-[#fdd835] text-base`}>{b.total}</td>
                  <td className={`${cell} text-left text-sm text-[#90caf9]`}>{b.team}</td>
                </tr>
              ))}
              {boundaryStrikers.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No boundary data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── TOURNAMENT BOUNDARIES + MOM ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Boundaries */}
        <section>
          <SectionTitle icon={<Zap className="w-5 h-5" />} title="TOURNAMENT BOUNDARIES" />
          <div className="flex gap-4">
            <div className="flex-1 rounded-xl border border-[#fdd835]/30 overflow-hidden">
              <div className="bg-gradient-to-b from-[#e53935] to-[#b71c1c] py-4 text-center">
                <div className="text-white font-bold text-sm uppercase tracking-widest">FOURS</div>
              </div>
              <div className="bg-gradient-to-b from-[#e91e63] to-[#880e4f] py-6 text-center">
                <div className="text-white font-black text-5xl">{totalFours}</div>
              </div>
            </div>
            <div className="flex-1 rounded-xl border border-[#fdd835]/30 overflow-hidden">
              <div className="bg-gradient-to-b from-[#1565c0] to-[#0d47a1] py-4 text-center">
                <div className="text-white font-bold text-sm uppercase tracking-widest">SIXES</div>
              </div>
              <div className="bg-gradient-to-b from-[#0288d1] to-[#01579b] py-6 text-center">
                <div className="text-white font-black text-5xl">{totalSixes}</div>
              </div>
            </div>
          </div>
        </section>

        {/* MOM */}
        {momList.length > 0 && (
          <section>
            <SectionTitle icon={<Star className="w-5 h-5" />} title="MAN OF THE MATCH" />
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {momList.map((m, i) => (
                <div key={i} className="flex items-center gap-3 bg-[#0a2a1a] border border-[#fdd835]/20 rounded-lg px-4 py-2.5 hover:border-[#fdd835]/50 transition-colors">
                  <Star className="w-4 h-4 text-[#fdd835] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate">{m.player}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.match}</div>
                  </div>
                  <span className="text-xs text-[#fdd835] shrink-0">Match #{m.matchNo}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

    </div>
  );
};

export default TournamentStats;
