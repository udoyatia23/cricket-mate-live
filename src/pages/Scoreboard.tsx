import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy } from 'lucide-react';
import { Match, getOversString, getRunRate } from '@/types/cricket';
import { getMatch } from '@/lib/store';

const Scoreboard = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [view, setView] = useState<'default' | 'batting' | 'bowling' | 'summary'>('default');

  useEffect(() => {
    if (id) {
      const loadMatch = () => setMatch(getMatch(id) || null);
      loadMatch();
      const interval = setInterval(loadMatch, 2000); // Poll for live updates
      return () => clearInterval(interval);
    }
  }, [id]);

  if (!match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Match not found</p>
      </div>
    );
  }

  const currentInnings = match.currentInningsIndex >= 0 ? match.innings[match.currentInningsIndex] : null;
  const battingTeam = currentInnings ? (currentInnings.battingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const bowlingTeam = currentInnings ? (currentInnings.bowlingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const target = match.currentInningsIndex === 1 && match.innings[0] ? match.innings[0].runs + 1 : null;

  const views = ['default', 'batting', 'bowling', 'summary'] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Link to={`/tournament/${match.tournamentId}`}>
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <span className="font-display text-lg font-bold">Scoreboard</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Match Title */}
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl md:text-4xl font-bold">
            {match.team1.name} <span className="text-muted-foreground">vs</span> {match.team2.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Match #{match.matchNo} · {match.overs} overs · {match.matchType}
          </p>
        </div>

        {/* Target Banner */}
        {target && currentInnings && !currentInnings.isComplete && (
          <div className="gradient-gold rounded-lg p-3 text-center mb-6">
            <p className="font-display text-lg font-bold text-accent-foreground">
              {battingTeam?.name} need {Math.max(0, target - currentInnings.runs)} runs from {Math.max(0, match.overs * match.ballsPerOver - currentInnings.balls)} balls
            </p>
          </div>
        )}

        {/* Main Score Card */}
        {match.innings.map((inn, idx) => {
          const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
          return (
            <div key={idx} className="gradient-card rounded-xl border border-border p-6 mb-4 shadow-card">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">{idx === 0 ? '1st' : '2nd'} Innings</span>
                {inn.isComplete && <span className="text-xs text-primary">Complete</span>}
              </div>
              <div className="flex items-end gap-3">
                <h2 className="font-display text-2xl font-bold">{bt.name}</h2>
                <span className="font-display text-3xl font-bold text-primary">{inn.runs}/{inn.wickets}</span>
                <span className="text-muted-foreground">({getOversString(inn.balls, match.ballsPerOver)})</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                RR: {getRunRate(inn.runs, inn.balls, match.ballsPerOver)} · Extras: {inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes}
              </p>
            </div>
          );
        })}

        {/* Result */}
        {match.status === 'finished' && (
          <div className="text-center my-6 p-4 border border-primary/30 rounded-xl shadow-glow">
            <Trophy className="h-8 w-8 text-accent mx-auto mb-2" />
            <h2 className="font-display text-2xl font-bold">{match.winner} Won!</h2>
            <p className="text-muted-foreground">by {match.winMargin}</p>
          </div>
        )}

        {/* View Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {views.map(v => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView(v)}
              className="font-display capitalize"
            >
              {v}
            </Button>
          ))}
        </div>

        {/* Batting Card */}
        {(view === 'default' || view === 'batting') && currentInnings && battingTeam && (
          <div className="gradient-card rounded-xl border border-border p-5 shadow-card mb-4">
            <h3 className="font-display text-lg font-semibold mb-3">{battingTeam.name} - Batting</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Batter</th>
                    <th className="text-right px-2">R</th>
                    <th className="text-right px-2">B</th>
                    <th className="text-right px-2">4s</th>
                    <th className="text-right px-2">6s</th>
                    <th className="text-right pl-2">SR</th>
                  </tr>
                </thead>
                <tbody>
                  {battingTeam.players.filter(p => p.ballsFaced > 0 || p.id === currentInnings.currentStrikerId || p.id === currentInnings.currentNonStrikerId).map(p => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2 pr-4">
                        <span className={p.id === currentInnings.currentStrikerId ? 'font-semibold text-primary' : ''}>
                          {p.name}
                          {p.id === currentInnings.currentStrikerId && '*'}
                        </span>
                        {p.isOut && <span className="text-xs text-muted-foreground ml-1">({p.dismissalType})</span>}
                      </td>
                      <td className="text-right px-2 font-semibold">{p.runs}</td>
                      <td className="text-right px-2 text-muted-foreground">{p.ballsFaced}</td>
                      <td className="text-right px-2">{p.fours}</td>
                      <td className="text-right px-2">{p.sixes}</td>
                      <td className="text-right pl-2 text-muted-foreground">{p.ballsFaced > 0 ? ((p.runs / p.ballsFaced) * 100).toFixed(1) : '0.0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bowling Card */}
        {(view === 'default' || view === 'bowling') && currentInnings && bowlingTeam && (
          <div className="gradient-card rounded-xl border border-border p-5 shadow-card mb-4">
            <h3 className="font-display text-lg font-semibold mb-3">{bowlingTeam.name} - Bowling</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Bowler</th>
                    <th className="text-right px-2">O</th>
                    <th className="text-right px-2">R</th>
                    <th className="text-right px-2">W</th>
                    <th className="text-right pl-2">Econ</th>
                  </tr>
                </thead>
                <tbody>
                  {bowlingTeam.players.filter(p => p.bowlingBalls > 0).map(p => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2 pr-4">
                        <span className={p.id === currentInnings.currentBowlerId ? 'font-semibold text-primary' : ''}>
                          {p.name}
                          {p.id === currentInnings.currentBowlerId && '*'}
                        </span>
                      </td>
                      <td className="text-right px-2">{getOversString(p.bowlingBalls, match.ballsPerOver)}</td>
                      <td className="text-right px-2">{p.bowlingRuns}</td>
                      <td className="text-right px-2 font-semibold">{p.bowlingWickets}</td>
                      <td className="text-right pl-2 text-muted-foreground">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary */}
        {view === 'summary' && (
          <div className="gradient-card rounded-xl border border-border p-5 shadow-card">
            <h3 className="font-display text-lg font-semibold mb-3">Match Summary</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Toss:</span> {match.tossWonBy === 0 ? match.team1.name : match.team2.name} won, opted to {match.optedTo}</p>
              {match.innings.map((inn, idx) => {
                const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
                return (
                  <p key={idx}>
                    <span className="text-muted-foreground">{bt.name}:</span> {inn.runs}/{inn.wickets} ({getOversString(inn.balls, match.ballsPerOver)} ov)
                  </p>
                );
              })}
              {match.winner && <p className="text-primary font-semibold mt-2">{match.winner} won by {match.winMargin}</p>}
            </div>
          </div>
        )}

        {match.status === 'upcoming' && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg font-display">Match hasn't started yet</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Scoreboard;
