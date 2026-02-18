import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import ScoreboardTicker from '@/components/ScoreboardTicker';
import BoundaryAlert from '@/components/BoundaryAlert';
import BroadcastOverlayBanner from '@/components/BroadcastOverlayBanner';
import MatchSummaryCard from '@/components/MatchSummaryCard';
import { useParams } from 'react-router-dom';
import { Match, BallEvent, getOversString, getRunRate } from '@/types/cricket';
import { getMatch } from '@/lib/store';
import { getDisplayState, DisplayState, AnimationOverlay, DisplayMode } from '@/lib/displaySync';
import { supabase } from '@/integrations/supabase/client';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';

// ErrorBoundary
class Scoreboard2ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Scoreboard2] ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen bg-transparent flex items-center justify-center">
          <div className="text-white/60 text-sm font-mono text-center p-4">
            <p>Scoreboard recovering...</p>
            <button onClick={() => this.setState({ hasError: false })} className="mt-2 px-3 py-1 bg-white/10 rounded text-xs">Retry</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Scoreboard2Inner = () => {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<ScoreboardSnapshot | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [display, setDisplay] = useState<DisplayState>({ mode: 'default', overlay: 'none', timestamp: 0 });
  const vsAnimDone = useRef(false);
  const [vsAnimIn, setVsAnimIn] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');
  const lastPayloadTs = useRef<number>(0);

  // Force transparent background for PRISM Live / OBS mobile WebViews
  useEffect(() => {
    document.documentElement.classList.add('scoreboard-page');
    document.documentElement.style.setProperty('background', 'transparent', 'important');
    document.documentElement.style.setProperty('background-color', 'transparent', 'important');
    document.body.style.setProperty('background', 'transparent', 'important');
    document.body.style.setProperty('background-color', 'transparent', 'important');
    const root = document.getElementById('root');
    if (root) {
      root.style.setProperty('background', 'transparent', 'important');
      root.style.setProperty('background-color', 'transparent', 'important');
    }
    return () => {
      document.documentElement.classList.remove('scoreboard-page');
      document.documentElement.style.removeProperty('background');
      document.documentElement.style.removeProperty('background-color');
      document.body.style.removeProperty('background');
      document.body.style.removeProperty('background-color');
      if (root) {
        root.style.removeProperty('background');
        root.style.removeProperty('background-color');
      }
    };
  }, []);

  // === REALTIME SYNC (identical to Scoreboard) ===
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    const loadMatch = async () => {
      try {
        const m = await getMatch(id);
        if (mounted && m) setMatch(m);
      } catch (e) { console.error('[Scoreboard2] Failed to load match:', e); }
    };

    const loadSnapshot = async () => {
      try {
        const { data } = await (supabase.from('score_live') as any).select('snapshot').eq('match_id', id).maybeSingle();
        if (data?.snapshot && mounted) {
          const snap = data.snapshot as ScoreboardSnapshot;
          setSnapshot(snap);
          if (snap.overlay && snap.overlay !== 'none') setDisplay(prev => ({ ...prev, overlay: snap.overlay! }));
          lastPayloadTs.current = snap.ts || Date.now();
        }
      } catch (e) { console.error('[Scoreboard2] score_live fetch failed:', e); }
    };

    const loadDisplay = async () => {
      try {
        const ds = await getDisplayState(id);
        if (mounted) setDisplay(ds);
      } catch (e) { console.error(e); }
    };

    loadMatch(); loadSnapshot(); loadDisplay();

    const applySnapshot = (snap: ScoreboardSnapshot) => {
      lastPayloadTs.current = Date.now();
      setSnapshot(snap);
      // Also reload full match data so BattingSummary/BowlingSummary have fresh player stats
      loadMatch();
      // Apply display mode/overlay from snapshot for instant sync
      if (snap.displayMode) {
        setDisplay(prev => ({ ...prev, mode: snap.displayMode as DisplayMode, overlay: snap.overlay && snap.overlay !== 'none' ? snap.overlay : prev.overlay }));
      } else if (snap.overlay && snap.overlay !== 'none') {
        setDisplay(prev => ({ ...prev, overlay: snap.overlay! }));
      }
      if (snap.displayCustomText) {
        setDisplay(prev => ({ ...prev, customText: snap.displayCustomText }));
      }
      if (snap.displayMomPlayer) {
        setDisplay(prev => ({ ...prev, momPlayer: snap.displayMomPlayer }));
      }
    };

    const scoreLiveCh = supabase.channel(`score-live2-${id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_live', filter: `match_id=eq.${id}` }, (payload) => {
        if (!mounted) return;
        const row = payload.new as any;
        if (row?.snapshot) applySnapshot(row.snapshot as ScoreboardSnapshot);
      })
      .subscribe((status) => { if (mounted) setConnectionStatus(status); });

    const broadcastCh = supabase.channel(`broadcast-${id}`)
      .on('broadcast', { event: 'match_update' }, (payload) => {
        if (!mounted) return;
        const data = payload.payload;
        if (data?.snapshot) { applySnapshot(data.snapshot as ScoreboardSnapshot); return; }
        if (data?.display_state) setDisplay(prev => ({ ...prev, ...data.display_state }));
      }).subscribe();

    const pgCh = supabase.channel(`pg2-${id}-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${id}` }, (payload) => {
        if (!mounted) return;
        const row = payload.new as any;
        if (row?.display_state) setDisplay(row.display_state as DisplayState);
        // Always update match data so summaries stay fresh
        if (row?.match_data) setMatch({ ...row.match_data, id } as unknown as Match);
      }).subscribe();

    return () => { mounted = false; supabase.removeChannel(scoreLiveCh); supabase.removeChannel(broadcastCh); supabase.removeChannel(pgCh); };
  }, [id]);

  useEffect(() => {
    if (display.mode === 'vs' && !vsAnimDone.current) {
      const t = setTimeout(() => { setVsAnimIn(true); vsAnimDone.current = true; }, 50);
      return () => clearTimeout(t);
    }
    if (display.mode !== 'vs') { vsAnimDone.current = false; setVsAnimIn(false); }
  }, [display.mode]);

  // === LOADING STATE ===
  if (!match && !snapshot) {
    return (
      <div className="w-full min-h-screen bg-transparent flex items-end justify-center p-0">
        <div className="w-full">
          <div className="relative flex items-center justify-center" style={{ height: '68px', background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(230,230,230,0.9) 100%)' }}>
            <span className="text-gray-400 text-sm font-mono animate-pulse">{connectionStatus === 'SUBSCRIBED' ? 'Waiting for controller...' : 'Connecting...'}</span>
          </div>
        </div>
      </div>
    );
  }
  if (!match) return <div className="w-full h-screen bg-transparent" />;

  // === DATA ===
  const s = snapshot;
  const currentInnings = match.currentInningsIndex >= 0 ? match.innings[match.currentInningsIndex] : null;
  const battingTeam = currentInnings ? (currentInnings.battingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const bowlingTeam = currentInnings ? (currentInnings.bowlingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const strikerData = s?.s || null;
  const nonStrikerData = s?.ns || null;
  const bowlerData = s?.b || null;
  const striker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentStrikerId) : null;
  const nonStriker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentNonStrikerId) : null;
  const bowler = currentInnings && bowlingTeam ? bowlingTeam.players.find(p => p.id === currentInnings.currentBowlerId) : null;
  const displayRuns = s ? s.inn.runs : 0;
  const displayWickets = s ? s.inn.wickets : 0;
  const displayBalls = s ? s.inn.balls : 0;
  const target = s ? (s.inIdx === 1 && s.inn1Runs !== undefined ? s.inn1Runs + 1 : null) : null;
  const t1Color = (s?.t1.color || match.team1.color || '#c62828');
  const t2Color = (s?.t2.color || match.team2.color || '#1565c0');
  const currentOverBalls = s?.ov || [];

  const getOverlayData = () => {
    if (display.overlay === 'none') return null;
    const c: Record<AnimationOverlay, { text: string; color: string }> = {
      none: { text: '', color: '' }, four: { text: 'FOUR!', color: '#2196f3' },
      six: { text: 'MAXIMUM SIX!', color: '#4caf50' }, wicket: { text: 'WICKET!', color: '#e91e63' },
      free_hit: { text: 'FREE HIT', color: '#ff9800' }, hat_trick: { text: 'HAT-TRICK!', color: '#f44336' },
      out: { text: 'OUT!', color: '#d32f2f' }, not_out: { text: 'NOT OUT!', color: '#388e3c' },
    };
    return c[display.overlay];
  };
  const overlayData = getOverlayData();

  // === TEAM FLAG ===
  const TeamFlag = ({ team, size = 48 }: { team: typeof match.team1; size?: number }) => (
    <div className="flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: size + 16, height: '100%', background: 'linear-gradient(180deg, #1a1a3e 0%, #0d0d2b 100%)' }}>
      {team.logo ? (
        <img src={team.logo} alt={team.name} className="object-contain" style={{ width: size, height: size }} />
      ) : (
        <div className="font-display font-black text-white/80" style={{ fontSize: size * 0.35 }}>
          {team.name.slice(0, 3).toUpperCase()}
        </div>
      )}
    </div>
  );

  // === BALL CIRCLE ===
  const BallCircle = ({ event }: { event: BallEvent }) => {
    let bg = 'transparent'; let border = 'rgba(100,100,120,0.5)'; let text = String(event.runs); let tc = '#333';
    if (event.isWicket) { bg = '#e91e63'; border = '#e91e63'; text = 'W'; tc = '#fff'; }
    else if (event.runs === 6) { bg = '#4caf50'; border = '#4caf50'; tc = '#fff'; }
    else if (event.runs === 4) { bg = '#2196f3'; border = '#2196f3'; tc = '#fff'; }
    else if (event.type === 'wide') { border = '#ff9800'; text = 'Wd'; tc = '#ff9800'; }
    else if (event.type === 'noBall') { border = '#ff9800'; text = 'Nb'; tc = '#ff9800'; }
    return (
      <div className="w-[22px] h-[22px] md:w-6 md:h-6 rounded-full flex items-center justify-center text-[9px] md:text-[10px] font-bold flex-shrink-0"
        style={{ backgroundColor: bg, border: `2px solid ${border}`, color: tc }}>
        {text}
      </div>
    );
  };

  const EmptyBall = () => (
    <div className="w-[22px] h-[22px] md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center text-[9px] flex-shrink-0"
      style={{ borderColor: 'rgba(100,100,120,0.3)', color: 'rgba(100,100,120,0.3)' }}>○</div>
  );

  // ===== MAIN SCORE BAR - ICC CLEAN STYLE (Reference Image) =====
  const DefaultScoreBar = () => {
    const need = target ? Math.max(0, target - displayRuns) : null;
    const remainBalls = (match.overs * match.ballsPerOver - displayBalls);
    const bpo = s?.bpo || match.ballsPerOver;
    const batTeamName = s ? (s.inn.batIdx === 0 ? s.t1.name : s.t2.name) : (battingTeam || match.team1).name;
    const bowlTeamName = s ? (s.inn.batIdx === 0 ? s.t2.name : s.t1.name) : (bowlingTeam || match.team2).name;

    return (
      <div className="w-full">
        {/* Decorative top edge - subtle gold/cream */}
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(200,180,140,0.4) 20%, rgba(200,180,140,0.6) 50%, rgba(200,180,140,0.4) 80%, transparent 95%)' }} />

        {/* Main bar - clean white/light theme */}
        <div className="relative flex items-stretch" style={{ height: '68px' }}>
          {/* Light background */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(250,250,252,0.97) 0%, rgba(235,235,240,0.97) 100%)' }} />
          {/* Subtle decorative wings on edges */}
          <div className="absolute left-0 top-0 bottom-0 w-[120px] md:w-[160px] opacity-20" style={{ background: `linear-gradient(135deg, transparent 40%, rgba(200,180,140,0.3) 70%, transparent 100%)` }} />
          <div className="absolute right-0 top-0 bottom-0 w-[120px] md:w-[160px] opacity-20" style={{ background: `linear-gradient(225deg, transparent 40%, rgba(200,180,140,0.3) 70%, transparent 100%)` }} />

          {/* LEFT: Batting team flag */}
          <div className="relative z-10 flex-shrink-0">
            <TeamFlag team={battingTeam || match.team1} size={40} />
          </div>

          {/* LEFT: Batsmen info */}
          <div className="relative z-10 flex flex-col justify-center px-2 md:px-4 flex-1 min-w-0" style={{ maxWidth: '260px' }}>
            {strikerData && (
              <div className="flex items-center gap-1">
                <span className="text-[#c62828] text-xs font-bold">▶</span>
                <span className="font-display font-bold text-[#1a1a2e] text-[12px] md:text-[14px] uppercase tracking-wide flex-1 truncate">{strikerData.name}</span>
                <span className="font-display font-black text-[#1a1a2e] text-base md:text-lg tabular-nums">{strikerData.runs}</span>
                <span className="text-gray-400 text-[10px] md:text-[11px] tabular-nums ml-0.5">{strikerData.bf}</span>
              </div>
            )}
            {nonStrikerData && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs opacity-0">▶</span>
                <span className="font-display text-gray-500 text-[12px] md:text-[14px] uppercase tracking-wide flex-1 truncate">{nonStrikerData.name}</span>
                <span className="font-display font-bold text-gray-600 text-sm md:text-base tabular-nums">{nonStrikerData.runs}</span>
                <span className="text-gray-400 text-[10px] md:text-[11px] tabular-nums ml-0.5">{nonStrikerData.bf}</span>
              </div>
            )}
          </div>

          {/* CENTER: Score pill - red/purple gradient */}
          <div className="relative z-10 flex flex-col items-center justify-center flex-shrink-0 min-w-[200px] md:min-w-[260px]">
            {overlayData ? (
              <div className="px-6 py-2 rounded-md shadow-lg" style={{ backgroundColor: overlayData.color }}>
                <span className="font-display text-xl md:text-2xl font-black text-white tracking-wider">{overlayData.text}</span>
              </div>
            ) : (
              <>
                {/* Top row: team names + score + overs */}
                <div className="flex items-center rounded-t-md overflow-hidden">
                  <div className="px-2 md:px-3 py-0.5 text-white text-[10px] md:text-xs font-display font-bold tracking-wider" style={{ background: 'linear-gradient(135deg, #c62828, #d32f2f)' }}>
                    {bowlTeamName.slice(0, 3).toUpperCase()} <span className="opacity-60">v</span>
                  </div>
                  <div className="px-2 md:px-3 py-0.5 flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg, #4a148c, #6a1b9a)' }}>
                    <span className="text-white font-display font-black text-sm md:text-base uppercase">{batTeamName.slice(0, 3).toUpperCase()}</span>
                    <span className="text-white font-display font-black text-lg md:text-xl tabular-nums">{displayRuns}-{displayWickets}</span>
                  </div>
                  <div className="px-2 py-0.5 text-white text-[11px] md:text-xs font-display font-bold tabular-nums" style={{ background: 'linear-gradient(135deg, #6a1b9a, #8e24aa)' }}>
                    {getOversString(displayBalls, bpo)}
                  </div>
                </div>
                {/* Bottom row: target or toss info */}
                <div className="px-3 py-0.5 rounded-b-md text-center" style={{ background: 'linear-gradient(135deg, #4a148c, #311b92)' }}>
                  <span className="text-white text-[9px] md:text-[10px] font-display font-bold tracking-wider uppercase">
                    {need !== null && need > 0 && remainBalls > 0 ? (
                      <>NEED <span className="text-amber-300">{need}</span> RUNS FROM <span className="text-amber-300">{remainBalls}</span> BALLS</>
                    ) : (s?.status || match.status) === 'finished' && (s?.winner || match.winner) ? (
                      <span className="text-amber-300">{s?.winner || match.winner} WON</span>
                    ) : null}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Bowler + Over balls */}
          <div className="relative z-10 flex flex-col justify-center px-2 md:px-4 flex-1 min-w-0" style={{ maxWidth: '300px' }}>
            {bowlerData && (
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-[#1a1a2e] text-[12px] md:text-[14px] uppercase tracking-wide flex-1 truncate">{bowlerData.name}</span>
                <span className="font-display font-black text-[#1a1a2e] text-base md:text-lg tabular-nums">{bowlerData.w}-{bowlerData.r}</span>
                <span className="text-gray-400 text-[10px] md:text-[11px] tabular-nums ml-0.5">{getOversString(bowlerData.balls, bpo)}</span>
              </div>
            )}
            {/* Over balls */}
            <div className="flex gap-0.5 md:gap-1 mt-1">
              {currentOverBalls.map((e, i) => <BallCircle key={i} event={e} />)}
              {Array.from({ length: Math.max(0, bpo - currentOverBalls.length) }).map((_, i) => <EmptyBall key={`e-${i}`} />)}
            </div>
          </div>

          {/* RIGHT: Bowling team flag */}
          <div className="relative z-10 flex-shrink-0">
            <TeamFlag team={bowlingTeam || match.team2} size={40} />
          </div>
        </div>

        {/* Bottom decorative edge */}
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(200,180,140,0.4) 20%, rgba(200,180,140,0.6) 50%, rgba(200,180,140,0.4) 80%, transparent 95%)' }} />
      </div>
    );
  };

  // ===== VS BANNER =====
  const VSBanner = () => (
    <div className={`relative w-full overflow-hidden transition-all duration-700 ${vsAnimIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <div className="relative flex items-stretch" style={{ height: '70px', background: 'linear-gradient(180deg, rgba(250,250,252,0.97) 0%, rgba(235,235,240,0.97) 100%)' }}>
        <div className={`flex items-center relative overflow-hidden flex-1 transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'}`}>
          <div className="h-full flex items-center justify-center px-3 flex-shrink-0" style={{ backgroundColor: t1Color, minWidth: '70px' }}>
            <TeamFlag team={match.team1} size={38} />
          </div>
          <span className="font-display text-xl md:text-2xl font-black text-[#1a1a2e] uppercase tracking-[0.1em] pl-4">{match.team1.name}</span>
        </div>
        <div className={`relative flex-shrink-0 flex items-center justify-center z-20 w-[160px] md:w-[200px] transition-all duration-700 delay-400 ${vsAnimIn ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          <div className="px-4 py-2 rounded-lg text-center" style={{ background: 'linear-gradient(135deg, #c62828, #4a148c)' }}>
            <div className="font-display text-[9px] text-amber-300 font-bold tracking-[0.2em] uppercase">{match.matchType || 'MATCH'}</div>
            <div className="font-display text-white text-base font-black tracking-wider">VS</div>
            <div className="font-display text-[8px] text-white/60 tracking-widest">{match.overs} OVERS</div>
          </div>
        </div>
        <div className={`flex items-center justify-end relative overflow-hidden flex-1 transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
          <span className="font-display text-xl md:text-2xl font-black text-[#1a1a2e] uppercase tracking-[0.1em] pr-4">{match.team2.name}</span>
          <div className="h-full flex items-center justify-center px-3 flex-shrink-0" style={{ backgroundColor: t2Color, minWidth: '70px' }}>
            <TeamFlag team={match.team2} size={38} />
          </div>
        </div>
      </div>
    </div>
  );

  // ===== TARGET BANNER =====
  const TargetBanner = () => {
    if (!target || !currentInnings || !battingTeam) return <VSBanner />;
    const need = Math.max(0, target - currentInnings.runs);
    const remainBalls = match.overs * match.ballsPerOver - currentInnings.balls;
    const rrr = remainBalls > 0 ? ((need / remainBalls) * match.ballsPerOver).toFixed(2) : '0.00';
    return (
      <div className="w-full">
        <div className="relative flex items-stretch h-14" style={{ background: 'linear-gradient(180deg, rgba(250,250,252,0.97) 0%, rgba(235,235,240,0.97) 100%)' }}>
          <div className="flex-1 flex items-center justify-center gap-4 md:gap-6 px-4">
            <span className="font-display text-lg md:text-xl font-black text-[#1a1a2e] uppercase">{battingTeam.name}</span>
            <div className="text-center px-4 py-1 rounded-lg" style={{ background: 'linear-gradient(135deg, #c62828, #4a148c)' }}>
              <p className="font-display text-white font-bold text-xs md:text-sm uppercase">NEED <span className="text-amber-300 text-base font-black">{need}</span> FROM <span className="text-amber-300 text-base font-black">{remainBalls}</span> BALLS</p>
              <p className="text-white/60 text-[9px] font-display">RRR: <span className="text-amber-300">{rrr}</span></p>
            </div>
            <span className="font-display text-lg md:text-xl font-black text-[#1a1a2e] uppercase">{bowlingTeam?.name}</span>
          </div>
        </div>
      </div>
    );
  };

  // ===== BATTING SUMMARY =====
  const BattingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-gray-500 text-center p-8">Innings not available</p>;
    const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
    const btColor = inn.battingTeamIndex === 0 ? t1Color : t2Color;
    const extras = inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes;
    // Show players who have batted or are currently batting first (in batting order),
    // then fill remaining slots as empty — never show bowlers who haven't batted
    const battedPlayers = bt.players.filter(p =>
      p.ballsFaced > 0 || p.isOut || p.id === inn.currentStrikerId || p.id === inn.currentNonStrikerId
    );
    const allSlots: (typeof battedPlayers[0] | null)[] = [
      ...battedPlayers,
      ...Array.from({ length: Math.max(0, 11 - battedPlayers.length) }, () => null),
    ];
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: `linear-gradient(135deg, ${btColor}, ${btColor}cc)` }}>
          <div className="flex items-center gap-3">
            {bt.logo && <img src={bt.logo} alt={bt.name} className="w-8 h-8 object-contain" />}
            <span className="font-display text-lg md:text-xl font-black text-white uppercase tracking-wider">{bt.name} — BATTING SUMMARY</span>
          </div>
          <span className="font-display text-xl md:text-2xl font-black text-white">{inn.runs}-{inn.wickets}</span>
        </div>
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, rgba(200,180,140,0.3), rgba(200,180,140,0.8), rgba(200,180,140,0.3))' }} />
        {/* Column headers */}
        <div className="px-5 py-1.5 text-[11px] text-gray-400 font-bold flex tracking-wider" style={{ background: 'linear-gradient(180deg, #f8f8fa, #f0f0f3)' }}>
          <span className="w-6 text-gray-300 text-[10px]">#</span>
          <span className="flex-1">BATSMAN</span>
          <span className="w-36 text-center text-[10px]">DISMISSAL</span>
          <span className="w-10 text-right">R</span>
          <span className="w-10 text-right">B</span>
        </div>
        {/* All 11 player rows */}
        <div style={{ background: '#fff' }}>
          {allSlots.map((p, idx) => {
            if (!p) {
              return (
                <div key={`empty-${idx}`} className="flex items-center px-5 border-b border-gray-100" style={{ height: '32px', background: idx % 2 === 0 ? '#f9f9f9' : '#fff' }}>
                  <span className="w-6 text-gray-200 text-[11px] font-bold tabular-nums">{idx + 1}</span>
                  <div className="flex-1 h-[1px] rounded" style={{ background: 'rgba(0,0,0,0.05)' }} />
                </div>
              );
            }
            const isStriker = p.id === inn.currentStrikerId;
            const isNonStriker = p.id === inn.currentNonStrikerId;
            const isNotOut = !p.isOut && (isStriker || isNonStriker || (inn.isComplete && !p.isOut && p.ballsFaced > 0));
            const hasBatted = p.ballsFaced > 0 || p.isOut;
            const isCurrentlyBatting = isStriker || isNonStriker;
            return (
              <div key={p.id}
                className="flex items-center px-5 border-b border-gray-100"
                style={{
                  height: '34px',
                  background: isCurrentlyBatting ? 'rgba(198,40,40,0.04)' : idx % 2 === 0 ? '#f9f9f9' : '#fff',
                }}>
                <span className="w-6 text-gray-300 text-[11px] font-bold tabular-nums">{idx + 1}</span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {isStriker && <span style={{ color: '#c62828', fontSize: '10px', fontWeight: 900, flexShrink: 0 }}>▶</span>}
                  <span className={`font-display font-bold text-[13px] uppercase tracking-wide truncate ${hasBatted ? 'text-[#1a1a2e]' : 'text-gray-300'}`}>
                    {p.name}
                  </span>
                  {isNotOut && (
                    <span className="text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 bg-green-100 text-green-700">NOT OUT</span>
                  )}
                </div>
                {/* Dismissal */}
                <div className="w-36 text-center">
                  {hasBatted && p.isOut && (
                    <span className="text-gray-400 text-[10px] italic truncate block">{p.dismissalType}{p.dismissedBy ? ` b ${p.dismissedBy}` : ''}</span>
                  )}
                </div>
                {/* Stats */}
                <span className={`w-10 text-right font-display font-black text-base tabular-nums ${hasBatted ? 'text-[#1a1a2e]' : 'text-gray-200'}`}>{hasBatted ? p.runs : ''}</span>
                <span className={`w-10 text-right text-sm tabular-nums ${hasBatted ? 'text-gray-400' : 'text-gray-200'}`}>{hasBatted ? p.ballsFaced : ''}</span>
              </div>
            );
          })}
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5" style={{ background: `linear-gradient(135deg, ${btColor}, ${btColor}cc)` }}>
          <span className="font-display text-white font-bold text-xs uppercase tracking-widest">{match.matchType}</span>
          <span className="text-white text-xs font-bold">EXTRAS: {extras}</span>
          <span className="text-white text-xs font-bold">{getOversString(inn.balls, match.ballsPerOver)} OV</span>
          <span className="font-display font-black text-white text-xl">{inn.runs}/{inn.wickets}</span>
        </div>
      </div>
    );
  };

  // ===== BOWLING SUMMARY =====
  const BowlingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-gray-500 text-center p-8">Innings not available</p>;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const bltColor = inn.bowlingTeamIndex === 0 ? t1Color : t2Color;
    const bowlers = blt.players.filter(p => p.bowlingBalls > 0);
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div className="flex items-center gap-3 px-5 py-3" style={{ background: `linear-gradient(135deg, ${bltColor}, ${bltColor}cc)` }}>
          {blt.logo && <img src={blt.logo} alt={blt.name} className="w-8 h-8 object-contain" />}
          <span className="font-display text-lg md:text-xl font-black text-white uppercase tracking-wider">{blt.name} - BOWLING</span>
        </div>
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, rgba(200,180,140,0.3), rgba(200,180,140,0.8), rgba(200,180,140,0.3))' }} />
        <div className="px-5 py-2 text-[11px] text-gray-400 font-bold flex tracking-wider" style={{ background: 'linear-gradient(180deg, #f8f8fa, #f0f0f3)' }}>
          <span className="flex-1">BOWLER</span><span className="w-14 text-right">O</span><span className="w-14 text-right">R</span><span className="w-14 text-right">W</span><span className="w-16 text-right">ECON</span>
        </div>
        <div style={{ background: '#fff' }}>
          {bowlers.map((p, idx) => (
            <div key={p.id} className={`flex items-center px-5 py-2 border-b border-gray-100 ${idx % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
              <span className="font-display font-bold text-sm text-[#1a1a2e] flex-1 uppercase tracking-wide">{p.name}</span>
              <span className="w-14 text-right text-[#1a1a2e] text-sm tabular-nums">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
              <span className="w-14 text-right text-[#1a1a2e] text-sm tabular-nums">{p.bowlingRuns}</span>
              <span className="w-14 text-right font-bold text-sm tabular-nums" style={{ color: p.bowlingWickets > 0 ? '#c62828' : '#c6282855' }}>{p.bowlingWickets}</span>
              <span className="w-16 text-right text-gray-400 text-sm tabular-nums">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
            </div>
          ))}
        </div>
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, rgba(200,180,140,0.3), rgba(200,180,140,0.8), rgba(200,180,140,0.3))' }} />
      </div>
    );
  };

  // ===== FOW =====
  const FallOfWickets = () => {
    if (!currentInnings) return null;
    let runningScore = 0; let runningBalls = 0;
    const fowList = currentInnings.events.map(e => {
      if (e.isLegal) runningBalls++;
      runningScore += e.runs;
      if (e.isWicket) { const b = battingTeam?.players.find(p => p.id === e.batsmanId); return { name: b?.name || '?', score: runningScore, overs: getOversString(runningBalls, match.ballsPerOver) }; }
      return null;
    }).filter(Boolean);
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #c62828, #d32f2f)' }}>
          <span className="font-display text-lg md:text-xl font-black text-white tracking-wider">FALL OF WICKETS</span>
        </div>
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, rgba(200,180,140,0.3), rgba(200,180,140,0.8), rgba(200,180,140,0.3))' }} />
        <div style={{ background: '#fff' }}>
          {fowList.map((f: any, i: number) => (
            <div key={i} className={`flex items-center px-5 py-2.5 border-b border-gray-100 ${i % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
              <span className="w-10 text-sm font-black tabular-nums text-[#c62828]">{i + 1}.</span>
              <span className="flex-1 font-display font-bold uppercase text-sm tracking-wide text-[#1a1a2e]">{f.name}</span>
              <span className="font-display font-black text-base tabular-nums text-[#1a1a2e]">{f.score}</span>
              <span className="text-gray-400 text-xs ml-3 tabular-nums">({f.overs})</span>
            </div>
          ))}
          {fowList.length === 0 && <p className="text-center text-gray-300 py-6 text-sm font-display tracking-wider">NO WICKETS YET</p>}
        </div>
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, rgba(200,180,140,0.3), rgba(200,180,140,0.8), rgba(200,180,140,0.3))' }} />
      </div>
    );
  };

  // ===== PARTNERSHIP =====
  const Partnership = () => {
    if (!striker || !nonStriker) return null;
    const totalPartnership = striker.runs + nonStriker.runs;
    const strikerPct = totalPartnership > 0 ? (striker.runs / totalPartnership) * 100 : 50;
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #2e7d32, #43a047)' }}>
          <span className="font-display text-lg md:text-xl font-black text-white tracking-wider">CURRENT PARTNERSHIP</span>
        </div>
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, rgba(200,180,140,0.3), rgba(200,180,140,0.8), rgba(200,180,140,0.3))' }} />
        <div className="py-6 px-6" style={{ background: '#fff' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-center flex-1">
              <p className="font-display font-bold text-base md:text-lg text-[#1a1a2e] uppercase tracking-wider">{striker.name}</p>
              <p className="text-4xl md:text-5xl font-black font-display mt-1 text-[#2e7d32]">{striker.runs}</p>
              <p className="text-gray-400 text-xs mt-1">({striker.ballsFaced} balls)</p>
            </div>
            <div className="text-center px-6">
              <p className="text-gray-400 text-[10px] font-display font-bold tracking-[0.3em] uppercase">PARTNERSHIP</p>
              <p className="font-display text-5xl md:text-6xl font-black text-[#1a1a2e] mt-1">{totalPartnership}</p>
            </div>
            <div className="text-center flex-1">
              <p className="font-display font-bold text-base md:text-lg text-[#1a1a2e] uppercase tracking-wider">{nonStriker.name}</p>
              <p className="text-4xl md:text-5xl font-black font-display mt-1 text-[#2e7d32]">{nonStriker.runs}</p>
              <p className="text-gray-400 text-xs mt-1">({nonStriker.ballsFaced} balls)</p>
            </div>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-gray-200 mt-2">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${strikerPct}%`, background: 'linear-gradient(90deg, #c62828, #e91e63)' }} />
          </div>
        </div>
        <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, rgba(200,180,140,0.3), rgba(200,180,140,0.8), rgba(200,180,140,0.3))' }} />
      </div>
    );
  };

  // ===== TEAMS =====
  const TeamsPlayers = () => (
    <div className="w-[90vw] max-w-[800px] mx-auto grid grid-cols-2 gap-0 overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
      {[match.team1, match.team2].map((team, ti) => (
        <div key={ti} className={ti === 0 ? 'border-r border-gray-200' : ''}>
          <div className="px-4 py-3 text-center font-display font-black text-white uppercase text-sm md:text-base flex items-center justify-center gap-2 tracking-wider" style={{ background: `linear-gradient(135deg, ${ti === 0 ? t1Color : t2Color}, ${ti === 0 ? t1Color : t2Color}cc)` }}>
            {team.logo && <img src={team.logo} alt={team.name} className="w-6 h-6 object-contain" />}
            {team.name}
          </div>
          <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, rgba(200,180,140,0.3), rgba(200,180,140,0.8), rgba(200,180,140,0.3))' }} />
          <div style={{ background: '#fff' }}>
            {team.players.map((p, i) => (
              <div key={p.id} className={`px-4 py-2 text-[#1a1a2e] text-sm border-b border-gray-100 flex items-center gap-2 ${i % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                <span className="text-gray-300 text-xs w-6 tabular-nums font-bold">{i + 1}.</span>
                <span className="font-display uppercase text-sm tracking-wide">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // ===== MATCH SUMMARY =====
  const MatchSummary = () => <MatchSummaryCard match={match} theme="light" />;

  // ===== RENDER =====
  const isBottomAligned = display.mode === 'default' || display.mode === 'score';

  const renderContent = () => {
    switch (display.mode) {
      case 'vs': return <VSBanner />;
      case 'target': return <TargetBanner />;
      case '1bat': return <BattingSummary inningsIdx={0} />;
      case '2bat': return <BattingSummary inningsIdx={1} />;
      case '1ball': case 'b1': return <BowlingSummary inningsIdx={0} />;
      case '2ball': case 'b2': return <BowlingSummary inningsIdx={1} />;
      case 'bowler': return bowler ? <BowlingSummary inningsIdx={match.currentInningsIndex} /> : <DefaultScoreBar />;
      case 'fow': return <FallOfWickets />;
      case 'partnership': return <Partnership />;
      case 'teams': return <TeamsPlayers />;
      case 'summary': return <MatchSummary />;
      case 'score': case 'default': default: return <DefaultScoreBar />;
    }
  };

  return (
    <div className={`w-full min-h-screen bg-transparent flex justify-center p-0 ${isBottomAligned ? 'items-end' : 'items-center'}`}>
      <div className={isBottomAligned ? 'w-full relative' : 'w-full px-2 md:px-4'}>
        {renderContent()}
        {isBottomAligned && <ScoreboardTicker snapshot={snapshot} match={match} variant="light" />}
        {isBottomAligned && <BoundaryAlert snapshot={snapshot} variant="light" barHeight={68} />}
        {/* Full-width broadcast overlay banner for FOUR / SIX / WICKET */}
        <BroadcastOverlayBanner
          overlay={display.overlay}
          onHide={() => setDisplay(prev => ({ ...prev, overlay: 'none' }))}
        />
      </div>
    </div>
  );
};

const Scoreboard2 = () => (
  <Scoreboard2ErrorBoundary>
    <Scoreboard2Inner />
  </Scoreboard2ErrorBoundary>
);

export default Scoreboard2;
