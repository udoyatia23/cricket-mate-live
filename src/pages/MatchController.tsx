import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Undo2, Plus, Trophy, Users } from 'lucide-react';
import { Match, Player, Innings, BallEvent, createPlayer, createInnings, getOversString, getRunRate } from '@/types/cricket';
import { getMatch, updateMatch, getTournament } from '@/lib/store';
import { setDisplayState, DisplayMode, AnimationOverlay } from '@/lib/displaySync';

const MatchController = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [newPlayerName1, setNewPlayerName1] = useState('');
  const [newPlayerName2, setNewPlayerName2] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [activeDisplay, setActiveDisplay] = useState<DisplayMode>('default');
  const [team1Color, setTeam1Color] = useState('#ff0000');
  const [team2Color, setTeam2Color] = useState('#0000ff');
  const [inningsDialogOpen, setInningsDialogOpen] = useState(false);
  const [inningsDialogType, setInningsDialogType] = useState<0 | 1>(0);
  const [strikerName, setStrikerName] = useState('');
  const [nonStrikerName, setNonStrikerName] = useState('');
  const [bowlerName, setBowlerName] = useState('');

  useEffect(() => {
    if (id) setMatch(getMatch(id) || null);
  }, [id]);

  useEffect(() => {
    if (match) {
      setTeam1Color(match.team1.color || '#ff0000');
      setTeam2Color(match.team2.color || '#0000ff');
    }
  }, [match?.id]);

  const save = useCallback((m: Match) => {
    setMatch({ ...m });
    updateMatch(m);
  }, []);

  const sendDisplay = (mode: DisplayMode) => {
    if (!id) return;
    setActiveDisplay(mode);
    setDisplayState(id, { mode });
  };

  const sendOverlay = (overlay: AnimationOverlay) => {
    if (!id) return;
    setDisplayState(id, { overlay });
    if (overlay !== 'none') {
      setTimeout(() => setDisplayState(id, { overlay: 'none' }), 3000);
    }
  };

  const sendCustomText = () => {
    if (!id || !customInput.trim()) return;
    setDisplayState(id, { customText: customInput });
  };

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
  const tournamentName = getTournament(match.tournamentId)?.name || 'Tournament';

  const openInningsDialog = (inningsIndex: 0 | 1) => {
    setInningsDialogType(inningsIndex);
    setStrikerName('');
    setNonStrikerName('');
    setBowlerName('');
    setInningsDialogOpen(true);
  };

  const startInningsWithPlayers = () => {
    if (!strikerName.trim() || !nonStrikerName.trim() || !bowlerName.trim()) return;
    const inningsIndex = inningsDialogType;
    const battingIdx = inningsIndex === 0
      ? (match.tossWonBy === 0 ? (match.optedTo === 'bat' ? 0 : 1) : (match.optedTo === 'bat' ? 1 : 0))
      : (match.innings[0].battingTeamIndex === 0 ? 1 : 0);
    const bowlingIdx = battingIdx === 0 ? 1 : 0;
    const innings = createInnings(battingIdx);
    const updated = { ...match };

    // Find or create striker in batting team
    const battingTeam = battingIdx === 0 ? updated.team1 : updated.team2;
    let strikerPlayer = battingTeam.players.find(p => p.name.toLowerCase() === strikerName.trim().toLowerCase());
    if (!strikerPlayer) { strikerPlayer = createPlayer(strikerName.trim()); battingTeam.players.push(strikerPlayer); }
    let nonStrikerPlayer = battingTeam.players.find(p => p.name.toLowerCase() === nonStrikerName.trim().toLowerCase());
    if (!nonStrikerPlayer) { nonStrikerPlayer = createPlayer(nonStrikerName.trim()); battingTeam.players.push(nonStrikerPlayer); }

    // Find or create bowler in bowling team
    const bowlingTeamRef = bowlingIdx === 0 ? updated.team1 : updated.team2;
    let bowlerPlayer = bowlingTeamRef.players.find(p => p.name.toLowerCase() === bowlerName.trim().toLowerCase());
    if (!bowlerPlayer) { bowlerPlayer = createPlayer(bowlerName.trim()); bowlingTeamRef.players.push(bowlerPlayer); }

    innings.currentStrikerId = strikerPlayer.id;
    innings.currentNonStrikerId = nonStrikerPlayer.id;
    innings.currentBowlerId = bowlerPlayer.id;

    if (inningsIndex === 0) {
      updated.innings = [innings];
    } else {
      updated.innings[0].isComplete = true;
      updated.innings.push(innings);
    }
    updated.currentInningsIndex = inningsIndex;
    updated.status = 'live';
    save(updated);
    setInningsDialogOpen(false);
  };

  const addPlayer = (teamIdx: 0 | 1, name: string, setName: (v: string) => void) => {
    if (!name.trim()) return;
    const names = name.split(',').map(n => n.trim()).filter(Boolean);
    const updated = { ...match };
    const team = teamIdx === 0 ? updated.team1 : updated.team2;
    names.forEach(n => team.players.push(createPlayer(n)));
    save(updated);
    setName('');
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
      id: crypto.randomUUID(), type: 'run', runs, batsmanId: striker.id, bowlerId: bowler.id, isWicket: false, isLegal: true, timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.runs += runs;
    inn.balls += 1;
    const batsmanRef = bt.players.find(p => p.id === striker.id)!;
    batsmanRef.runs += runs;
    batsmanRef.ballsFaced += 1;
    if (runs === 4) { batsmanRef.fours += 1; sendOverlay('four'); }
    if (runs === 6) { batsmanRef.sixes += 1; sendOverlay('six'); }
    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;
    bowlerRef.bowlingRuns += runs;
    bowlerRef.bowlingBalls += 1;
    if (runs % 2 === 1) { const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; }
    if (inn.balls % match.ballsPerOver === 0) { const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; inn.currentBowlerId = undefined; }
    if (inn.balls >= match.overs * match.ballsPerOver || inn.wickets >= bt.players.length - 1) inn.isComplete = true;
    if (updated.currentInningsIndex === 1 && target && inn.runs >= target) {
      inn.isComplete = true; updated.status = 'finished';
      updated.winner = (inn.battingTeamIndex === 0 ? updated.team1 : updated.team2).name;
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
      id: crypto.randomUUID(), type, runs: 1, batsmanId: striker?.id || '', bowlerId: bowler.id, isWicket: false, isLegal: type === 'bye' || type === 'legBye', timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.runs += 1;
    inn.extras[type === 'wide' ? 'wides' : type === 'noBall' ? 'noBalls' : type === 'bye' ? 'byes' : 'legByes'] += 1;
    if (type === 'bye' || type === 'legBye') {
      inn.balls += 1;
      if (inn.balls % match.ballsPerOver === 0) { const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; inn.currentBowlerId = undefined; }
    }
    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;
    if (type === 'wide' || type === 'noBall') bowlerRef.bowlingRuns += 1;
    save(updated);
  };

  const addWicket = (dismissalType: string = 'bowled') => {
    if (!currentInnings || !striker || !bowler) return;
    sendOverlay('wicket');
    const updated = { ...match };
    const inn = updated.innings[updated.currentInningsIndex];
    const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
    const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
    const event: BallEvent = {
      id: crypto.randomUUID(), type: 'wicket', runs: 0, batsmanId: striker.id, bowlerId: bowler.id, isWicket: true, wicketType: dismissalType, isLegal: true, timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.wickets += 1;
    inn.balls += 1;
    const batsmanRef = bt.players.find(p => p.id === striker.id)!;
    batsmanRef.isOut = true; batsmanRef.dismissalType = dismissalType; batsmanRef.dismissedBy = bowler.name; batsmanRef.ballsFaced += 1;
    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;
    bowlerRef.bowlingWickets += 1; bowlerRef.bowlingBalls += 1;
    inn.currentStrikerId = undefined;
    if (inn.wickets >= bt.players.length - 1 || inn.balls >= match.overs * match.ballsPerOver) {
      inn.isComplete = true;
      if (updated.currentInningsIndex === 1) {
        updated.status = 'finished';
        updated.winner = (inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2).name;
        updated.winMargin = `${(target || 0) - 1 - inn.runs} runs`;
      }
    }
    if (inn.balls % match.ballsPerOver === 0) { const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; inn.currentBowlerId = undefined; }
    save(updated);
  };

  const undo = () => {
    if (!currentInnings || currentInnings.events.length === 0) return;
    const updated = { ...match };
    const inn = updated.innings[updated.currentInningsIndex];
    const lastEvent = inn.events.pop();
    if (!lastEvent) return;
    if (lastEvent.isLegal) inn.balls -= 1;
    inn.runs -= lastEvent.runs;
    if (lastEvent.isWicket) {
      inn.wickets -= 1; inn.isComplete = false;
      const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
      const batsmanRef = bt.players.find(p => p.id === lastEvent.batsmanId);
      if (batsmanRef) { batsmanRef.isOut = false; batsmanRef.dismissalType = undefined; batsmanRef.dismissedBy = undefined; batsmanRef.ballsFaced -= 1; inn.currentStrikerId = batsmanRef.id; }
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
      if (lastEvent.runs % 2 === 1) { const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; }
    } else {
      const key = lastEvent.type === 'wide' ? 'wides' : lastEvent.type === 'noBall' ? 'noBalls' : lastEvent.type === 'bye' ? 'byes' : 'legByes';
      inn.extras[key] -= 1;
    }
    if (updated.status === 'finished') { updated.status = 'live'; updated.winner = undefined; updated.winMargin = undefined; }
    save(updated);
  };

  const endInnings = () => {
    if (!currentInnings) return;
    const updated = { ...match };
    updated.innings[updated.currentInningsIndex].isComplete = true;
    save(updated);
  };

  const saveTeamColors = () => {
    const updated = { ...match };
    updated.team1.color = team1Color;
    updated.team2.color = team2Color;
    save(updated);
  };

  const availableBatsmen = battingTeam?.players.filter(p => !p.isOut && p.id !== currentInnings?.currentStrikerId && p.id !== currentInnings?.currentNonStrikerId) || [];
  const availableBowlers = bowlingTeam?.players || [];
  const allPlayers = [...match.team1.players, ...match.team2.players];

  // Section wrapper component
  const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-xl border border-border bg-card p-4 mb-4 ${className}`}>{children}</div>
  );

  const ControlBtn = ({ label, color, onClick, active }: { label: string; color: string; onClick: () => void; active?: boolean }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${color} ${active ? 'ring-2 ring-white scale-105' : ''}`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-black text-foreground">
      {/* Nav Bar */}
      <header className="bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-400 h-12 flex items-center px-4">
        <Link to={`/tournament/${match.tournamentId}`} className="flex items-center gap-2">
          <ArrowLeft className="h-5 w-5 text-white" />
          <span className="font-display text-xl font-bold text-white italic">CricScorer</span>
        </Link>
        <div className="ml-auto flex items-center gap-4">
          <Link to={`/scoreboard/${match.id}`} target="_blank">
            <span className="text-white text-sm font-semibold underline">SCOREBOARD LINKS</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 py-4">
        {/* Team VS Banner */}
        <div className="bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 rounded-2xl p-4 mb-4 flex items-center justify-between">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white uppercase">{match.team1.name}</h2>
          <span className="font-display text-2xl text-white/80">VS</span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white uppercase">{match.team2.name}</h2>
        </div>

        {/* SEND Button */}
        <div className="text-center mb-3">
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => sendDisplay(activeDisplay)}>SEND</Button>
        </div>

        {/* Controller Section */}
        <div className="bg-gradient-to-br from-purple-700 via-purple-600 to-pink-600 rounded-xl p-5 mb-4">
          <h3 className="font-display text-2xl font-bold text-white text-center mb-4">Controller</h3>
          <div className="flex flex-wrap gap-2 justify-center">
            <ControlBtn label="Default" color="bg-green-600 text-white" onClick={() => sendDisplay('default')} active={activeDisplay === 'default'} />
            <ControlBtn label="Change Toss" color="bg-orange-500 text-white" onClick={() => {}} />
            {match.currentInningsIndex < 0 && (
              <ControlBtn label="Start 1st Inning" color="bg-blue-700 text-white ring-2 ring-red-500" onClick={() => openInningsDialog(0)} />
            )}
            {match.currentInningsIndex === 0 && currentInnings?.isComplete && (
              <ControlBtn label="Start 2nd Inning" color="bg-blue-700 text-white ring-2 ring-red-500" onClick={() => openInningsDialog(1)} />
            )}
            <ControlBtn label="Tour Name" color="bg-blue-600 text-white" onClick={() => sendDisplay('vs')} />
            <ControlBtn label="UNDO" color="bg-red-600 text-white" onClick={undo} />
            {currentInnings && !currentInnings.isComplete && (
              <ControlBtn label="End Innings" color="bg-red-700 text-white" onClick={endInnings} />
            )}
          </div>
        </div>

        {/* Score Display (Live) */}
        {currentInnings && battingTeam && (
          <Section>
            <div className="flex items-end gap-3 mb-2">
              <h2 className="font-display text-2xl font-bold">{battingTeam.name}</h2>
              <span className="font-display text-3xl font-bold text-primary">{currentInnings.runs}/{currentInnings.wickets}</span>
              <span className="text-muted-foreground">({getOversString(currentInnings.balls, match.ballsPerOver)}/{match.overs})</span>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
              <span>CRR: {getRunRate(currentInnings.runs, currentInnings.balls, match.ballsPerOver)}</span>
              {target && <span className="text-accent font-bold">Target: {target} | Need: {Math.max(0, target - currentInnings.runs)} off {Math.max(0, match.overs * match.ballsPerOver - currentInnings.balls)} balls</span>}
            </div>
            {/* Current players */}
            {(striker || nonStriker || bowler) && (
              <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-muted-foreground text-xs">Striker</span>{striker ? <p className="font-semibold">{striker.name}* {striker.runs}({striker.ballsFaced})</p> : <p className="text-muted-foreground">-</p>}</div>
                <div><span className="text-muted-foreground text-xs">Non-Striker</span>{nonStriker ? <p className="font-semibold">{nonStriker.name} {nonStriker.runs}({nonStriker.ballsFaced})</p> : <p className="text-muted-foreground">-</p>}</div>
                <div><span className="text-muted-foreground text-xs">Bowler</span>{bowler ? <p className="font-semibold">{bowler.name} {getOversString(bowler.bowlingBalls, match.ballsPerOver)}-{bowler.bowlingRuns}-{bowler.bowlingWickets}</p> : <p className="text-muted-foreground">-</p>}</div>
              </div>
            )}
          </Section>
        )}

        {/* Select Players */}
        {currentInnings && (
          <Section>
            <h3 className="font-display font-semibold mb-2">Select Players</h3>
            <div className="space-y-2">
              {!striker && (
                <div><p className="text-xs text-muted-foreground mb-1">Select Striker</p><div className="flex flex-wrap gap-1">{availableBatsmen.map(p => <Button key={p.id} size="sm" variant="outline" onClick={() => selectBatsman(p.id, 'striker')}>{p.name}</Button>)}</div></div>
              )}
              {!nonStriker && (
                <div><p className="text-xs text-muted-foreground mb-1">Select Non-Striker</p><div className="flex flex-wrap gap-1">{availableBatsmen.map(p => <Button key={p.id} size="sm" variant="outline" onClick={() => selectBatsman(p.id, 'nonStriker')}>{p.name}</Button>)}</div></div>
              )}
              {!bowler && (
                <div><p className="text-xs text-muted-foreground mb-1">Select Bowler</p><div className="flex flex-wrap gap-1">{availableBowlers.map(p => <Button key={p.id} size="sm" variant="outline" onClick={() => selectBowler(p.id)}>{p.name}</Button>)}</div></div>
              )}
            </div>
          </Section>
        )}

        {/* Add Players */}
        <div className="bg-gradient-to-r from-green-900/60 to-green-800/40 rounded-xl p-4 mb-4 border border-border">
          <p className="text-center text-sm text-muted-foreground mb-2 font-semibold">For Bulk Upload Add, Between Player Name</p>
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <Input value={newPlayerName1} onChange={e => setNewPlayerName1(e.target.value)} placeholder={`ADD PLAYER TO ${match.team1.name}`} className="bg-secondary flex-1" onKeyDown={e => e.key === 'Enter' && addPlayer(0, newPlayerName1, setNewPlayerName1)} />
              <Button size="icon" onClick={() => addPlayer(0, newPlayerName1, setNewPlayerName1)}><Users className="h-4 w-4" /></Button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{match.team1.name.slice(0, 6)}... Players ({match.team1.players.length})</span>
            </div>
            <div className="flex gap-2 items-center">
              <Input value={newPlayerName2} onChange={e => setNewPlayerName2(e.target.value)} placeholder={`ADD PLAYER TO ${match.team2.name}`} className="bg-secondary flex-1" onKeyDown={e => e.key === 'Enter' && addPlayer(1, newPlayerName2, setNewPlayerName2)} />
              <Button size="icon" onClick={() => addPlayer(1, newPlayerName2, setNewPlayerName2)}><Users className="h-4 w-4" /></Button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{match.team2.name.slice(0, 6)}... Players ({match.team2.players.length})</span>
            </div>
          </div>
        </div>

        {/* Scoring Buttons */}
        {currentInnings && !currentInnings.isComplete && striker && bowler && (
          <Section>
            <h3 className="font-display text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Runs</h3>
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2, 3, 4, 6].map(r => (
                <Button key={r} onClick={() => addRuns(r)} variant={r === 4 ? 'secondary' : r === 6 ? 'default' : 'outline'}
                  className={`w-14 h-14 text-xl font-display font-bold ${r === 4 ? 'text-cricket-blue border-cricket-blue' : ''} ${r === 6 ? 'bg-accent text-accent-foreground' : ''}`}
                >{r}</Button>
              ))}
            </div>
            <h3 className="font-display text-sm font-semibold text-muted-foreground mt-4 mb-2 uppercase tracking-wide">Extras</h3>
            <div className="flex flex-wrap gap-2">
              {(['wide', 'noBall', 'bye', 'legBye'] as const).map(type => (
                <Button key={type} variant="outline" onClick={() => addExtra(type)} className="font-display">
                  {type === 'noBall' ? 'No Ball' : type === 'legBye' ? 'Leg Bye' : type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>
            <h3 className="font-display text-sm font-semibold text-muted-foreground mt-4 mb-2 uppercase tracking-wide">Wicket</h3>
            <div className="flex flex-wrap gap-2">
              {['Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Hit Wicket'].map(type => (
                <Button key={type} variant="destructive" onClick={() => addWicket(type.toLowerCase())} className="font-display">{type}</Button>
              ))}
            </div>
          </Section>
        )}

        {/* Animations */}
        <Section>
          <h3 className="font-display text-center font-bold mb-3">Animations</h3>
          <div className="flex flex-wrap gap-2 justify-center">
            <ControlBtn label="FREE HIT" color="bg-red-500 text-white" onClick={() => sendOverlay('free_hit')} />
            <ControlBtn label="HAT-TRICK BALL" color="bg-rose-600 text-white" onClick={() => sendOverlay('hat_trick')} />
            <ControlBtn label="FOUR" color="bg-blue-600 text-white" onClick={() => sendOverlay('four')} />
            <ControlBtn label="SIX" color="bg-blue-700 text-white" onClick={() => sendOverlay('six')} />
            <ControlBtn label="WICKET" color="bg-red-600 text-white" onClick={() => sendOverlay('wicket')} />
            <ControlBtn label="TOUR BOUNDARIES" color="bg-green-600 text-white" onClick={() => {}} />
            <button onClick={() => sendOverlay('none')} className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-800 text-white border-2 border-red-500">STOP</button>
          </div>
        </Section>

        {/* Display Controller */}
        <Section>
          <h3 className="font-display text-center font-bold mb-3">DISPLAY CONTROLLER</h3>
          <div className="flex flex-wrap gap-2 justify-center">
            {([
              { key: 'default', label: 'DEFAULT', color: 'bg-green-600 text-white' },
              { key: '1bat', label: 'I1BAT', color: 'bg-red-500 text-white' },
              { key: '1ball', label: 'I1BALL', color: 'bg-blue-600 text-white' },
              { key: '2bat', label: 'I2BAT', color: 'bg-blue-700 text-white' },
              { key: '2ball', label: 'I2BALL', color: 'bg-blue-800 text-white' },
              { key: 'summary', label: 'SUMMARY', color: 'bg-gray-600 text-white' },
              { key: 'fow', label: 'FOW', color: 'bg-gray-700 text-white' },
              { key: 'b1', label: 'B1', color: 'bg-teal-600 text-white' },
              { key: 'b2', label: 'B2', color: 'bg-teal-700 text-white' },
              { key: 'bowler', label: 'BOWLER', color: 'bg-gray-600 text-white' },
              { key: 'target', label: 'TARGET', color: 'bg-red-600 text-white' },
              { key: 'partnership', label: 'PARTNERSHIP', color: 'bg-green-700 text-white' },
              { key: 'teams', label: 'TEAMS PLAYERS', color: 'bg-red-700 text-white' },
            ] as { key: DisplayMode; label: string; color: string }[]).map(btn => (
              <ControlBtn key={btn.key} label={btn.label} color={btn.color} onClick={() => sendDisplay(btn.key)} active={activeDisplay === btn.key} />
            ))}
          </div>
        </Section>

        {/* Decision */}
        <Section>
          <div className="flex items-center gap-3 justify-center">
            <span className="font-display text-lg font-bold text-red-400">Decision :</span>
            <ControlBtn label="PENDING" color="bg-gray-700 text-white" onClick={() => {}} />
            <ControlBtn label="OUT" color="bg-red-600 text-white" onClick={() => sendOverlay('out')} />
            <ControlBtn label="NOT OUT" color="bg-green-600 text-white" onClick={() => sendOverlay('not_out')} />
          </div>
        </Section>

        {/* Custom Input */}
        <Section>
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-bold text-red-400 whitespace-nowrap">Custom Input :</span>
            <Input value={customInput} onChange={e => setCustomInput(e.target.value)} placeholder="Custom Input (use - for split text to next line)" className="bg-secondary flex-1" />
            <Button className="bg-green-600 hover:bg-green-700 text-white font-bold" onClick={sendCustomText}>Display Input</Button>
          </div>
        </Section>

        {/* Select MOM Player */}
        <Section>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-display text-lg font-bold text-red-400 whitespace-nowrap">Select MOM Player:</span>
            <Select onValueChange={(v) => { if (id) setDisplayState(id, { momPlayer: v }); }}>
              <SelectTrigger className="bg-secondary w-48"><SelectValue placeholder="Select MOM Player" /></SelectTrigger>
              <SelectContent>
                {allPlayers.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <ControlBtn label="Display MOM" color="bg-green-600 text-white" onClick={() => {}} />
            <ControlBtn label="MVP_M1" color="bg-orange-500 text-white" onClick={() => {}} />
            <ControlBtn label="MVP_M2" color="bg-orange-600 text-white" onClick={() => {}} />
          </div>
        </Section>

        {/* Tour Stats Controller */}
        <Section>
          <h3 className="font-display text-center font-bold mb-3">TOUR STATS CONTROLLER <span className="text-red-400">(ONLY FOR THEME 10 to 15)</span></h3>
          <div className="flex flex-wrap gap-2 justify-center">
            <ControlBtn label="POINTS TABLE" color="bg-green-600 text-white" onClick={() => {}} />
            <ControlBtn label="PT (TIED POINT +1)" color="bg-red-600 text-white" onClick={() => {}} />
            <ControlBtn label="TOP BATTERS" color="bg-green-700 text-white" onClick={() => {}} />
            <ControlBtn label="TOP BOWLERS" color="bg-blue-600 text-white" onClick={() => {}} />
            <ControlBtn label="TOP 4/6 STRIKERS" color="bg-blue-700 text-white" onClick={() => {}} />
            <ControlBtn label="TOP PLAYER OF SERIES" color="bg-red-700 text-white" onClick={() => {}} />
          </div>
        </Section>

        {/* Select Team Color */}
        <Section>
          <h3 className="font-display text-center font-bold mb-3">SELECT TEAM COLOR</h3>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">{match.team1.name}</span>
              <input type="color" value={team1Color} onChange={e => setTeam1Color(e.target.value)} className="w-10 h-8 rounded cursor-pointer" />
            </div>
            <Button onClick={saveTeamColors} className="bg-green-600 hover:bg-green-700 text-white font-bold">SAVE</Button>
            <div className="flex items-center gap-2">
              <span className="text-sm">{match.team2.name}</span>
              <input type="color" value={team2Color} onChange={e => setTeam2Color(e.target.value)} className="w-10 h-8 rounded cursor-pointer" />
            </div>
          </div>
        </Section>

        {/* Show Extra Controller */}
        <button onClick={() => setShowExtra(!showExtra)} className="w-full bg-red-600 hover:bg-red-700 text-white font-display font-bold py-3 rounded-xl mb-4 transition-colors">
          {showExtra ? 'Hide Extra Controller' : 'Show Extra Controller'}
        </button>

        {showExtra && currentInnings && !currentInnings.isComplete && striker && bowler && (
          <Section>
            <h3 className="font-display font-semibold mb-3">Extra Scoring Controls</h3>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => { addRuns(5); }}>5 Runs</Button>
              <Button variant="outline" onClick={() => { addRuns(7); }}>7 Runs (overthrow)</Button>
              <Button variant="outline" onClick={() => {}}>Penalty Runs</Button>
            </div>
          </Section>
        )}

        {/* Match Result */}
        {match.status === 'finished' && (
          <Section className="text-center border-primary/30 shadow-glow">
            <Trophy className="h-12 w-12 text-accent mx-auto mb-3" />
            <h2 className="font-display text-3xl font-bold mb-2">{match.winner} Won!</h2>
            <p className="text-muted-foreground text-lg">by {match.winMargin}</p>
          </Section>
        )}
        {/* Innings Dialog */}
        <Dialog open={inningsDialogOpen} onOpenChange={setInningsDialogOpen}>
          <DialogContent className="bg-gradient-to-b from-cyan-400 to-cyan-500 border-none max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center text-2xl font-display font-bold text-white">
                {inningsDialogType === 0 ? 'Start 1st Inning' : 'Start 2nd Inning'}
              </DialogTitle>
            </DialogHeader>
            {(() => {
              const battingIdx = inningsDialogType === 0
                ? (match.tossWonBy === 0 ? (match.optedTo === 'bat' ? 0 : 1) : (match.optedTo === 'bat' ? 1 : 0))
                : (match.innings[0]?.battingTeamIndex === 0 ? 1 : 0);
              const bowlingIdx = battingIdx === 0 ? 1 : 0;
              const batTeamName = battingIdx === 0 ? match.team1.name : match.team2.name;
              const bowlTeamName = bowlingIdx === 0 ? match.team1.name : match.team2.name;
              return (
                <div className="space-y-4">
                  <p className="text-center text-red-600 font-bold text-lg">{batTeamName}</p>
                  <div>
                    <label className="block text-center font-bold text-black text-lg mb-1">Striker</label>
                    <Input value={strikerName} onChange={e => setStrikerName(e.target.value)} placeholder="Enter striker name" className="bg-white text-black border-white" />
                  </div>
                  <div>
                    <label className="block text-center font-bold text-black text-lg mb-1">Non-Striker</label>
                    <Input value={nonStrikerName} onChange={e => setNonStrikerName(e.target.value)} placeholder="Enter non-striker name" className="bg-white text-black border-white" />
                  </div>
                  <p className="text-center text-red-600 font-bold text-lg">{bowlTeamName}</p>
                  <div>
                    <label className="block text-center font-bold text-black text-lg mb-1">Bowler</label>
                    <Input value={bowlerName} onChange={e => setBowlerName(e.target.value)} placeholder="Enter bowler name" className="bg-white text-black border-white" />
                  </div>
                  <div className="flex gap-3 justify-center pt-2">
                    <Button onClick={startInningsWithPlayers} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6">
                      {inningsDialogType === 0 ? 'Start 1st Inning' : 'Start 2nd Inning'}
                    </Button>
                    <Button onClick={() => setInningsDialogOpen(false)} className="bg-red-500 hover:bg-red-600 text-white font-bold px-6">
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default MatchController;
