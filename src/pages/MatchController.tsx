import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Undo2, Plus, Trophy, Users, ArrowLeftRight } from 'lucide-react';
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
  // Extra type checkboxes
  const [wideChecked, setWideChecked] = useState(false);
  const [noBallChecked, setNoBallChecked] = useState(false);
  const [byesChecked, setByesChecked] = useState(false);
  const [legByesChecked, setLegByesChecked] = useState(false);
  const [wicketChecked, setWicketChecked] = useState(false);
  // Wicket system
  const [wicketType, setWicketType] = useState('');
  const [newBatterDialogOpen, setNewBatterDialogOpen] = useState(false);
  const [newBatterName, setNewBatterName] = useState('');
  // Swap/Change dialogs
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [changeBowlerDialogOpen, setChangeBowlerDialogOpen] = useState(false);
  const [newBowlerName, setNewBowlerName] = useState('');
  const [newBatsmanName, setNewBatsmanName] = useState('');
  const [needsBowlerAfterWicket, setNeedsBowlerAfterWicket] = useState(false);
  const scoringLock = useRef(false);

  useEffect(() => {
    if (id) {
      getMatch(id).then(m => setMatch(m || null));
    }
  }, [id]);

  useEffect(() => {
    if (match) {
      setTeam1Color(match.team1.color || '#ff0000');
      setTeam2Color(match.team2.color || '#0000ff');
    }
  }, [match?.id]);

  const [tournamentName, setTournamentName] = useState('Tournament');
  useEffect(() => {
    if (match?.tournamentId) {
      getTournament(match.tournamentId).then(t => setTournamentName(t?.name || 'Tournament'));
    }
  }, [match?.tournamentId]);

  const save = useCallback((m: Match) => {
    const deep = JSON.parse(JSON.stringify(m)) as Match;
    setMatch(deep);
    updateMatch(deep).catch(console.error).finally(() => {
      scoringLock.current = false;
    });
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
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const bt = battingIdx === 0 ? updated.team1 : updated.team2;
    let sp = bt.players.find(p => p.name.toLowerCase() === strikerName.trim().toLowerCase());
    if (!sp) { sp = createPlayer(strikerName.trim()); bt.players.push(sp); }
    let nsp = bt.players.find(p => p.name.toLowerCase() === nonStrikerName.trim().toLowerCase());
    if (!nsp) { nsp = createPlayer(nonStrikerName.trim()); bt.players.push(nsp); }
    const blt = bowlingIdx === 0 ? updated.team1 : updated.team2;
    let bp = blt.players.find(p => p.name.toLowerCase() === bowlerName.trim().toLowerCase());
    if (!bp) { bp = createPlayer(bowlerName.trim()); blt.players.push(bp); }
    innings.currentStrikerId = sp.id;
    innings.currentNonStrikerId = nsp.id;
    innings.currentBowlerId = bp.id;
    if (inningsIndex === 0) { updated.innings = [innings]; }
    else { updated.innings[0].isComplete = true; updated.innings.push(innings); }
    updated.currentInningsIndex = inningsIndex;
    updated.status = 'live';
    save(updated);
    setInningsDialogOpen(false);
  };

  const addPlayer = (teamIdx: 0 | 1, name: string, setName: (v: string) => void) => {
    if (!name.trim()) return;
    const names = name.split(',').map(n => n.trim()).filter(Boolean);
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const team = teamIdx === 0 ? updated.team1 : updated.team2;
    names.forEach(n => team.players.push(createPlayer(n)));
    save(updated);
    setName('');
  };

  const selectBatsman = (playerId: string, role: 'striker' | 'nonStriker') => {
    if (!currentInnings) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const inn = updated.innings[updated.currentInningsIndex];
    if (role === 'striker') inn.currentStrikerId = playerId;
    else inn.currentNonStrikerId = playerId;
    save(updated);
  };

  const selectBowler = (playerId: string) => {
    if (!currentInnings) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    updated.innings[updated.currentInningsIndex].currentBowlerId = playerId;
    save(updated);
  };

  // SWAP BATTER - swap striker and non-striker
  const swapBatter = () => {
    if (!currentInnings) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const inn = updated.innings[updated.currentInningsIndex];
    const t = inn.currentStrikerId;
    inn.currentStrikerId = inn.currentNonStrikerId;
    inn.currentNonStrikerId = t;
    save(updated);
  };

  // RETIRE BATTER - retire current striker, need new batsman
  const retireBatter = () => {
    if (!currentInnings || !striker) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const inn = updated.innings[updated.currentInningsIndex];
    // Mark striker as out (retired)
    const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
    const batsmanRef = bt.players.find(p => p.id === striker.id);
    if (batsmanRef) { batsmanRef.isOut = true; batsmanRef.dismissalType = 'retired'; }
    inn.currentStrikerId = undefined;
    save(updated);
    setRetireDialogOpen(false);
  };

  // CHANGE BOWLER
  const changeBowler = () => {
    if (!currentInnings || !newBowlerName.trim()) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const inn = updated.innings[updated.currentInningsIndex];
    const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
    let bp = blt.players.find(p => p.name.toLowerCase() === newBowlerName.trim().toLowerCase());
    if (!bp) { bp = createPlayer(newBowlerName.trim()); blt.players.push(bp); }
    inn.currentBowlerId = bp.id;
    save(updated);
    setNewBowlerName('');
    setChangeBowlerDialogOpen(false);
  };

  // Handle run scoring with checkbox extras
  const handleScore = (runs: number) => {
    if (!currentInnings || !bowler) return;
    if (scoringLock.current) return;
    scoringLock.current = true;

    if (wicketChecked) {
      if (!wicketType) return; // must select wicket type first
      addWicketWithRuns(wicketType, runs);
      setWicketChecked(false);
      setWicketType('');
      resetCheckboxes();
      return;
    }

    if (wideChecked) { addExtraWithRuns('wide', runs); resetCheckboxes(); return; }
    if (noBallChecked) { addExtraWithRuns('noBall', runs); resetCheckboxes(); return; }
    if (byesChecked) { addExtraWithRuns('bye', runs); resetCheckboxes(); return; }
    if (legByesChecked) { addExtraWithRuns('legBye', runs); resetCheckboxes(); return; }

    addRuns(runs);
  };

  const resetCheckboxes = () => {
    setWideChecked(false);
    setNoBallChecked(false);
    setByesChecked(false);
    setLegByesChecked(false);
    setWicketChecked(false);
  };

  const addRuns = (runs: number) => {
    if (!currentInnings || !striker || !bowler) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
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
    if (inn.balls >= match.overs * match.ballsPerOver) inn.isComplete = true;
    if (updated.currentInningsIndex === 1 && target && inn.runs >= target) {
      inn.isComplete = true; updated.status = 'finished';
      updated.winner = (inn.battingTeamIndex === 0 ? updated.team1 : updated.team2).name;
      updated.winMargin = `${bt.players.length - 1 - inn.wickets} wickets`;
    }
    save(updated);
  };

  const addExtra = (type: 'wide' | 'noBall' | 'bye' | 'legBye') => {
    addExtraWithRuns(type, 1);
  };

  const addExtraWithRuns = (type: 'wide' | 'noBall' | 'bye' | 'legBye', runs: number) => {
    if (!currentInnings || !bowler) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const inn = updated.innings[updated.currentInningsIndex];
    const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
    const event: BallEvent = {
      id: crypto.randomUUID(), type, runs, batsmanId: striker?.id || '', bowlerId: bowler.id, isWicket: false, isLegal: type === 'bye' || type === 'legBye', timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.runs += runs;
    inn.extras[type === 'wide' ? 'wides' : type === 'noBall' ? 'noBalls' : type === 'bye' ? 'byes' : 'legByes'] += runs;
    if (type === 'bye' || type === 'legBye') {
      inn.balls += 1;
      if (inn.balls % match.ballsPerOver === 0) { const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; inn.currentBowlerId = undefined; }
    }
    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;
    if (type === 'wide' || type === 'noBall') bowlerRef.bowlingRuns += runs;
    save(updated);
  };

  const addWicket = (dismissalType: string = 'bowled') => {
    addWicketWithRuns(dismissalType, 0);
  };

  const addWicketWithRuns = (dismissalType: string, runs: number) => {
    if (!currentInnings || !striker || !bowler) return;
    sendOverlay('wicket');
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const inn = updated.innings[updated.currentInningsIndex];
    const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
    const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
    const isMankad = dismissalType === 'mankad';
    const isRunOutNonStriker = dismissalType === 'run_out_non_striker';
    const event: BallEvent = {
      id: crypto.randomUUID(), type: 'wicket', runs, batsmanId: isRunOutNonStriker ? (nonStriker?.id || striker.id) : striker.id, bowlerId: bowler.id, isWicket: true, wicketType: dismissalType, isLegal: !isMankad, timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.runs += runs;
    inn.wickets += 1;
    if (!isMankad) inn.balls += 1;
    
    // Determine who is out
    const outPlayerId = isRunOutNonStriker ? nonStriker?.id : striker.id;
    const outPlayerRef = bt.players.find(p => p.id === outPlayerId);
    if (outPlayerRef) {
      outPlayerRef.isOut = true; 
      outPlayerRef.dismissalType = dismissalType; 
      outPlayerRef.dismissedBy = bowler.name;
      if (!isRunOutNonStriker) outPlayerRef.ballsFaced += 1;
    }
    
    // Add runs to striker
    if (runs > 0) {
      const batsmanRef = bt.players.find(p => p.id === striker.id)!;
      batsmanRef.runs += runs;
      if (!isRunOutNonStriker) { /* ballsFaced already counted */ } else { batsmanRef.ballsFaced += 1; }
    } else if (!isRunOutNonStriker) {
      const batsmanRef = bt.players.find(p => p.id === striker.id)!;
      batsmanRef.ballsFaced += 1;
    }

    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;
    bowlerRef.bowlingWickets += 1; 
    if (!isMankad) bowlerRef.bowlingBalls += 1;
    bowlerRef.bowlingRuns += runs;

    // Set who needs replacing
    if (isRunOutNonStriker) {
      inn.currentNonStrikerId = undefined;
    } else {
      inn.currentStrikerId = undefined;
    }

    // Swap on odd runs
    if (runs % 2 === 1 && !isRunOutNonStriker) {
      const t = inn.currentStrikerId;
      inn.currentStrikerId = inn.currentNonStrikerId;
      inn.currentNonStrikerId = t;
    }

    // Only auto-complete on overs limit, NOT on player count (allow adding new players dynamically)
    const oversComplete = !isMankad && inn.balls >= match.overs * match.ballsPerOver;
    if (oversComplete) {
      inn.isComplete = true;
      if (updated.currentInningsIndex === 1) {
        updated.status = 'finished';
        if (inn.runs >= (target || 0)) {
          updated.winner = (inn.battingTeamIndex === 0 ? updated.team1 : updated.team2).name;
          updated.winMargin = `${bt.players.length - 1 - inn.wickets} wickets`;
        } else {
          updated.winner = (inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2).name;
          updated.winMargin = `${(target || 0) - 1 - inn.runs} runs`;
        }
      }
    }
    const isEndOfOver = !isMankad && inn.balls % match.ballsPerOver === 0;
    if (isEndOfOver) { 
      const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; inn.currentBowlerId = undefined; 
    }
    save(updated);
    
    // Always open new batter dialog after wicket if innings not complete
    if (!inn.isComplete) {
      setNewBatterName('');
      setNewBatterDialogOpen(true);
      if (isEndOfOver) {
        setNeedsBowlerAfterWicket(true);
      }
    }
  };

  const undo = () => {
    if (!currentInnings || currentInnings.events.length === 0) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
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
      inn.extras[key] -= lastEvent.runs;
    }
    if (updated.status === 'finished') { updated.status = 'live'; updated.winner = undefined; updated.winMargin = undefined; }
    save(updated);
  };

  const endInnings = () => {
    if (!currentInnings) return;
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    updated.innings[updated.currentInningsIndex].isComplete = true;
    save(updated);
  };

  const saveTeamColors = () => {
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    updated.team1.color = team1Color;
    updated.team2.color = team2Color;
    save(updated);
  };

  const availableBatsmen = battingTeam?.players.filter(p => !p.isOut && p.id !== currentInnings?.currentStrikerId && p.id !== currentInnings?.currentNonStrikerId) || [];
  const availableBowlers = bowlingTeam?.players || [];
  const allPlayers = [...match.team1.players, ...match.team2.players];

  // Current over balls
  const currentOverBalls = currentInnings ? currentInnings.events.filter(e => {
    const idx = currentInnings.events.indexOf(e);
    return idx >= currentInnings.events.length - (currentInnings.balls % match.ballsPerOver || match.ballsPerOver);
  }).slice(-match.ballsPerOver) : [];

  // Fours and sixes count
  const totalFours = battingTeam?.players.reduce((a, p) => a + p.fours, 0) || 0;
  const totalSixes = battingTeam?.players.reduce((a, p) => a + p.sixes, 0) || 0;

  const tossInfo = `${match.tossWonBy === 0 ? match.team1.name : match.team2.name} WON THE TOSS AND OPTED TO ${match.optedTo.toUpperCase()} FIRST`;

  const Section = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-xl border border-border bg-card p-4 mb-4 ${className}`}>{children}</div>
  );

  const ControlBtn = ({ label, color, onClick, active }: { label: string; color: string; onClick: () => void; active?: boolean }) => (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${color} ${active ? 'ring-2 ring-white scale-105' : ''}`}>
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

        {/* Toss info + Fours/Sixes bar */}
        {currentInnings && (
          <>
            <div className="bg-gradient-to-r from-purple-700 to-purple-900 text-white text-center font-bold py-1.5 text-sm mb-2 rounded">
              {tossInfo}
            </div>
            <div className="bg-green-600 text-white text-center font-bold py-1.5 text-sm mb-3 rounded flex justify-center gap-8">
              <span>FOURS: {totalFours}</span>
              <span>SIXES: {totalSixes}</span>
            </div>
          </>
        )}

        {/* Live Score Display - 3 column like reference */}
        {currentInnings && battingTeam && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {/* Left - Batsmen */}
            <div className="bg-black border-2 border-gray-700 rounded-lg p-3">
              {striker && (
                <div className="flex items-center justify-between mb-1">
                  <span className="text-green-400 font-bold uppercase">▶ {striker.name}</span>
                  <span className="text-yellow-400 font-bold">{striker.runs} <span className="text-white/60 text-xs">{striker.ballsFaced}</span></span>
                </div>
              )}
              {nonStriker && (
                <div className="flex items-center justify-between">
                  <span className="text-white font-bold uppercase">{nonStriker.name}</span>
                  <span className="text-white font-bold">{nonStriker.runs} <span className="text-white/60 text-xs">{nonStriker.ballsFaced}</span></span>
                </div>
              )}
              {!striker && <p className="text-yellow-400 text-sm">Select striker...</p>}
            </div>

            {/* Center - Score */}
            <div className="bg-gradient-to-b from-blue-500 to-cyan-500 rounded-lg flex flex-col items-center justify-center p-3">
              <span className="font-display text-4xl font-bold text-white">{currentInnings.runs}- {currentInnings.wickets}</span>
              <span className="text-white font-bold text-sm">{getOversString(currentInnings.balls, match.ballsPerOver)}/{match.overs} OVR</span>
              {target && (
                <span className="text-yellow-200 text-xs font-bold mt-1">Need {Math.max(0, target - currentInnings.runs)} runs</span>
              )}
            </div>

            {/* Right - Bowler */}
            <div className="bg-gradient-to-r from-cyan-400 to-cyan-300 rounded-lg p-3">
              {bowler ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-black font-bold uppercase">{bowler.name}</span>
                    <span className="text-black font-bold">{bowler.bowlingWickets} - {bowler.bowlingRuns} <span className="text-black/60 text-xs">{getOversString(bowler.bowlingBalls, match.ballsPerOver)}</span></span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {currentOverBalls.map((e, i) => (
                      <span key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${e.isWicket ? 'bg-red-600 border-red-400 text-white' : e.type === 'wide' || e.type === 'noBall' ? 'bg-yellow-600 border-yellow-400 text-white' : e.runs === 4 ? 'bg-blue-500 border-blue-300 text-white' : e.runs === 6 ? 'bg-green-500 border-green-300 text-white' : 'bg-white/50 border-white text-black'}`}>
                        {e.isWicket ? 'W' : e.type === 'wide' ? 'Wd' : e.type === 'noBall' ? 'Nb' : e.runs}
                      </span>
                    ))}
                    {Array.from({ length: Math.max(0, match.ballsPerOver - currentOverBalls.length) }).map((_, i) => (
                      <span key={`e-${i}`} className="w-6 h-6 rounded-full border border-white/70 flex items-center justify-center bg-white/30" />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-black font-bold text-sm">Select bowler...</p>
              )}
            </div>
          </div>
        )}

        {/* SEND Button */}
        <div className="text-center mb-3">
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => sendDisplay(activeDisplay)}>SEND</Button>
        </div>

        {/* Main Controller Section */}
        <div className="bg-gradient-to-br from-purple-600 via-blue-500 to-cyan-400 rounded-xl p-5 mb-4">
          <h3 className="font-display text-2xl font-bold text-white text-center mb-4">Controller</h3>

          {/* Row 1: SWAP, RETIRE, CHANGE BOWLER, Default, Mini-Score, Tour Name, B1, B2, Bowler, Batting, Bowling */}
          {currentInnings && !currentInnings.isComplete && (
            <>
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                <button onClick={swapBatter} className="px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-pink-400 to-pink-300 text-white flex items-center gap-1">
                  <ArrowLeftRight className="h-3 w-3" /> SWAP BATTER
                </button>
                <ControlBtn label="RETIRE BATTER" color="bg-gradient-to-r from-green-300 to-yellow-200 text-black" onClick={() => setRetireDialogOpen(true)} />
                <ControlBtn label="CHANGE BOWLER" color="bg-gradient-to-r from-cyan-400 to-green-300 text-black" onClick={() => setChangeBowlerDialogOpen(true)} />
                <ControlBtn label="Default" color="bg-green-600 text-white" onClick={() => sendDisplay('default')} active={activeDisplay === 'default'} />
                <ControlBtn label="Mini-Score" color="bg-blue-600 text-white" onClick={() => sendDisplay('score')} active={activeDisplay === 'score'} />
                <ControlBtn label="Tour Name" color="bg-blue-700 text-white" onClick={() => sendDisplay('vs')} active={activeDisplay === 'vs'} />
                <ControlBtn label="B1" color="bg-teal-600 text-white" onClick={() => sendDisplay('b1')} active={activeDisplay === 'b1'} />
                <ControlBtn label="B2" color="bg-teal-700 text-white" onClick={() => sendDisplay('b2')} active={activeDisplay === 'b2'} />
                <ControlBtn label="Bowler" color="bg-blue-800 text-white" onClick={() => sendDisplay('bowler')} active={activeDisplay === 'bowler'} />
                <ControlBtn label="Batting" color="bg-gradient-to-r from-yellow-400 to-orange-300 text-black" onClick={() => sendDisplay('1bat')} active={activeDisplay === '1bat'} />
                <ControlBtn label="Bowling" color="bg-gradient-to-r from-gray-400 to-gray-300 text-black" onClick={() => sendDisplay('1ball')} active={activeDisplay === '1ball'} />
              </div>

              {/* Row 2: PP+, END Inning, UNDO */}
              <div className="flex flex-wrap gap-2 justify-center mb-4">
                <ControlBtn label="PP+" color="bg-yellow-500 text-black" onClick={() => {}} />
                <ControlBtn label={`END Inning ${match.currentInningsIndex + 1}`} color="bg-purple-600 text-white" onClick={endInnings} />
                <ControlBtn label="UNDO" color="bg-red-600 text-white" onClick={undo} />
              </div>

              {/* Add New Batter / Select Bowler manual buttons */}
              <div className="flex flex-wrap gap-2 justify-center mb-4">
                {(!striker || !nonStriker) && !currentInnings.isComplete && (
                  <ControlBtn label="Add New Batter" color="bg-black text-white ring-2 ring-red-500" onClick={() => { setNewBatterName(''); setNewBatterDialogOpen(true); }} />
                )}
                {!bowler && !currentInnings.isComplete && (
                  <ControlBtn label="Select Bowler" color="bg-black text-white ring-2 ring-blue-500" onClick={() => { setNewBowlerName(''); setChangeBowlerDialogOpen(true); }} />
                )}
              </div>

              {/* Checkbox Extras Row */}
              <div className="flex flex-wrap gap-4 justify-center mb-4 text-white">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={wideChecked} onChange={e => setWideChecked(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-bold">Wide</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={noBallChecked} onChange={e => setNoBallChecked(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-bold">No Ball</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={byesChecked} onChange={e => setByesChecked(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-bold">Byes</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={legByesChecked} onChange={e => setLegByesChecked(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-bold">Leg Byes</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={wicketChecked} onChange={e => setWicketChecked(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-bold text-yellow-300">Wicket 🏏</span>
                </label>
              </div>

              {/* How wicket fall? bar - shown when Wicket is checked */}
              {wicketChecked && (
                <div className="flex items-center justify-center gap-3 mb-4 bg-red-600 rounded-lg px-4 py-2.5">
                  <span className="text-white font-bold text-sm whitespace-nowrap">How wicket fall?</span>
                  <select
                    value={wicketType}
                    onChange={e => setWicketType(e.target.value)}
                    className="bg-white text-black px-3 py-1.5 rounded text-sm font-medium min-w-[200px]"
                  >
                    <option value="">Choose below</option>
                    <option value="bowled">Bowled</option>
                    <option value="catch_out">Catch out</option>
                    <option value="run_out_striker">Run out at striker end</option>
                    <option value="run_out_non_striker">Run out at non-striker end</option>
                    <option value="stumping">Stumping</option>
                    <option value="lbw">LBW</option>
                    <option value="hit_wicket">Hit wicket</option>
                    <option value="mankad">Mankad (Ball not count)</option>
                  </select>
                </div>
              )}

              {/* Circle Run Buttons */}
              {striker && bowler && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-3">
                    {[0, 1, 2, 3].map(r => (
                      <button key={r} onClick={() => handleScore(r)} className="w-12 h-12 rounded-full border-2 border-black/60 bg-transparent text-white font-display font-bold text-xl hover:bg-white/20 transition-colors flex items-center justify-center">
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    {[4, 5, 6].map(r => (
                      <button key={r} onClick={() => handleScore(r)} className="w-12 h-12 rounded-full border-2 border-black/60 bg-transparent text-white font-display font-bold text-xl hover:bg-white/20 transition-colors flex items-center justify-center">
                        {r}
                      </button>
                    ))}
                    <button onClick={() => {}} className="w-12 h-12 rounded-full border-2 border-black/60 bg-transparent text-white font-display font-bold text-xl hover:bg-white/20 transition-colors flex items-center justify-center">
                      ···
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => {}} className="w-12 h-12 rounded-full border-2 border-black/60 bg-transparent text-white font-display font-bold text-sm hover:bg-white/20 transition-colors flex items-center justify-center">
                      1D
                    </button>
                    <button onClick={() => {}} className="w-12 h-12 rounded-full border-2 border-black/60 bg-transparent text-white font-display font-bold text-xl hover:bg-white/20 transition-colors flex items-center justify-center">
                      ?
                    </button>
                  </div>
                </div>
              )}

              {/* Select new striker if needed */}
              {!striker && currentInnings && !currentInnings.isComplete && (
                <div className="mt-4 bg-black/30 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm font-bold mb-2 text-center">Select New Batsman</p>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {availableBatsmen.map(p => (
                      <Button key={p.id} size="sm" variant="outline" onClick={() => selectBatsman(p.id, 'striker')} className="text-white border-white/40">
                        {p.name}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2 justify-center">
                    <Input value={newBatsmanName} onChange={e => setNewBatsmanName(e.target.value)} placeholder="Or type new batsman name" className="bg-white text-black max-w-xs" />
                    <Button size="sm" className="bg-green-600 text-white" onClick={() => {
                      if (!newBatsmanName.trim()) return;
                      const updated = JSON.parse(JSON.stringify(match)) as Match;
                      const bt = currentInnings.battingTeamIndex === 0 ? updated.team1 : updated.team2;
                      let p = bt.players.find(pl => pl.name.toLowerCase() === newBatsmanName.trim().toLowerCase());
                      if (!p) { p = createPlayer(newBatsmanName.trim()); bt.players.push(p); }
                      updated.innings[updated.currentInningsIndex].currentStrikerId = p.id;
                      save(updated);
                      setNewBatsmanName('');
                    }}>Add</Button>
                  </div>
                </div>
              )}

              {/* Select bowler if needed */}
              {!bowler && currentInnings && !currentInnings.isComplete && (
                <div className="mt-4 bg-black/30 rounded-lg p-3">
                  <p className="text-yellow-400 text-sm font-bold mb-2 text-center">Select Bowler</p>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {availableBowlers.map(p => (
                      <Button key={p.id} size="sm" variant="outline" onClick={() => selectBowler(p.id)} className="text-white border-white/40">
                        {p.name} ({getOversString(p.bowlingBalls, match.ballsPerOver)}-{p.bowlingRuns}-{p.bowlingWickets})
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2 justify-center">
                    <Input value={newBowlerName} onChange={e => setNewBowlerName(e.target.value)} placeholder="Or type new bowler name" className="bg-white text-black max-w-xs" />
                    <Button size="sm" className="bg-green-600 text-white" onClick={() => changeBowler()}>Add</Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Pre-innings buttons */}
          {!currentInnings && (
            <div className="flex flex-wrap gap-2 justify-center">
              <ControlBtn label="Default" color="bg-green-600 text-white" onClick={() => sendDisplay('default')} active={activeDisplay === 'default'} />
              <ControlBtn label="Innings" color="bg-blue-700 text-white ring-2 ring-red-500" onClick={() => openInningsDialog(0)} />
              <ControlBtn label="Tour Name" color="bg-blue-600 text-white" onClick={() => sendDisplay('vs')} />
              <ControlBtn label="UNDO" color="bg-red-600 text-white" onClick={undo} />
            </div>
          )}

          {/* Between innings */}
          {currentInnings?.isComplete && match.currentInningsIndex === 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              <ControlBtn label="Default" color="bg-green-600 text-white" onClick={() => sendDisplay('default')} />
              <ControlBtn label="Innings" color="bg-blue-700 text-white ring-2 ring-red-500" onClick={() => openInningsDialog(1)} />
              <ControlBtn label="Tour Name" color="bg-blue-600 text-white" onClick={() => sendDisplay('vs')} />
              <ControlBtn label="UNDO" color="bg-red-600 text-white" onClick={undo} />
            </div>
          )}
        </div>

        {/* Edit Team Short Name + Add Players */}
        <div className="bg-gradient-to-r from-green-900/60 to-green-800/40 rounded-xl p-4 mb-4 border border-border">
          <p className="text-center text-sm text-muted-foreground mb-2 font-semibold">For Bulk upload add ; between player name</p>
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <Input value={newPlayerName1} onChange={e => setNewPlayerName1(e.target.value)} placeholder={`ADD PLAYER TO ${match.team1.name}`} className="bg-secondary flex-1" onKeyDown={e => e.key === 'Enter' && addPlayer(0, newPlayerName1, setNewPlayerName1)} />
              <Button size="icon" onClick={() => addPlayer(0, newPlayerName1, setNewPlayerName1)} className="bg-green-600"><Users className="h-4 w-4" /></Button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{match.team1.name.slice(0, 6)}... Players ({match.team1.players.length})</span>
            </div>
            <div className="flex gap-2 items-center">
              <Input value={newPlayerName2} onChange={e => setNewPlayerName2(e.target.value)} placeholder={`ADD PLAYER TO ${match.team2.name}`} className="bg-secondary flex-1" onKeyDown={e => e.key === 'Enter' && addPlayer(1, newPlayerName2, setNewPlayerName2)} />
              <Button size="icon" onClick={() => addPlayer(1, newPlayerName2, setNewPlayerName2)} className="bg-green-600"><Users className="h-4 w-4" /></Button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{match.team2.name.slice(0, 6)}... Players ({match.team2.players.length})</span>
            </div>
          </div>
        </div>

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
            <div className="flex flex-wrap gap-2">
              {['Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Hit Wicket'].map(type => (
                <Button key={type} variant="destructive" onClick={() => addWicket(type.toLowerCase())} className="font-display">{type}</Button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Button variant="outline" onClick={() => addRuns(5)}>5 Runs</Button>
              <Button variant="outline" onClick={() => addRuns(7)}>7 Runs (overthrow)</Button>
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
                    <Button onClick={() => setInningsDialogOpen(false)} className="bg-red-500 hover:bg-red-600 text-white font-bold px-6">Cancel</Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Retire Batter Dialog */}
        <Dialog open={retireDialogOpen} onOpenChange={setRetireDialogOpen}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle>Retire Batter</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Current striker <strong>{striker?.name}</strong> will be retired.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setRetireDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={retireBatter}>Retire</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Change Bowler Dialog */}
        <Dialog open={changeBowlerDialogOpen} onOpenChange={setChangeBowlerDialogOpen}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Bowler</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select or type new bowler name:</p>
              <div className="flex flex-wrap gap-1">
                {availableBowlers.map(p => (
                  <Button key={p.id} size="sm" variant={p.id === bowler?.id ? 'default' : 'outline'} onClick={() => {
                    selectBowler(p.id);
                    setChangeBowlerDialogOpen(false);
                  }}>{p.name}</Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={newBowlerName} onChange={e => setNewBowlerName(e.target.value)} placeholder="New bowler name" className="flex-1" />
                <Button onClick={changeBowler} className="bg-green-600 text-white">Add</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* New Batter Dialog - after wicket */}
        <Dialog open={newBatterDialogOpen} onOpenChange={setNewBatterDialogOpen}>
          <DialogContent className="bg-gradient-to-b from-cyan-400 to-cyan-500 border-none max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-center text-2xl font-display font-bold text-black">NEW BATTER</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-3 justify-center">
                <Input
                  value={newBatterName}
                  onChange={e => setNewBatterName(e.target.value)}
                  placeholder="Enter Player or Select from List"
                  className="bg-white text-black border-white max-w-xs"
                />
              </div>
              {availableBatsmen.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  {availableBatsmen.map(p => (
                    <Button key={p.id} size="sm" variant="outline" onClick={() => setNewBatterName(p.name)} className={`text-black border-black/40 ${newBatterName === p.name ? 'bg-green-300' : 'bg-white'}`}>
                      {p.name}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex gap-3 justify-center pt-2">
                <Button onClick={() => {
                  if (!newBatterName.trim() || !currentInnings) return;
                  const updated = JSON.parse(JSON.stringify(match)) as Match;
                  const inn = updated.innings[updated.currentInningsIndex];
                  const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
                  let p = bt.players.find(pl => pl.name.toLowerCase() === newBatterName.trim().toLowerCase());
                  if (!p) { p = createPlayer(newBatterName.trim()); bt.players.push(p); }
                  // Fill whichever is empty
                  if (!inn.currentStrikerId) inn.currentStrikerId = p.id;
                  else if (!inn.currentNonStrikerId) inn.currentNonStrikerId = p.id;
                  save(updated);
                  setNewBatterName('');
                  setNewBatterDialogOpen(false);
                  // If last ball of over caused this wicket, also need bowler
                  if (needsBowlerAfterWicket) {
                    setNeedsBowlerAfterWicket(false);
                    setNewBowlerName('');
                    setChangeBowlerDialogOpen(true);
                  }
                }} className="bg-green-600 hover:bg-green-700 text-white font-bold px-6">Add Batter</Button>
                <Button onClick={() => setNewBatterDialogOpen(false)} className="bg-red-500 hover:bg-red-600 text-white font-bold px-6">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default MatchController;
