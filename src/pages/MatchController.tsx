import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Undo2, Plus, Trophy } from 'lucide-react';
import { Match, Player, Innings, BallEvent, createPlayer, createInnings, getOversString, getRunRate } from '@/types/cricket';
import { getMatch, updateMatch } from '@/lib/store';

const MatchController = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [addingTo, setAddingTo] = useState<0 | 1>(0);
  const [animClass, setAnimClass] = useState('');

  useEffect(() => {
    if (id) setMatch(getMatch(id) || null);
  }, [id]);

  const save = useCallback((m: Match) => {
    setMatch({ ...m });
    updateMatch(m);
  }, []);

  if (!match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Match not found</p>
      </div>
    );
  }

  const currentInnings: Innings | null = match.currentInningsIndex >= 0 ? match.innings[match.currentInningsIndex] : null;
  const battingTeam = currentInnings ? (currentInnings.battingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const bowlingTeam = currentInnings ? (currentInnings.bowlingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const striker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentStrikerId) : null;
  const nonStriker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentNonStrikerId) : null;
  const bowler = currentInnings && bowlingTeam ? bowlingTeam.players.find(p => p.id === currentInnings.currentBowlerId) : null;
  const target = match.currentInningsIndex === 1 && match.innings[0] ? match.innings[0].runs + 1 : null;

  const triggerAnim = (cls: string) => {
    setAnimClass(cls);
    setTimeout(() => setAnimClass(''), 1500);
  };

  const startInnings = (inningsIndex: number) => {
    const battingIdx = inningsIndex === 0
      ? (match.tossWonBy === 0 ? (match.optedTo === 'bat' ? 0 : 1) : (match.optedTo === 'bat' ? 1 : 0))
      : (match.innings[0].battingTeamIndex === 0 ? 1 : 0);
    
    const innings = createInnings(battingIdx);
    const updated = { ...match };
    if (inningsIndex === 0) {
      updated.innings = [innings];
    } else {
      updated.innings[0].isComplete = true;
      updated.innings.push(innings);
    }
    updated.currentInningsIndex = inningsIndex;
    updated.status = 'live';
    save(updated);
  };

  const addPlayer = (teamIdx: 0 | 1) => {
    if (!newPlayerName.trim()) return;
    const names = newPlayerName.split(',').map(n => n.trim()).filter(Boolean);
    const updated = { ...match };
    const team = teamIdx === 0 ? updated.team1 : updated.team2;
    names.forEach(n => team.players.push(createPlayer(n)));
    save(updated);
    setNewPlayerName('');
  };

  const selectBatsman = (playerId: string, role: 'striker' | 'nonStriker') => {
    if (!currentInnings) return;
    const updated = { ...match };
    const inn = updated.innings[updated.currentInningsIndex];
    if (role === 'striker') inn.currentStrikerId = playerId;
    else inn.currentNonStrikerId = playerId;
    save(updated);
  };

  const selectBowler = (playerId: string) => {
    if (!currentInnings) return;
    const updated = { ...match };
    updated.innings[updated.currentInningsIndex].currentBowlerId = playerId;
    save(updated);
  };

  const addRuns = (runs: number) => {
    if (!currentInnings || !striker || !bowler) return;
    const updated = { ...match };
    const inn = updated.innings[updated.currentInningsIndex];
    const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
    const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
    
    const event: BallEvent = {
      id: crypto.randomUUID(),
      type: 'run',
      runs,
      batsmanId: striker.id,
      bowlerId: bowler.id,
      isWicket: false,
      isLegal: true,
      timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.runs += runs;
    inn.balls += 1;

    // Update batsman
    const batsmanRef = bt.players.find(p => p.id === striker.id)!;
    batsmanRef.runs += runs;
    batsmanRef.ballsFaced += 1;
    if (runs === 4) { batsmanRef.fours += 1; triggerAnim('animate-four'); }
    if (runs === 6) { batsmanRef.sixes += 1; triggerAnim('animate-six'); }

    // Update bowler
    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;
    bowlerRef.bowlingRuns += runs;
    bowlerRef.bowlingBalls += 1;

    // Swap strike on odd runs
    if (runs % 2 === 1) {
      const temp = inn.currentStrikerId;
      inn.currentStrikerId = inn.currentNonStrikerId;
      inn.currentNonStrikerId = temp;
    }

    // End of over - swap strike
    if (inn.balls % match.ballsPerOver === 0) {
      const temp = inn.currentStrikerId;
      inn.currentStrikerId = inn.currentNonStrikerId;
      inn.currentNonStrikerId = temp;
      inn.currentBowlerId = undefined;
    }

    // Check innings complete
    if (inn.balls >= match.overs * match.ballsPerOver || inn.wickets >= bt.players.length - 1) {
      inn.isComplete = true;
    }

    // Check 2nd innings target
    if (updated.currentInningsIndex === 1 && target && inn.runs >= target) {
      inn.isComplete = true;
      updated.status = 'finished';
      const winTeam = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
      updated.winner = winTeam.name;
      updated.winMargin = `${bt.players.length - 1 - inn.wickets} wickets`;
    }

    save(updated);
  };

  const addExtra = (type: 'wide' | 'noBall' | 'bye' | 'legBye') => {
    if (!currentInnings || !bowler) return;
    const updated = { ...match };
    const inn = updated.innings[updated.currentInningsIndex];
    const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;

    const event: BallEvent = {
      id: crypto.randomUUID(),
      type,
      runs: 1,
      batsmanId: striker?.id || '',
      bowlerId: bowler.id,
      isWicket: false,
      isLegal: type === 'bye' || type === 'legBye',
      timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.runs += 1;
    inn.extras[type === 'wide' ? 'wides' : type === 'noBall' ? 'noBalls' : type === 'bye' ? 'byes' : 'legByes'] += 1;

    if (type === 'bye' || type === 'legBye') {
      inn.balls += 1;
      if (inn.balls % match.ballsPerOver === 0) {
        const temp = inn.currentStrikerId;
        inn.currentStrikerId = inn.currentNonStrikerId;
        inn.currentNonStrikerId = temp;
        inn.currentBowlerId = undefined;
      }
    }

    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;
    if (type === 'wide' || type === 'noBall') {
      bowlerRef.bowlingRuns += 1;
    }

    save(updated);
  };

  const addWicket = (dismissalType: string = 'bowled') => {
    if (!currentInnings || !striker || !bowler) return;
    triggerAnim('animate-wicket');
    const updated = { ...match };
    const inn = updated.innings[updated.currentInningsIndex];
    const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
    const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;

    const event: BallEvent = {
      id: crypto.randomUUID(),
      type: 'wicket',
      runs: 0,
      batsmanId: striker.id,
      bowlerId: bowler.id,
      isWicket: true,
      wicketType: dismissalType,
      isLegal: true,
      timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.wickets += 1;
    inn.balls += 1;

    const batsmanRef = bt.players.find(p => p.id === striker.id)!;
    batsmanRef.isOut = true;
    batsmanRef.dismissalType = dismissalType;
    batsmanRef.dismissedBy = bowler.name;
    batsmanRef.ballsFaced += 1;

    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;
    bowlerRef.bowlingWickets += 1;
    bowlerRef.bowlingBalls += 1;

    inn.currentStrikerId = undefined;

    if (inn.wickets >= bt.players.length - 1 || inn.balls >= match.overs * match.ballsPerOver) {
      inn.isComplete = true;
      if (updated.currentInningsIndex === 1) {
        updated.status = 'finished';
        const winTeam = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
        updated.winner = winTeam.name;
        updated.winMargin = `${(target || 0) - 1 - inn.runs} runs`;
      }
    }

    if (inn.balls % match.ballsPerOver === 0) {
      const temp = inn.currentStrikerId;
      inn.currentStrikerId = inn.currentNonStrikerId;
      inn.currentNonStrikerId = temp;
      inn.currentBowlerId = undefined;
    }

    save(updated);
  };

  const undo = () => {
    if (!currentInnings || currentInnings.events.length === 0) return;
    // Simple undo - reload from store without last event
    // For a proper undo we'd need event sourcing. For now, just remove last event and recalc.
    // This is a simplified version.
    const updated = { ...match };
    const inn = updated.innings[updated.currentInningsIndex];
    const lastEvent = inn.events.pop();
    if (!lastEvent) return;

    // Reverse the effect
    if (lastEvent.isLegal) inn.balls -= 1;
    inn.runs -= lastEvent.runs;
    if (lastEvent.isWicket) {
      inn.wickets -= 1;
      inn.isComplete = false;
      const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
      const batsmanRef = bt.players.find(p => p.id === lastEvent.batsmanId);
      if (batsmanRef) {
        batsmanRef.isOut = false;
        batsmanRef.dismissalType = undefined;
        batsmanRef.dismissedBy = undefined;
        batsmanRef.ballsFaced -= 1;
        inn.currentStrikerId = batsmanRef.id;
      }
      const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
      const bowlerRef = blt.players.find(p => p.id === lastEvent.bowlerId);
      if (bowlerRef) { bowlerRef.bowlingWickets -= 1; bowlerRef.bowlingBalls -= 1; }
    } else if (lastEvent.type === 'run') {
      const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
      const batsmanRef = bt.players.find(p => p.id === lastEvent.batsmanId);
      if (batsmanRef) { batsmanRef.runs -= lastEvent.runs; batsmanRef.ballsFaced -= 1; if (lastEvent.runs === 4) batsmanRef.fours -= 1; if (lastEvent.runs === 6) batsmanRef.sixes -= 1; }
      const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
      const bowlerRef = blt.players.find(p => p.id === lastEvent.bowlerId);
      if (bowlerRef) { bowlerRef.bowlingRuns -= lastEvent.runs; bowlerRef.bowlingBalls -= 1; }
      // Reverse strike swap
      if (lastEvent.runs % 2 === 1) {
        const temp = inn.currentStrikerId;
        inn.currentStrikerId = inn.currentNonStrikerId;
        inn.currentNonStrikerId = temp;
      }
    } else {
      // Extra undo
      const key = lastEvent.type === 'wide' ? 'wides' : lastEvent.type === 'noBall' ? 'noBalls' : lastEvent.type === 'bye' ? 'byes' : 'legByes';
      inn.extras[key] -= 1;
    }

    if (updated.status === 'finished') {
      updated.status = 'live';
      updated.winner = undefined;
      updated.winMargin = undefined;
    }

    save(updated);
  };

  const endInnings = () => {
    if (!currentInnings) return;
    const updated = { ...match };
    updated.innings[updated.currentInningsIndex].isComplete = true;
    save(updated);
  };

  const availableBatsmen = battingTeam?.players.filter(p => !p.isOut && p.id !== currentInnings?.currentStrikerId && p.id !== currentInnings?.currentNonStrikerId) || [];
  const availableBowlers = bowlingTeam?.players || [];

  return (
    <div className={`min-h-screen bg-background ${animClass}`}>
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Link to={`/tournament/${match.tournamentId}`}>
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <span className="font-display text-lg font-bold">
              {match.team1.name} <span className="text-muted-foreground">vs</span> {match.team2.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/scoreboard/${match.id}`}>
              <Button size="sm" variant="secondary">Scoreboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Score Display */}
        {currentInnings && battingTeam && (
          <div className="gradient-card rounded-xl border border-border p-6 mb-6 shadow-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground uppercase tracking-wide">
                {match.currentInningsIndex === 0 ? '1st' : '2nd'} Innings
              </span>
              {match.status === 'finished' && (
                <span className="text-sm font-semibold text-primary">{match.winner} won by {match.winMargin}</span>
              )}
            </div>
            <div className="flex items-end gap-4">
              <h2 className="font-display text-4xl font-bold">{battingTeam.name}</h2>
              <span className="font-display text-5xl font-bold text-primary">
                {currentInnings.runs}/{currentInnings.wickets}
              </span>
              <span className="text-xl text-muted-foreground mb-1">
                ({getOversString(currentInnings.balls, match.ballsPerOver)}/{match.overs})
              </span>
            </div>
            <div className="flex gap-6 mt-3 text-sm text-muted-foreground">
              <span>CRR: {getRunRate(currentInnings.runs, currentInnings.balls, match.ballsPerOver)}</span>
              {target && (
                <>
                  <span className="text-accent font-semibold">Target: {target}</span>
                  <span>Need: {Math.max(0, target - currentInnings.runs)} off {Math.max(0, match.overs * match.ballsPerOver - currentInnings.balls)} balls</span>
                </>
              )}
              <span>Extras: {currentInnings.extras.wides}w {currentInnings.extras.noBalls}nb {currentInnings.extras.byes}b {currentInnings.extras.legByes}lb</span>
            </div>

            {/* Current Batsmen & Bowler */}
            {(striker || nonStriker || bowler) && (
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Striker</span>
                  {striker ? (
                    <p className="font-semibold">{striker.name}* {striker.runs}({striker.ballsFaced}) {striker.fours}×4 {striker.sixes}×6</p>
                  ) : <p className="text-muted-foreground">Select batsman</p>}
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Non-Striker</span>
                  {nonStriker ? (
                    <p className="font-semibold">{nonStriker.name} {nonStriker.runs}({nonStriker.ballsFaced})</p>
                  ) : <p className="text-muted-foreground">Select batsman</p>}
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Bowler</span>
                  {bowler ? (
                    <p className="font-semibold">{bowler.name} {getOversString(bowler.bowlingBalls, match.ballsPerOver)}-{bowler.bowlingRuns}-{bowler.bowlingWickets}</p>
                  ) : <p className="text-muted-foreground">Select bowler</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Innings Controls */}
        {match.status === 'upcoming' && (
          <div className="text-center py-8">
            <h2 className="font-display text-2xl mb-4">Ready to Start?</h2>
            <p className="text-muted-foreground mb-6">Add players to both teams first, then start the 1st innings.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Add Players */}
          <div className="gradient-card rounded-xl border border-border p-5 shadow-card">
            <h3 className="font-display text-lg font-semibold mb-3">Add Players</h3>
            <div className="flex gap-2 mb-3">
              <Select value={String(addingTo)} onValueChange={(v) => setAddingTo(Number(v) as 0 | 1)}>
                <SelectTrigger className="bg-secondary w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{match.team1.name}</SelectItem>
                  <SelectItem value="1">{match.team2.name}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Name (comma for bulk)"
                className="bg-secondary flex-1"
                onKeyDown={(e) => e.key === 'Enter' && addPlayer(addingTo)}
              />
              <Button onClick={() => addPlayer(addingTo)} size="icon"><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">{match.team1.name} ({match.team1.players.length})</p>
                {match.team1.players.map(p => <p key={p.id} className="py-0.5">{p.name}</p>)}
              </div>
              <div>
                <p className="text-muted-foreground mb-1">{match.team2.name} ({match.team2.players.length})</p>
                {match.team2.players.map(p => <p key={p.id} className="py-0.5">{p.name}</p>)}
              </div>
            </div>
          </div>

          {/* Select Batsmen / Bowler */}
          {currentInnings && (
            <div className="gradient-card rounded-xl border border-border p-5 shadow-card">
              <h3 className="font-display text-lg font-semibold mb-3">Select Players</h3>
              <div className="space-y-3">
                {!striker && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Select Striker</p>
                    <div className="flex flex-wrap gap-2">
                      {availableBatsmen.map(p => (
                        <Button key={p.id} size="sm" variant="outline" onClick={() => selectBatsman(p.id, 'striker')}>{p.name}</Button>
                      ))}
                    </div>
                  </div>
                )}
                {!nonStriker && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Select Non-Striker</p>
                    <div className="flex flex-wrap gap-2">
                      {availableBatsmen.map(p => (
                        <Button key={p.id} size="sm" variant="outline" onClick={() => selectBatsman(p.id, 'nonStriker')}>{p.name}</Button>
                      ))}
                    </div>
                  </div>
                )}
                {!bowler && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Select Bowler</p>
                    <div className="flex flex-wrap gap-2">
                      {availableBowlers.map(p => (
                        <Button key={p.id} size="sm" variant="outline" onClick={() => selectBowler(p.id)}>{p.name}</Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Innings Start/End Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          {match.currentInningsIndex < 0 && match.team1.players.length > 0 && match.team2.players.length > 0 && (
            <Button onClick={() => startInnings(0)} className="font-display">Start 1st Innings</Button>
          )}
          {match.currentInningsIndex === 0 && currentInnings?.isComplete && (
            <Button onClick={() => startInnings(1)} className="font-display">Start 2nd Innings</Button>
          )}
          {currentInnings && !currentInnings.isComplete && (
            <Button variant="destructive" onClick={endInnings} className="font-display">End Innings</Button>
          )}
        </div>

        {/* Scoring Buttons */}
        {currentInnings && !currentInnings.isComplete && striker && bowler && (
          <div className="space-y-4">
            {/* Run Buttons */}
            <div className="gradient-card rounded-xl border border-border p-5 shadow-card">
              <h3 className="font-display text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Runs</h3>
              <div className="flex flex-wrap gap-3">
                {[0, 1, 2, 3, 4, 6].map(r => (
                  <Button
                    key={r}
                    onClick={() => addRuns(r)}
                    variant={r === 4 ? 'secondary' : r === 6 ? 'default' : 'outline'}
                    className={`w-14 h-14 text-xl font-display font-bold ${r === 4 ? 'text-cricket-blue border-cricket-blue' : ''} ${r === 6 ? 'bg-accent text-accent-foreground' : ''}`}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>

            {/* Extras */}
            <div className="gradient-card rounded-xl border border-border p-5 shadow-card">
              <h3 className="font-display text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Extras</h3>
              <div className="flex flex-wrap gap-3">
                {(['wide', 'noBall', 'bye', 'legBye'] as const).map(type => (
                  <Button key={type} variant="outline" onClick={() => addExtra(type)} className="font-display">
                    {type === 'noBall' ? 'No Ball' : type === 'legBye' ? 'Leg Bye' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Wicket */}
            <div className="gradient-card rounded-xl border border-border p-5 shadow-card">
              <h3 className="font-display text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Wicket</h3>
              <div className="flex flex-wrap gap-3">
                {['Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Hit Wicket'].map(type => (
                  <Button key={type} variant="destructive" onClick={() => addWicket(type.toLowerCase())} className="font-display">
                    {type}
                  </Button>
                ))}
              </div>
            </div>

            {/* Undo */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={undo} disabled={!currentInnings.events.length}>
                <Undo2 className="mr-2 h-4 w-4" />
                Undo
              </Button>
            </div>
          </div>
        )}

        {/* Match Result */}
        {match.status === 'finished' && (
          <div className="gradient-card rounded-xl border border-primary/30 p-8 shadow-glow text-center mt-6">
            <Trophy className="h-12 w-12 text-accent mx-auto mb-3" />
            <h2 className="font-display text-3xl font-bold mb-2">{match.winner} Won!</h2>
            <p className="text-muted-foreground text-lg">by {match.winMargin}</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default MatchController;
