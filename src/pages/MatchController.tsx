import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Undo2, Plus, Trophy, Users, ArrowLeftRight, Lock } from 'lucide-react';
import { Match, Player, Innings, BallEvent, createPlayer, createInnings, getOversString, getRunRate } from '@/types/cricket';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';
import { getMatch, updateMatch, getTournament, getMatchesForTournament } from '@/lib/store';
import { setDisplayState, DisplayMode, AnimationOverlay } from '@/lib/displaySync';
import { supabase } from '@/integrations/supabase/client';
import { BallDot, EmptyBallDot } from '@/components/BallDot';

// Reusable autocomplete input with dropdown suggestions
const AutocompleteInput = ({
  value, onChange, suggestions, placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase())
  );
  const showDropdown = open && filtered.length > 0;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="bg-white text-black border-white"
      />
      {showDropdown && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
          {filtered.map(name => (
            <div
              key={name}
              onMouseDown={() => { onChange(name); setOpen(false); }}
              className="px-3 py-2 text-black text-sm cursor-pointer hover:bg-cyan-100"
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
  // Toss result dialog
  const [tossDialogOpen, setTossDialogOpen] = useState(false);
  const [tossCoinSide, setTossCoinSide] = useState<'heads' | 'tails' | null>(null);
  const [tossWinnerIdx, setTossWinnerIdx] = useState<0 | 1>(0);
  const [tossOptedTo, setTossOptedTo] = useState<'bat' | 'bowl'>('bat');
  // Edit match dialog
  const [editMatchOpen, setEditMatchOpen] = useState(false);
  const [editTeam1Name, setEditTeam1Name] = useState('');
  const [editTeam2Name, setEditTeam2Name] = useState('');
  const [editTossWonBy, setEditTossWonBy] = useState<'0' | '1'>('0');
  const [editOptedTo, setEditOptedTo] = useState<'bat' | 'bowl'>('bat');
  const [editMatchType, setEditMatchType] = useState('group');
  // Swap/Change dialogs
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [changeBowlerDialogOpen, setChangeBowlerDialogOpen] = useState(false);
  const [newBowlerName, setNewBowlerName] = useState('');
  const [newBatsmanName, setNewBatsmanName] = useState('');
  const [needsBowlerAfterWicket, setNeedsBowlerAfterWicket] = useState(false);
  const scoringLock = useRef(false);
  // Boundary count tracking (for manual button display only - no auto-trigger)
  const lastFoursCount = useRef(-1);
  const lastSixesCount = useRef(-1);
  // Scoreboard permissions
  const [sbPerms, setSbPerms] = useState({ sb2: false, sb3: false, sb4: false });

  useEffect(() => {
    const fetchPerms = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ops/check-access`,
          { headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const data = await res.json();
        setSbPerms({
          sb2: data.sb2_unlocked ?? false,
          sb3: data.sb3_unlocked ?? false,
          sb4: data.sb4_unlocked ?? false,
        });
      } catch { /* ignore */ }
    };
    fetchPerms();
  }, []);

  useEffect(() => {
    if (id) {
      getMatch(id).then(m => setMatch(m || null));
    }
  }, [id]);

  // Ensure score_live row exists when controller opens (so scoreboard doesn't hang)
  const scoreLiveInitDone = useRef(false);
  useEffect(() => {
    if (!id || !match || scoreLiveInitDone.current) return;
    scoreLiveInitDone.current = true;
    (supabase.from('score_live') as any).upsert(
      { match_id: id, snapshot: {}, updated_at: new Date().toISOString() },
      { onConflict: 'match_id', ignoreDuplicates: true }
    ).then(({ error }: any) => {
      if (error) console.error('score_live init failed:', error);
      else console.log('score_live row ensured for match', id);
    });
  }, [id, match]);

  useEffect(() => {
    if (match) {
      setTeam1Color(match.team1.color || '#ff0000');
      setTeam2Color(match.team2.color || '#0000ff');
    }
  }, [match?.id]);

  const [tournamentName, setTournamentName] = useState('Tournament');
  const [tournamentVenue, setTournamentVenue] = useState('');
  const [tournamentMatches, setTournamentMatches] = useState<Match[]>([]);
  useEffect(() => {
    if (match?.tournamentId) {
      getTournament(match.tournamentId).then(t => {
        setTournamentName(t?.name || 'Tournament');
        setTournamentVenue(t?.address || '');
      });
      getMatchesForTournament(match.tournamentId).then(ms => setTournamentMatches(ms));
    }
  }, [match?.tournamentId]);

  // Broadcast channel for instant scoreboard sync (bypasses DB delay)
  const broadcastChannel = useRef(id ? supabase.channel(`broadcast-${id}`) : null);
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`broadcast-${id}`);
    ch.subscribe();
    broadcastChannel.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const pendingOverlay = useRef<AnimationOverlay | null>(null);
  // Debounce timer for heavy matches table update
  const matchSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMatchForSave = useRef<Match | null>(null);

  const broadcastPayload = useCallback((payload: any) => {
    broadcastChannel.current?.send({
      type: 'broadcast',
      event: 'match_update',
      payload,
    });
  }, []);

  // Create ultra-lightweight snapshot (~500 bytes) for instant broadcast
  // Count total fours and sixes across all innings
  const countBoundaries = useCallback((m: Match) => {
    let fours = 0, sixes = 0;
    for (const inn of m.innings) {
      const batTeam = inn.battingTeamIndex === 0 ? m.team1 : m.team2;
      for (const p of batTeam.players) {
        fours += p.fours;
        sixes += p.sixes;
      }
    }
    return { fours, sixes };
  }, []);

  const createSnapshot = useCallback((m: Match, overlay?: AnimationOverlay, boundaryAlert?: 'fours' | 'sixes', dismissal?: ScoreboardSnapshot['dismissal']): ScoreboardSnapshot => {
    const inn = m.currentInningsIndex >= 0 ? m.innings[m.currentInningsIndex] : null;
    const batTeam = inn ? (inn.battingTeamIndex === 0 ? m.team1 : m.team2) : null;
    const bowlTeam = inn ? (inn.bowlingTeamIndex === 0 ? m.team1 : m.team2) : null;
    const striker = inn && batTeam ? batTeam.players.find(p => p.id === inn.currentStrikerId) : null;
    const nonStriker = inn && batTeam ? batTeam.players.find(p => p.id === inn.currentNonStrikerId) : null;
    const bowler = inn && bowlTeam ? bowlTeam.players.find(p => p.id === inn.currentBowlerId) : null;
    const bpo = m.ballsPerOver;
    let overBalls: BallEvent[] = [];
    if (inn) {
      const ballsInOver = inn.balls % bpo || (inn.balls > 0 ? bpo : 0);
      const events = inn.events;
      let legalCount = 0;
      for (let i = events.length - 1; i >= 0 && overBalls.length < bpo + 6; i--) {
        overBalls.unshift(events[i]);
        if (events[i].isLegal) legalCount++;
        if (legalCount >= ballsInOver) break;
      }
    }
    const { fours, sixes } = countBoundaries(m);
    return {
      inn: inn ? { runs: inn.runs, wickets: inn.wickets, balls: inn.balls, batIdx: inn.battingTeamIndex } : { runs: 0, wickets: 0, balls: 0, batIdx: 0 },
      s: striker ? { name: striker.name, runs: striker.runs, bf: striker.ballsFaced } : undefined,
      ns: nonStriker ? { name: nonStriker.name, runs: nonStriker.runs, bf: nonStriker.ballsFaced } : undefined,
      b: bowler ? { name: bowler.name, w: bowler.bowlingWickets, r: bowler.bowlingRuns, balls: bowler.bowlingBalls } : undefined,
      ov: overBalls,
      t1: { name: m.team1.name, color: m.team1.color || '#c62828', logo: m.team1.logo && m.team1.logo.length < 500 ? m.team1.logo : undefined },
      t2: { name: m.team2.name, color: m.team2.color || '#1565c0', logo: m.team2.logo && m.team2.logo.length < 500 ? m.team2.logo : undefined },
      overs: m.overs,
      bpo,
      inIdx: m.currentInningsIndex,
      status: m.status,
      winner: m.winner,
      winMargin: m.winMargin,
      tossWonBy: m.tossWonBy,
      optedTo: m.optedTo,
      matchType: m.matchType,
      matchNo: m.matchNo,
      inn1Runs: m.innings[0] ? m.innings[0].runs : undefined,
      overlay: overlay || undefined,
      venue: tournamentVenue || undefined,
      totalFours: fours,
      totalSixes: sixes,
      boundaryAlert: boundaryAlert || undefined,
      tournamentId: m.tournamentId,
      tournamentName: tournamentName,
      dismissal: dismissal || undefined,
      ts: Date.now(),
    };
  }, [tournamentVenue, tournamentName, countBoundaries]);

  // Debounced save to matches table (heavy, only every 3s)
  const debouncedMatchSave = useCallback((m: Match) => {
    latestMatchForSave.current = m;
    if (matchSaveTimer.current) clearTimeout(matchSaveTimer.current);
    matchSaveTimer.current = setTimeout(() => {
      const toSave = latestMatchForSave.current;
      if (toSave) {
        updateMatch(toSave).catch(e => console.error('matches update failed:', e));
        latestMatchForSave.current = null;
      }
    }, 3000);
  }, []);

  // Cleanup debounce timer and save any pending data on unmount
  useEffect(() => {
    return () => {
      if (matchSaveTimer.current) {
        clearTimeout(matchSaveTimer.current);
        const toSave = latestMatchForSave.current;
        if (toSave) updateMatch(toSave).catch(console.error);
      }
    };
  }, []);

  const pendingDismissal = useRef<ScoreboardSnapshot['dismissal'] | null>(null);

  const save = useCallback((m: Match) => {
    const deep = JSON.parse(JSON.stringify(m)) as Match;
    setMatch(deep);
    scoringLock.current = false;
    const overlay = pendingOverlay.current;
    pendingOverlay.current = null;
    const dismissal = pendingDismissal.current;
    pendingDismissal.current = null;

    // Boundary alert: triggers once per 3-over block if a boundary was hit in that block
    // No auto-trigger boundary alert - only manual buttons trigger it
    const { fours, sixes } = countBoundaries(deep);
    if (lastFoursCount.current === -1) lastFoursCount.current = fours;
    if (lastSixesCount.current === -1) lastSixesCount.current = sixes;
    lastFoursCount.current = fours;
    lastSixesCount.current = sixes;

    // Always explicitly set overlay ('none' when no overlay) so scoreboards clear properly
    const snapshot = createSnapshot(deep, overlay || 'none', undefined, dismissal || undefined);
    snapshot.displayMode = activeDisplay;

    // 1. INSTANT: Broadcast via WebSocket (fastest, no DB involved)
    broadcastPayload({ snapshot });

    // 2. INSTANT: Write tiny snapshot to score_live table (~500 bytes)
    if (id) {
      (supabase.from('score_live') as any).upsert(
        { match_id: id, snapshot, updated_at: new Date().toISOString() },
        { onConflict: 'match_id' }
      ).then(({ error }: any) => {
        if (error) console.error('score_live upsert failed:', error);
        else console.log('DB_UPDATE_OK', Date.now(), id, 'runs=', snapshot.inn.runs, 'wickets=', snapshot.inn.wickets);
      });
    }

    // 3. DEBOUNCED: Heavy matches table update (every 3s max)
    debouncedMatchSave(deep);

    if (overlay && id) {
      setDisplayState(id, { overlay });
      if (overlay !== 'none') {
        // 6s: banner shows for 5s + 1s buffer for exit animation
        setTimeout(() => {
          const clearSnap = { ...createSnapshot(deep), overlay: 'none' as const };
          broadcastPayload({ snapshot: clearSnap });
          (supabase.from('score_live') as any).upsert(
            { match_id: id, snapshot: clearSnap, updated_at: new Date().toISOString() },
            { onConflict: 'match_id' }
          ).then(() => {});
          setDisplayState(id, { overlay: 'none' });
        }, 6000);
      }
    }
  }, [broadcastPayload, id, createSnapshot, debouncedMatchSave]);

  const sendDisplay = (mode: DisplayMode) => {
    if (!id) return;
    setActiveDisplay(mode);
    // Clear any pending overlay so scoring events don't re-trigger animation
    pendingOverlay.current = null;
    const ds = { mode, overlay: 'none' as AnimationOverlay, timestamp: Date.now() };
    broadcastPayload({ display_state: ds });
    setDisplayState(id, { mode, overlay: 'none' });
    // INSTANT: Also upsert score_live with display mode for fast sync
    // Always explicitly send overlay: 'none' so scoreboards clear any existing animation
    if (match) {
      const snapshot = createSnapshot(match, 'none');
      snapshot.displayMode = mode;
      (supabase.from('score_live') as any).upsert(
        { match_id: id, snapshot, updated_at: new Date().toISOString() },
        { onConflict: 'match_id' }
      ).then(({ error }: any) => {
        if (error) console.error('score_live display upsert failed:', error);
      });
    }
  };

  // For scoring: just set pendingOverlay (will be sent with match_data in save())
  const sendOverlay = (overlay: AnimationOverlay) => {
    pendingOverlay.current = overlay;
  };

  // For standalone overlay buttons (display panel) - send immediately
  const sendOverlayStandalone = (overlay: AnimationOverlay) => {
    if (!id) return;
    broadcastPayload({ display_state: { overlay, timestamp: Date.now() } });
    setDisplayState(id, { overlay });
    // INSTANT: Also upsert score_live with overlay
    if (match) {
      const snapshot = createSnapshot(match, overlay);
      snapshot.displayMode = activeDisplay;
      (supabase.from('score_live') as any).upsert(
        { match_id: id, snapshot, updated_at: new Date().toISOString() },
        { onConflict: 'match_id' }
      ).then(({ error }: any) => {
        if (error) console.error('score_live overlay upsert failed:', error);
      });
    }
    // All overlays (including out/not_out) auto-clear after 6s (banner shows 5s + 1s exit buffer)
    if (overlay !== 'none') {
      setTimeout(() => {
        broadcastPayload({ display_state: { overlay: 'none', timestamp: Date.now() } });
        setDisplayState(id, { overlay: 'none' });
        if (match) {
          const snapshot = createSnapshot(match);
          snapshot.displayMode = activeDisplay;
          (supabase.from('score_live') as any).upsert(
            { match_id: id, snapshot, updated_at: new Date().toISOString() },
            { onConflict: 'match_id' }
          ).then(() => {});
        }
      }, 6000);
    }
  };

  const sendCustomText = () => {
    if (!id || !customInput.trim()) return;
    const ds = { customText: customInput, timestamp: Date.now() };
    broadcastPayload({ display_state: ds });
    setDisplayState(id, { customText: customInput });
    // INSTANT: Also upsert score_live with custom text
    if (match) {
      const snapshot = createSnapshot(match);
      snapshot.displayMode = activeDisplay;
      snapshot.displayCustomText = customInput;
      (supabase.from('score_live') as any).upsert(
        { match_id: id, snapshot, updated_at: new Date().toISOString() },
        { onConflict: 'match_id' }
      ).then(({ error }: any) => {
        if (error) console.error('score_live customText upsert failed:', error);
      });
    }
  };

  // Manually trigger boundary alert on scoreboard for 5 seconds
  const sendBoundaryAlert = (type: 'fours' | 'sixes') => {
    if (!id || !match) return;
    const { fours, sixes } = countBoundaries(match);
    const snapshot = createSnapshot(match, undefined, type);
    snapshot.displayMode = activeDisplay;
    snapshot.totalFours = fours;
    snapshot.totalSixes = sixes;
    snapshot.boundaryAlert = type;
    broadcastPayload({ snapshot });
    (supabase.from('score_live') as any).upsert(
      { match_id: id, snapshot, updated_at: new Date().toISOString() },
      { onConflict: 'match_id' }
    ).then(({ error }: any) => {
      if (error) console.error('boundary alert upsert failed:', error);
    });
    // Auto-clear after 6s so it doesn't re-trigger on next snapshot
    setTimeout(() => {
      if (!match) return;
      const cleanSnap = createSnapshot(match);
      cleanSnap.displayMode = activeDisplay;
      broadcastPayload({ snapshot: cleanSnap });
    }, 6000);
  };

  // Send upcoming match display mode with next match info
  const sendUpcomingMatch = useCallback(() => {
    if (!id || !match) return;
    // Find next upcoming match in this tournament
    const upcoming = tournamentMatches.find(m => m.id !== match.id && m.status === 'upcoming');
    const snapshot = createSnapshot(match);
    snapshot.displayMode = 'upcoming';
    if (upcoming) {
      snapshot.upcomingTeam1 = upcoming.team1.name;
      snapshot.upcomingTeam2 = upcoming.team2.name;
      snapshot.upcomingMatchType = upcoming.matchType;
      snapshot.upcomingMatchNo = upcoming.matchNo;
    } else {
      // No upcoming, show placeholder
      snapshot.upcomingTeam1 = '???';
      snapshot.upcomingTeam2 = '???';
    }
    broadcastPayload({ snapshot });
    setDisplayState(id, { mode: 'upcoming' });
    setActiveDisplay('upcoming');
    (supabase.from('score_live') as any).upsert(
      { match_id: id, snapshot, updated_at: new Date().toISOString() },
      { onConflict: 'match_id' }
    );
  }, [id, match, tournamentMatches, createSnapshot, broadcastPayload]);

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
    if (!currentInnings || !striker || !bowler) return;
    if (scoringLock.current) return;

    if (wicketChecked) {
      if (!wicketType) return; // must select wicket type first - don't lock yet
    }

    // Lock ONLY after all validations pass
    scoringLock.current = true;

    try {
      if (wicketChecked) {
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
    } catch (e) {
      console.error('Scoring error:', e);
      scoringLock.current = false;
    }
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
    if (!currentInnings || !bowler) { scoringLock.current = false; return; }
    const updated = JSON.parse(JSON.stringify(match)) as Match;
    const inn = updated.innings[updated.currentInningsIndex];
    const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
    const blt = inn.bowlingTeamIndex === 0 ? updated.team1 : updated.team2;
    const isIllegal = type === 'wide' || type === 'noBall';
    const penaltyRun = isIllegal ? 1 : 0; // Wide/NoBall always cost 1 penalty run
    const totalRuns = runs + penaltyRun;
    const event: BallEvent = {
      id: crypto.randomUUID(), type, runs: totalRuns, batsmanId: striker?.id || '', bowlerId: bowler.id, isWicket: false, isLegal: !isIllegal, timestamp: Date.now(),
    };
    inn.events.push(event);
    inn.runs += totalRuns;
    const extrasKey = type === 'wide' ? 'wides' : type === 'noBall' ? 'noBalls' : type === 'bye' ? 'byes' : 'legByes';
    inn.extras[extrasKey] += totalRuns;

    const bowlerRef = blt.players.find(p => p.id === bowler.id)!;

    if (isIllegal) {
      // Wide/NoBall: NOT a legal ball, bowler charged runs
      bowlerRef.bowlingRuns += totalRuns;
    } else {
      // Bye/LegBye: IS a legal ball
      inn.balls += 1;
      bowlerRef.bowlingBalls += 1;
      // Batsman faces ball but no runs credited to batsman
      if (striker) {
        const batsmanRef = bt.players.find(p => p.id === striker.id);
        if (batsmanRef) batsmanRef.ballsFaced += 1;
      }
      // Swap on odd runs
      if (runs % 2 === 1) { const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; }
      // Over end
      if (inn.balls % match.ballsPerOver === 0) { const t = inn.currentStrikerId; inn.currentStrikerId = inn.currentNonStrikerId; inn.currentNonStrikerId = t; inn.currentBowlerId = undefined; }
      // Innings completion
      if (inn.balls >= match.overs * match.ballsPerOver) inn.isComplete = true;
    }

    // 2nd innings target check
    if (updated.currentInningsIndex === 1 && target && inn.runs >= target) {
      inn.isComplete = true; updated.status = 'finished';
      updated.winner = (inn.battingTeamIndex === 0 ? updated.team1 : updated.team2).name;
      updated.winMargin = `${bt.players.length - 1 - inn.wickets} wickets`;
    }

    save(updated);
  };

  const addWicket = (dismissalType: string = 'bowled') => {
    addWicketWithRuns(dismissalType, 0);
  };

  const addWicketWithRuns = (dismissalType: string, runs: number) => {
    if (!currentInnings || !striker || !bowler) { scoringLock.current = false; return; }
    sendOverlay('wicket');

    // Capture dismissed batsman stats BEFORE updating state
    const isRunOutNS = dismissalType === 'run_out_non_striker';
    const dismissedPlayer = isRunOutNS ? nonStriker : striker;
    if (dismissedPlayer) {
      pendingDismissal.current = {
        name: dismissedPlayer.name,
        runs: dismissedPlayer.runs + (isRunOutNS ? 0 : runs),
        balls: dismissedPlayer.ballsFaced + (isRunOutNS ? 0 : 1),
        fours: dismissedPlayer.fours,
        sixes: dismissedPlayer.sixes,
        dismissalType,
        dismissedBy: bowler.name,
      };
    }

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
        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          <Link to={`/scoreboard/${match.id}`} target="_blank">
            <span className="text-white text-xs font-semibold underline hover:text-cyan-300 transition-colors">SCOREBOARD 1</span>
          </Link>
          {[
            { num: 2, key: 'sb2' as const, path: `/scoreboard2/${match.id}` },
            { num: 3, key: 'sb3' as const, path: `/scoreboard3/${match.id}` },
            { num: 4, key: 'sb4' as const, path: `/scoreboard4/${match.id}` },
          ].map(({ num, key, path }) =>
            sbPerms[key] ? (
              <Link key={num} to={path} target="_blank">
                <span className="text-white text-xs font-semibold underline hover:text-cyan-300 transition-colors">SCOREBOARD {num}</span>
              </Link>
            ) : (
              <span
                key={num}
                className="flex items-center gap-1 text-xs font-semibold text-white/40 cursor-not-allowed select-none"
                title={`Scoreboard ${num} is locked. Contact admin to unlock.`}
              >
                <Lock className="h-3 w-3" /> SCOREBOARD {num}
              </span>
            )
          )}
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
                      <BallDot key={i} event={e} size="sm" theme="dark" />
                    ))}
                    {Array.from({ length: Math.max(0, match.ballsPerOver - currentOverBalls.length) }).map((_, i) => (
                      <EmptyBallDot key={`e-${i}`} size="sm" theme="dark" />
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

        {/* Toss Result + Edit Match buttons */}
        <div className="flex gap-3 justify-center mb-4 flex-wrap">
          <button
            onClick={() => {
              setTossWinnerIdx(match.tossWonBy as 0 | 1);
              setTossOptedTo(match.optedTo);
              setTossCoinSide(null);
              setTossDialogOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #b8860b, #ffd700, #b8860b)', border: '2px solid #ffd700', boxShadow: '0 0 16px rgba(255,215,0,0.5)', color: '#000' }}
          >
            🪙 TOSS RESULT
          </button>
          <button
            onClick={() => {
              setEditTeam1Name(match.team1.name);
              setEditTeam2Name(match.team2.name);
              setEditTossWonBy(String(match.tossWonBy) as '0' | '1');
              setEditOptedTo(match.optedTo);
              setEditMatchType(match.matchType);
              setEditMatchOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #1a237e, #283593)', border: '2px solid #5c6bc0', boxShadow: '0 0 12px rgba(63,81,181,0.4)' }}
          >
            ✏️ EDIT MATCH
          </button>
        </div>

        {/* Animations */}
        <Section>
          <h3 className="font-display text-center font-bold mb-3">Animations</h3>
          <div className="flex flex-wrap gap-2 justify-center">
            <ControlBtn label="FREE HIT" color="bg-red-500 text-white" onClick={() => sendOverlayStandalone('free_hit')} />
            <ControlBtn label="HAT-TRICK BALL" color="bg-rose-600 text-white" onClick={() => sendOverlayStandalone('hat_trick')} />
            <ControlBtn label="FOUR" color="bg-blue-600 text-white" onClick={() => sendOverlayStandalone('four')} />
            <ControlBtn label="SIX" color="bg-blue-700 text-white" onClick={() => sendOverlayStandalone('six')} />
            <ControlBtn label="WICKET" color="bg-red-600 text-white" onClick={() => sendOverlayStandalone('wicket')} />
            <ControlBtn label="TOUR BOUNDARIES" color="bg-green-600 text-white" onClick={() => {}} />
            <button onClick={() => sendOverlayStandalone('none')} className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-800 text-white border-2 border-red-500">STOP</button>
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
          {/* Boundary Alert Manual Buttons */}
          <div className="flex gap-3 justify-center mt-3 pt-3 border-t border-border">
            <button
              onClick={() => sendBoundaryAlert('fours')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm text-white transition-all active:scale-95 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #1a237e, #1565c0)', border: '2px solid #f5c842', boxShadow: '0 0 12px rgba(33,150,243,0.4)' }}
            >
              <span style={{ background: '#42a5f5', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>4</span>
              Total 4 Show
            </button>
            <button
              onClick={() => sendBoundaryAlert('sixes')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm text-white transition-all active:scale-95 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #880e4f, #c2185b)', border: '2px solid #f5c842', boxShadow: '0 0 12px rgba(233,30,99,0.4)' }}
            >
              <span style={{ background: '#f06292', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>6</span>
              Total 6 Show
            </button>
          </div>
        </Section>

        {/* Decision */}
        <Section>
          <div className="flex items-center gap-3 justify-center flex-wrap">
            <span className="font-display text-lg font-bold text-red-400">Decision :</span>
            <ControlBtn label="PENDING" color="bg-gray-700 text-white" onClick={() => sendOverlayStandalone('none')} />
            <ControlBtn label="OUT" color="bg-red-600 text-white" onClick={() => sendOverlayStandalone('out')} />
            <ControlBtn label="NOT OUT" color="bg-green-600 text-white" onClick={() => sendOverlayStandalone('not_out')} />
            <button
              onClick={() => {
                if (!id) return;
                const now = Date.now();
                setDisplayState(id, { drsTimerStart: now, timestamp: now });
                broadcastPayload({ display_state: { drsTimerStart: now, timestamp: now } });
              }}
              className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #1a237e, #3949ab)',
                border: '2px solid #7c4dff',
                color: '#fff',
                boxShadow: '0 0 16px rgba(124,77,255,0.5)',
                letterSpacing: '0.12em',
              }}
            >
              🎯 DRS TIME
            </button>
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
            <ControlBtn label="POINTS TABLE" color="bg-green-600 text-white" onClick={() => sendDisplay('tour_points' as any)} active={activeDisplay === ('tour_points' as any)} />
            <ControlBtn label="PT (TIED POINT +1)" color="bg-red-600 text-white" onClick={() => sendDisplay('tour_points_tied' as any)} active={activeDisplay === ('tour_points_tied' as any)} />
            <ControlBtn label="TOP BATTERS" color="bg-green-700 text-white" onClick={() => sendDisplay('tour_batters' as any)} active={activeDisplay === ('tour_batters' as any)} />
            <ControlBtn label="TOP BOWLERS" color="bg-blue-600 text-white" onClick={() => sendDisplay('tour_bowlers' as any)} active={activeDisplay === ('tour_bowlers' as any)} />
            <ControlBtn label="TOP 4/6 STRIKERS" color="bg-blue-700 text-white" onClick={() => sendDisplay('tour_boundaries' as any)} active={activeDisplay === ('tour_boundaries' as any)} />
            <ControlBtn label="TOP PLAYER OF SERIES" color="bg-red-700 text-white" onClick={() => sendDisplay('tour_series' as any)} active={activeDisplay === ('tour_series' as any)} />
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

        {/* ── MATCH FINISHED PANEL ─────────────────────────────────── */}
        {match.status === 'finished' && (() => {
          // Top batsmen across both innings
          const allBatsmen = [...match.team1.players, ...match.team2.players]
            .filter(p => p.ballsFaced > 0 || p.runs > 0)
            .map(p => ({
              name: p.name,
              team: match.team1.players.includes(p) ? match.team1.name : match.team2.name,
              runs: p.runs,
              balls: p.ballsFaced,
              fours: p.fours,
              sixes: p.sixes,
            }))
            .sort((a, b) => b.runs - a.runs)
            .slice(0, 5);

          // Top bowlers across both innings
          const allBowlers = [...match.team1.players, ...match.team2.players]
            .filter(p => p.bowlingBalls > 0)
            .map(p => ({
              name: p.name,
              team: match.team1.players.includes(p) ? match.team1.name : match.team2.name,
              wickets: p.bowlingWickets,
              runs: p.bowlingRuns,
              balls: p.bowlingBalls,
            }))
            .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
            .slice(0, 5);

          return (
            <div className="mb-4 rounded-2xl overflow-hidden border-2" style={{ borderColor: '#fdd835', background: 'linear-gradient(135deg, #0a1a0a, #0d2a1a)' }}>
              {/* Header */}
              <div className="flex items-center justify-center gap-3 py-3 px-4" style={{ background: 'linear-gradient(135deg, #1b5e20, #2e7d32)' }}>
                <Trophy className="h-5 w-5" style={{ color: '#fdd835' }} />
                <span className="font-display text-lg font-bold" style={{ color: '#fdd835' }}>MATCH RESULT</span>
                <Trophy className="h-5 w-5" style={{ color: '#fdd835' }} />
              </div>

              <div className="p-4 grid grid-cols-2 gap-4">
                {/* Top Batsmen */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2 text-center" style={{ color: '#fdd835' }}>🏏 Top Batsmen</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(253,216,53,0.3)' }}>
                        <th className="text-left pb-1 font-bold" style={{ color: '#90caf9' }}>Name</th>
                        <th className="text-right pb-1 font-bold" style={{ color: '#fdd835' }}>R</th>
                        <th className="text-right pb-1 font-bold" style={{ color: '#aaa' }}>B</th>
                        <th className="text-right pb-1 font-bold" style={{ color: '#f97316' }}>4s</th>
                        <th className="text-right pb-1 font-bold" style={{ color: '#a855f7' }}>6s</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBatsmen.map((b, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td className="py-1 font-semibold truncate max-w-[80px]" style={{ color: '#fff' }}>{b.name}</td>
                          <td className="text-right py-1 font-bold" style={{ color: '#fdd835' }}>{b.runs}</td>
                          <td className="text-right py-1" style={{ color: '#aaa' }}>{b.balls}</td>
                          <td className="text-right py-1" style={{ color: '#f97316' }}>{b.fours}</td>
                          <td className="text-right py-1" style={{ color: '#a855f7' }}>{b.sixes}</td>
                        </tr>
                      ))}
                      {allBatsmen.length === 0 && <tr><td colSpan={5} className="text-center py-2" style={{ color: '#666' }}>No data</td></tr>}
                    </tbody>
                  </table>
                </div>

                {/* Top Bowlers */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2 text-center" style={{ color: '#fdd835' }}>🎯 Top Bowlers</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(253,216,53,0.3)' }}>
                        <th className="text-left pb-1 font-bold" style={{ color: '#90caf9' }}>Name</th>
                        <th className="text-right pb-1 font-bold" style={{ color: '#4ade80' }}>W</th>
                        <th className="text-right pb-1 font-bold" style={{ color: '#aaa' }}>R</th>
                        <th className="text-right pb-1 font-bold" style={{ color: '#aaa' }}>O</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBowlers.map((b, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td className="py-1 font-semibold truncate max-w-[80px]" style={{ color: '#fff' }}>{b.name}</td>
                          <td className="text-right py-1 font-bold" style={{ color: '#4ade80' }}>{b.wickets}</td>
                          <td className="text-right py-1" style={{ color: '#aaa' }}>{b.runs}</td>
                          <td className="text-right py-1" style={{ color: '#aaa' }}>{Math.floor(b.balls / match.ballsPerOver)}.{b.balls % match.ballsPerOver}</td>
                        </tr>
                      ))}
                      {allBowlers.length === 0 && <tr><td colSpan={4} className="text-center py-2" style={{ color: '#666' }}>No data</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Win Result Banner */}
              <div className="py-3 px-4 text-center" style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}>
                <div className="font-display text-xl font-black uppercase tracking-wide" style={{ color: '#fdd835' }}>
                  🏆 {match.winner} WON
                </div>
                <div className="text-sm font-bold mt-0.5" style={{ color: '#fff' }}>by {match.winMargin}</div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 p-4">
                <button
                  onClick={sendUpcomingMatch}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #1565c0, #1976d2)', border: '2px solid #42a5f5', color: '#fff', boxShadow: '0 0 16px rgba(66,165,245,0.4)' }}
                >
                  ⏭ UPCOMING MATCH
                </button>
                <Link
                  to={`/tournament/${match.tournamentId}`}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #e65100, #f57c00)', border: '2px solid #ffd54f', color: '#fff', boxShadow: '0 0 16px rgba(255,152,0,0.4)', textDecoration: 'none' }}
                >
                  🏟 {tournamentName}
                </Link>
              </div>
            </div>
          );
        })()}



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

              // For 2nd innings: suggest batters from 1st innings bowlers, bowler from 1st innings batters
              const inn1 = match.innings[0];
              const batterSuggestions: string[] = inningsDialogType === 1 && inn1
                ? [...new Set(inn1.events.filter(e => e.bowlerId).map(e => {
                    const bowlingTeam = inn1.bowlingTeamIndex === 0 ? match.team1 : match.team2;
                    const p = bowlingTeam.players.find(pl => pl.id === e.bowlerId);
                    return p?.name || '';
                  }).filter(Boolean))]
                : [];
              const bowlerSuggestions: string[] = inningsDialogType === 1 && inn1
                ? [...new Set(inn1.events.filter(e => e.batsmanId).map(e => {
                    const battingTeam = inn1.battingTeamIndex === 0 ? match.team1 : match.team2;
                    const p = battingTeam.players.find(pl => pl.id === e.batsmanId);
                    return p?.name || '';
                  }).filter(Boolean))]
                : [];

              return (
                <div className="space-y-4">
                  <p className="text-center text-red-600 font-bold text-lg">{batTeamName}</p>
                  <div className="relative">
                    <label className="block text-center font-bold text-black text-lg mb-1">Striker</label>
                    <AutocompleteInput
                      value={strikerName}
                      onChange={setStrikerName}
                      suggestions={batterSuggestions}
                      placeholder="Enter striker name"
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-center font-bold text-black text-lg mb-1">Non-Striker</label>
                    <AutocompleteInput
                      value={nonStrikerName}
                      onChange={setNonStrikerName}
                      suggestions={batterSuggestions}
                      placeholder="Enter non-striker name"
                    />
                  </div>
                  <p className="text-center text-red-600 font-bold text-lg">{bowlTeamName}</p>
                  <div className="relative">
                    <label className="block text-center font-bold text-black text-lg mb-1">Bowler</label>
                    <AutocompleteInput
                      value={bowlerName}
                      onChange={setBowlerName}
                      suggestions={bowlerSuggestions}
                      placeholder="Enter bowler name"
                    />
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
                  if (!inn.currentStrikerId) inn.currentStrikerId = p.id;
                  else if (!inn.currentNonStrikerId) inn.currentNonStrikerId = p.id;
                  save(updated);
                  setNewBatterName('');
                  setNewBatterDialogOpen(false);
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

        {/* Toss Result Dialog */}
        <Dialog open={tossDialogOpen} onOpenChange={setTossDialogOpen}>
          <DialogContent className="border-none max-w-sm p-0 overflow-hidden">
            <div style={{ background: 'linear-gradient(160deg, #0a1628 0%, #1a2f4a 50%, #0d2b3e 100%)' }} className="p-6">
              <DialogHeader>
                <DialogTitle className="text-center text-2xl font-display font-bold" style={{ color: '#ffd700' }}>
                  🪙 TOSS RESULT
                </DialogTitle>
              </DialogHeader>

              {/* Coin Visual */}
              <div className="flex justify-center my-6">
                <div className="relative w-32 h-32 rounded-full flex items-center justify-center"
                  style={{
                    background: tossCoinSide === null
                      ? 'radial-gradient(circle at 35% 35%, #ffd700, #b8860b 60%, #8b6914)'
                      : tossCoinSide === 'heads'
                      ? 'radial-gradient(circle at 35% 35%, #90ee90, #228b22 60%, #145214)'
                      : 'radial-gradient(circle at 35% 35%, #87ceeb, #1565c0 60%, #0d3b6e)',
                    boxShadow: '0 0 30px rgba(255,215,0,0.6), inset 0 0 20px rgba(0,0,0,0.3)',
                    border: '4px solid #ffd700',
                  }}
                >
                  <span className="text-5xl font-bold" style={{ color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>
                    {tossCoinSide === null ? '🪙' : tossCoinSide === 'heads' ? 'H' : 'T'}
                  </span>
                </div>
              </div>

              {/* Heads / Tails Selection */}
              <p className="text-center text-sm mb-3" style={{ color: '#94a3b8' }}>Select coin result:</p>
              <div className="flex gap-3 justify-center mb-5">
                <button
                  onClick={() => setTossCoinSide('heads')}
                  className="flex-1 py-3 rounded-xl font-bold text-lg transition-all active:scale-95"
                  style={{
                    background: tossCoinSide === 'heads' ? 'linear-gradient(135deg, #228b22, #32cd32)' : 'rgba(255,255,255,0.08)',
                    border: tossCoinSide === 'heads' ? '2px solid #32cd32' : '2px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    boxShadow: tossCoinSide === 'heads' ? '0 0 16px rgba(50,205,50,0.5)' : 'none',
                  }}
                >
                  HEADS
                </button>
                <button
                  onClick={() => setTossCoinSide('tails')}
                  className="flex-1 py-3 rounded-xl font-bold text-lg transition-all active:scale-95"
                  style={{
                    background: tossCoinSide === 'tails' ? 'linear-gradient(135deg, #1565c0, #2196f3)' : 'rgba(255,255,255,0.08)',
                    border: tossCoinSide === 'tails' ? '2px solid #2196f3' : '2px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    boxShadow: tossCoinSide === 'tails' ? '0 0 16px rgba(33,150,243,0.5)' : 'none',
                  }}
                >
                  TAILS
                </button>
              </div>

              {/* Toss Winner */}
              <p className="text-center text-sm mb-2" style={{ color: '#94a3b8' }}>Toss won by:</p>
              <div className="flex gap-3 justify-center mb-4">
                {[match.team1, match.team2].map((team, idx) => (
                  <button
                    key={idx}
                    onClick={() => setTossWinnerIdx(idx as 0 | 1)}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
                    style={{
                      background: tossWinnerIdx === idx ? 'linear-gradient(135deg, #b8860b, #ffd700)' : 'rgba(255,255,255,0.08)',
                      border: tossWinnerIdx === idx ? '2px solid #ffd700' : '2px solid rgba(255,255,255,0.2)',
                      color: tossWinnerIdx === idx ? '#000' : '#fff',
                      boxShadow: tossWinnerIdx === idx ? '0 0 16px rgba(255,215,0,0.5)' : 'none',
                    }}
                  >
                    {team.name}
                  </button>
                ))}
              </div>

              {/* Opted To */}
              <p className="text-center text-sm mb-2" style={{ color: '#94a3b8' }}>Opted to:</p>
              <div className="flex gap-3 justify-center mb-5">
                {(['bat', 'bowl'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setTossOptedTo(opt)}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm uppercase transition-all active:scale-95"
                    style={{
                      background: tossOptedTo === opt ? 'linear-gradient(135deg, #c62828, #ef5350)' : 'rgba(255,255,255,0.08)',
                      border: tossOptedTo === opt ? '2px solid #ef5350' : '2px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      boxShadow: tossOptedTo === opt ? '0 0 12px rgba(239,83,80,0.5)' : 'none',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {/* Winner Banner */}
              {tossCoinSide && (
                <div className="rounded-xl p-3 mb-4 text-center" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))', border: '1px solid rgba(255,215,0,0.3)' }}>
                  <p className="text-xs mb-1" style={{ color: '#94a3b8' }}>Result</p>
                  <p className="font-bold text-lg" style={{ color: '#ffd700' }}>
                    {[match.team1, match.team2][tossWinnerIdx].name} won the toss
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>
                    ({tossCoinSide === 'heads' ? 'Heads' : 'Tails'}) — chose to {tossOptedTo}
                  </p>
                </div>
              )}

              {/* Save Button */}
              <button
                onClick={() => {
                  if (!id) return;
                  const updated = JSON.parse(JSON.stringify(match)) as Match;
                  updated.tossWonBy = tossWinnerIdx;
                  updated.optedTo = tossOptedTo;
                  updateMatch(updated).then(() => {
                    setMatch(updated);
                    const snapshot = createSnapshot(updated);
                    snapshot.tossWonBy = tossWinnerIdx;
                    snapshot.optedTo = tossOptedTo;
                    broadcastPayload({ snapshot });
                    (supabase.from('score_live') as any).upsert(
                      { match_id: id, snapshot, updated_at: new Date().toISOString() },
                      { onConflict: 'match_id' }
                    );
                  });
                  setTossDialogOpen(false);
                }}
                className="w-full py-3 rounded-xl font-bold text-base transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, #b8860b, #ffd700)', color: '#000', boxShadow: '0 4px 20px rgba(255,215,0,0.4)' }}
              >
                💾 SAVE TOSS RESULT
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Match Dialog */}
        <Dialog open={editMatchOpen} onOpenChange={setEditMatchOpen}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">✏️ Edit Match</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Team 1 Name</label>
                  <Input value={editTeam1Name} onChange={e => setEditTeam1Name(e.target.value)} className="bg-secondary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Team 2 Name</label>
                  <Input value={editTeam2Name} onChange={e => setEditTeam2Name(e.target.value)} className="bg-secondary" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Toss Won By</label>
                <div className="flex gap-3">
                  {(['0', '1'] as const).map(idx => (
                    <button
                      key={idx}
                      onClick={() => setEditTossWonBy(idx)}
                      className="flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-all"
                      style={{
                        background: editTossWonBy === idx ? 'hsl(var(--primary))' : 'transparent',
                        borderColor: editTossWonBy === idx ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                        color: editTossWonBy === idx ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                      }}
                    >
                      {idx === '0' ? (editTeam1Name || match.team1.name) : (editTeam2Name || match.team2.name)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Opted To</label>
                <div className="flex gap-3">
                  {(['bat', 'bowl'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setEditOptedTo(opt)}
                      className="flex-1 py-2 rounded-lg font-bold text-sm uppercase border-2 transition-all"
                      style={{
                        background: editOptedTo === opt ? 'hsl(var(--primary))' : 'transparent',
                        borderColor: editOptedTo === opt ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                        color: editOptedTo === opt ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Match Type</label>
                <select
                  value={editMatchType}
                  onChange={e => setEditMatchType(e.target.value)}
                  className="w-full rounded-md border border-input bg-secondary px-3 py-2 text-sm"
                >
                  <option value="group">Group Stage</option>
                  <option value="semi">Semi Final</option>
                  <option value="final">Final</option>
                  <option value="friendly">Friendly</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setEditMatchOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    if (!editTeam1Name.trim() || !editTeam2Name.trim()) return;
                    const updated = JSON.parse(JSON.stringify(match)) as Match;
                    updated.team1.name = editTeam1Name.trim();
                    updated.team2.name = editTeam2Name.trim();
                    updated.tossWonBy = parseInt(editTossWonBy);
                    updated.optedTo = editOptedTo;
                    updated.matchType = editMatchType;
                    updateMatch(updated).then(() => {
                      setMatch(updated);
                      if (id) {
                        const snapshot = createSnapshot(updated);
                        broadcastPayload({ snapshot });
                        (supabase.from('score_live') as any).upsert(
                          { match_id: id, snapshot, updated_at: new Date().toISOString() },
                          { onConflict: 'match_id' }
                        );
                      }
                    });
                    setEditMatchOpen(false);
                  }}
                  className="bg-primary text-primary-foreground font-bold"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
};

export default MatchController;
