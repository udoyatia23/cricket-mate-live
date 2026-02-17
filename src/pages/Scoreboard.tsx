import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import ScoreboardTicker from '@/components/ScoreboardTicker';
import BoundaryAlert from '@/components/BoundaryAlert';
import { useParams } from 'react-router-dom';
import { Match, BallEvent, getOversString, getRunRate } from '@/types/cricket';
import { getMatch } from '@/lib/store';
import { getDisplayState, DisplayState, AnimationOverlay, DisplayMode } from '@/lib/displaySync';
import { supabase } from '@/integrations/supabase/client';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';

// ====== ErrorBoundary to prevent blank screen in OBS/PRISM ======
class ScoreboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Scoreboard] ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen bg-transparent flex items-center justify-center">
          <div className="text-white/60 text-sm font-mono text-center p-4">
            <p>Scoreboard recovering...</p>
            <button onClick={() => this.setState({ hasError: false })} className="mt-2 px-3 py-1 bg-white/10 rounded text-xs">
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ScoreboardInner = () => {
  const { id } = useParams<{ id: string }>();
  // snapshot is the PRIMARY source of truth for the score bar
  const [snapshot, setSnapshot] = useState<ScoreboardSnapshot | null>(null);
  // match is loaded once for full data (summaries, FOW, teams, etc.)
  const [match, setMatch] = useState<Match | null>(null);
  const [display, setDisplay] = useState<DisplayState>({ mode: 'default', overlay: 'none', timestamp: 0 });
  const vsAnimDone = useRef(false);
  const [vsAnimIn, setVsAnimIn] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');
  const lastPayloadTs = useRef<number>(0);
  const retryCount = useRef(0);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let realtimeConnected = false;

    console.log(`[Scoreboard] Initializing for match ${id}`);

    // Load full match data (for summaries, FOW, teams display etc.)
    const loadMatch = async () => {
      try {
        console.log(`[Scoreboard] Fetching match data... ts=${Date.now()}`);
        const m = await getMatch(id);
        if (mounted && m) {
          setMatch(m);
          console.log(`[Scoreboard] Match loaded: ${m.team1.name} vs ${m.team2.name}`);
        }
      } catch (e) { console.error('[Scoreboard] Failed to load match:', e); }
    };

    // Load initial snapshot from score_live
    const loadSnapshot = async () => {
      try {
        const { data, error } = await (supabase.from('score_live') as any)
          .select('snapshot')
          .eq('match_id', id)
          .maybeSingle();
        if (data?.snapshot && mounted) {
          const snap = data.snapshot as ScoreboardSnapshot;
          setSnapshot(snap);
          if (snap.overlay && snap.overlay !== 'none') {
            setDisplay(prev => ({ ...prev, overlay: snap.overlay! }));
          }
          lastPayloadTs.current = snap.ts || Date.now();
          console.log(`[Scoreboard] Initial snapshot loaded, ts=${snap.ts}`);
        }
        if (error) console.error('[Scoreboard] score_live fetch error:', error);
      } catch (e) { console.error('[Scoreboard] score_live fetch failed:', e); }
    };

    const loadDisplay = async () => {
      try {
        const ds = await getDisplayState(id);
        if (mounted) setDisplay(ds);
      } catch (e) { console.error(e); }
    };

    // Initial loads in parallel
    loadMatch();
    loadSnapshot();
    loadDisplay();

    // Apply incoming snapshot - COMPLETE STATE REPLACEMENT, no merging
    const applySnapshot = (snap: ScoreboardSnapshot) => {
      lastPayloadTs.current = Date.now();
      console.log('SNAPSHOT_APPLIED', Date.now(), 'inIdx=', snap.inIdx, 'runs=', snap.inn.runs, 'wickets=', snap.inn.wickets, 'balls=', snap.inn.balls, 'displayMode=', snap.displayMode);
      // Replace snapshot entirely - this is the SOLE source of truth for score bar
      setSnapshot(snap);
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

    // PRIMARY: Listen to score_live table via postgres_changes
    const scoreLiveCh = supabase
      .channel(`score-live-${id}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'score_live', filter: `match_id=eq.${id}` },
        (payload) => {
          if (!mounted) return;
          const snap = (payload.new as any)?.snapshot as ScoreboardSnapshot | undefined;
          console.log('REALTIME_PAYLOAD', Date.now(), payload.eventType, 'inIdx=', snap?.inIdx, 'runs=', snap?.inn.runs, 'balls=', snap?.inn.balls);
          const row = payload.new as any;
          if (row?.snapshot) {
            applySnapshot(row.snapshot as ScoreboardSnapshot);
          }
        }
      )
      .subscribe((status) => {
        console.log('SUBSCRIBED', id, Date.now(), 'status=', status);
        if (mounted) setConnectionStatus(status);
        if (status === 'SUBSCRIBED') {
          realtimeConnected = true;
          retryCount.current = 0;
          // Stop fast polling when realtime is working
          if (fallbackTimer) {
            clearInterval(fallbackTimer);
            fallbackTimer = null;
          }
        }
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          realtimeConnected = false;
          console.error(`[Scoreboard] Realtime ${status}, no fallback polling (disabled for testing)`);
        }
      });

    // SECONDARY: Broadcast channel
    const broadcastCh = supabase
      .channel(`broadcast-${id}`)
      .on('broadcast', { event: 'match_update' }, (payload) => {
        if (!mounted) return;
        const data = payload.payload;
        if (data?.snapshot) {
          applySnapshot(data.snapshot as ScoreboardSnapshot);
          return;
        }
        if (data?.display_state) {
          setDisplay(prev => ({ ...prev, ...data.display_state }));
        }
      })
      .subscribe((status) => {
        console.log(`[Scoreboard] broadcast channel: ${status}`);
      });

    // BACKUP: postgres_changes on matches table (for display_state changes)
    const pgCh = supabase
      .channel(`pg-${id}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${id}` },
        (payload) => {
          if (!mounted) return;
          const row = payload.new as any;
          if (row?.display_state) {
            setDisplay(row.display_state as DisplayState);
          }
          // Only use match_data as fallback if no recent snapshot
          if (row?.match_data && Date.now() - lastPayloadTs.current > 5000) {
            setMatch({ ...row.match_data, id } as unknown as Match);
          }
        }
      )
      .subscribe();

    // POLLING DISABLED - testing pure realtime only
    // const pollScoreLive = async () => { ... };
    // const startPolling = () => { ... };
    console.log('[Scoreboard] Polling DISABLED - pure realtime mode');

    return () => {
      mounted = false;
      if (fallbackTimer) clearInterval(fallbackTimer);
      supabase.removeChannel(scoreLiveCh);
      supabase.removeChannel(broadcastCh);
      supabase.removeChannel(pgCh);
      console.log('[Scoreboard] Cleanup done');
    };
  }, [id]);

  useEffect(() => {
    if (display.mode === 'vs' && !vsAnimDone.current) {
      const t = setTimeout(() => { setVsAnimIn(true); vsAnimDone.current = true; }, 50);
      return () => clearTimeout(t);
    }
    if (display.mode !== 'vs') { vsAnimDone.current = false; setVsAnimIn(false); }
  }, [display.mode]);

  if (!match && !snapshot) {
    const msg = connectionStatus === 'SUBSCRIBED'
      ? 'Waiting for controller to start...'
      : 'Connecting to match...';
    return (
      <div className="w-full min-h-screen bg-transparent flex items-end justify-center p-0">
        <div className="w-full">
          <div className="h-[2px] w-full bg-white/30" />
          <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a55, #e8a83255, #f5c84255, #e8a83255, #c17a1a55)' }} />
          <div className="relative flex items-center justify-center" style={{ height: '62px', background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
            <span className="text-white/40 text-sm font-mono animate-pulse">{msg}</span>
          </div>
          <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a55, #e8a83255, #f5c84255, #e8a83255, #c17a1a55)' }} />
        </div>
      </div>
    );
  }
  if (!match) return <div className="w-full h-screen bg-transparent" />;

  // SNAPSHOT is the SOLE source of truth for score bar
  // match is only used for summary/FOW/teams views
  const s = snapshot;
  const currentInnings = match.currentInningsIndex >= 0 ? match.innings[match.currentInningsIndex] : null;
  const battingTeam = currentInnings ? (currentInnings.battingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const bowlingTeam = currentInnings ? (currentInnings.bowlingTeamIndex === 0 ? match.team1 : match.team2) : null;
  // Score bar uses ONLY snapshot data - no fallback to match state
  const strikerData = s?.s || null;
  const nonStrikerData = s?.ns || null;
  const bowlerData = s?.b || null;
  // For summary/FOW views, keep match-based references
  const striker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentStrikerId) : null;
  const nonStriker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentNonStrikerId) : null;
  const bowler = currentInnings && bowlingTeam ? bowlingTeam.players.find(p => p.id === currentInnings.currentBowlerId) : null;
  // Score values: ONLY from snapshot
  const displayRuns = s ? s.inn.runs : 0;
  const displayWickets = s ? s.inn.wickets : 0;
  const displayBalls = s ? s.inn.balls : 0;
  const target = s ? (s.inIdx === 1 && s.inn1Runs !== undefined ? s.inn1Runs + 1 : null) : null;
  const t1Color = (s?.t1.color || match.team1.color || '#c62828');
  const t2Color = (s?.t2.color || match.team2.color || '#1565c0');
  const batTeamColor = s ? (s.inn.batIdx === 0 ? t1Color : t2Color) : t1Color;
  const bowlTeamColor = s ? (s.inn.batIdx === 0 ? t2Color : t1Color) : t2Color;

  // Current over balls: ONLY from snapshot
  const currentOverBalls = s?.ov || [];

  const getOverlayData = () => {
    if (display.overlay === 'none') return null;
    const c: Record<AnimationOverlay, { text: string; color: string }> = {
      none: { text: '', color: '' }, four: { text: 'FOUR!', color: '#00bcd4' },
      six: { text: 'MAXIMUM!', color: '#4caf50' }, wicket: { text: 'WICKET!', color: '#e91e63' },
      free_hit: { text: 'FREE HIT', color: '#ff9800' }, hat_trick: { text: 'HAT-TRICK!', color: '#f44336' },
      out: { text: 'OUT!', color: '#d32f2f' }, not_out: { text: 'NOT OUT!', color: '#388e3c' },
    };
    return c[display.overlay];
  };
  const overlayData = getOverlayData();

  // ======== Angular Chevron Separator (like reference) ========
  const ChevronSeparator = () => (
    <div className="flex-shrink-0 relative" style={{ width: '28px', height: '100%' }}>
      <svg viewBox="0 0 28 70" className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5c842" />
            <stop offset="50%" stopColor="#e8a832" />
            <stop offset="100%" stopColor="#c17a1a" />
          </linearGradient>
        </defs>
        <polygon points="0,0 14,0 28,35 14,70 0,70 14,35" fill="url(#chevGrad)" />
      </svg>
    </div>
  );

  // Team logo in white/gray background box (like reference flags)
  const TeamFlag = ({ team, size = 50 }: { team: typeof match.team1; size?: number }) => (
    <div className="flex items-center justify-center flex-shrink-0 rounded-sm overflow-hidden" style={{ width: size + 10, height: size + 10, background: 'linear-gradient(180deg, #f0f0f0 0%, #d4d4d4 100%)' }}>
      {team.logo ? (
        <img src={team.logo} alt={team.name} className="object-contain" style={{ width: size, height: size }} />
      ) : (
        <div className="font-display font-black text-gray-700" style={{ fontSize: size * 0.32 }}>
          {team.name.slice(0, 3).toUpperCase()}
        </div>
      )}
    </div>
  );

  // Over ball circle (ICC style)
  const BallCircle = ({ event }: { event: typeof currentOverBalls[0] }) => {
    let bg = 'transparent'; let border = 'rgba(255,255,255,0.5)'; let text = String(event.runs); let tc = '#fff';
    if (event.isWicket) { bg = '#e91e63'; border = '#e91e63'; text = 'W'; }
    else if (event.runs === 6) { bg = '#4caf50'; border = '#4caf50'; }
    else if (event.runs === 4) { bg = '#00bcd4'; border = '#00bcd4'; }
    else if (event.type === 'wide') { border = '#ffc107'; text = 'Wd'; tc = '#ffc107'; }
    else if (event.type === 'noBall') { border = '#ffc107'; text = 'Nb'; tc = '#ffc107'; }
    return (
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
        style={{ backgroundColor: bg, border: `2px solid ${border}`, color: tc }}>
        {text}
      </div>
    );
  };

  const EmptyBall = () => (
    <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] flex-shrink-0"
      style={{ borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.25)' }}>○</div>
  );

  // ============ MAIN SCORE BAR - ICC EXACT MATCH ============
  const DefaultScoreBar = () => {
    const need = target ? Math.max(0, target - displayRuns) : null;
    const remainBalls = (match.overs * match.ballsPerOver - displayBalls);
    const bpo = s?.bpo || match.ballsPerOver;
    const batTeamName = s ? (s.inn.batIdx === 0 ? s.t1.name : s.t2.name) : (battingTeam || match.team1).name;
    const bowlTeamName = s ? (s.inn.batIdx === 0 ? s.t2.name : s.t1.name) : (bowlingTeam || match.team2).name;

    return (
      <div className="w-full">
        {/* Top white thin line */}
        <div className="h-[2px] w-full bg-white/80" />
        {/* Gold accent */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />

        {/* Main bar */}
        <div className="relative flex items-stretch" style={{ height: '62px' }}>
          {/* Deep purple background with ornamental pattern */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #2d2272 0%, #1c1660 40%, #150f50 100%)' }}>
            <div className="absolute inset-0 opacity-[0.06]" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='20' fill='none' stroke='white' stroke-width='1'/%3E%3Ccircle cx='30' cy='30' r='12' fill='none' stroke='white' stroke-width='0.5'/%3E%3Ccircle cx='30' cy='30' r='4' fill='none' stroke='white' stroke-width='0.5'/%3E%3C/svg%3E")`,
              backgroundSize: '50px 50px',
            }} />
          </div>

          {/* LEFT: Batting team flag */}
          <div className="relative z-10 flex items-center justify-center px-2 flex-shrink-0">
            <TeamFlag team={battingTeam || match.team1} size={42} />
          </div>

          {/* Chevron 1 */}
          <ChevronSeparator />

          {/* LEFT: Batsmen info - uses snapshot data */}
          <div className="relative z-10 flex flex-col justify-center px-3 flex-1 min-w-0" style={{ maxWidth: '280px' }}>
            {strikerData && (
              <div className="flex items-center gap-1.5">
                <span className="text-cyan-300 text-sm font-bold">/</span>
                <span className="font-display font-bold text-white text-[13px] uppercase tracking-wide flex-1 truncate">{strikerData.name}</span>
                <span className="font-display font-black text-[#e91e63] text-lg tabular-nums">{strikerData.runs}</span>
                <span className="text-white/50 text-[11px] tabular-nums w-6 text-right">{strikerData.bf}</span>
              </div>
            )}
            {nonStrikerData && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm opacity-0">/</span>
                <span className="font-display text-white/70 text-[13px] uppercase tracking-wide flex-1 truncate">{nonStrikerData.name}</span>
                <span className="font-display font-bold text-[#e91e63] text-sm tabular-nums">{nonStrikerData.runs}</span>
                <span className="text-white/40 text-[11px] tabular-nums w-6 text-right">{nonStrikerData.bf}</span>
              </div>
            )}
          </div>

          {/* Chevron 2 */}
          <ChevronSeparator />

          {/* CENTER: Score info - uses snapshot values */}
          <div className="relative z-10 flex flex-col items-center justify-center px-4 flex-shrink-0 min-w-[220px]">
            {overlayData ? (
              <div className="px-5 py-1.5 rounded" style={{ backgroundColor: overlayData.color }}>
                <span className="font-display text-2xl font-black text-white tracking-wider">{overlayData.text}</span>
              </div>
            ) : (
              <>
                {/* Top row: teams + score + overs */}
                <div className="flex items-center gap-2">
                  <span className="text-white/80 text-[12px] font-display tracking-wide">
                    {batTeamName.slice(0, 3).toUpperCase()}
                    <span className="text-white/40 mx-1">v</span>
                    <span className="font-bold text-white">{bowlTeamName.slice(0, 3).toUpperCase()}</span>
                  </span>
                  <div className="px-3 py-0.5 rounded font-display font-black text-white text-lg tabular-nums" style={{ backgroundColor: '#e91e63' }}>
                    {`${displayRuns}-${displayWickets}`}
                  </div>
                  <span className="text-white/70 text-[12px] font-display">
                    <span className="font-bold tabular-nums">{getOversString(displayBalls, bpo)}</span>
                    <span className="text-[10px] text-white/40 ml-1 tracking-wider">OVERS</span>
                  </span>
                </div>
                {/* Bottom row: target or toss */}
                <div className="text-[11px] text-white/80 font-display font-bold tracking-wider mt-0.5 uppercase">
                  {need !== null && need > 0 && remainBalls > 0 ? (
                    <>NEED <span className="text-amber-300">{need}</span> MORE RUNS FROM <span className="text-amber-300">{remainBalls}</span> BALLS</>
                  ) : (s?.status || match.status) === 'finished' && (s?.winner || match.winner) ? (
                    <span className="text-amber-300">{s?.winner || match.winner} WON</span>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {/* Chevron 3 */}
          <ChevronSeparator />

          {/* RIGHT: Bowler + Over balls - uses snapshot data */}
          <div className="relative z-10 flex flex-col justify-center px-3 flex-1 min-w-0" style={{ maxWidth: '280px' }}>
            {bowlerData && (
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-white text-[13px] uppercase tracking-wide flex-1 truncate">{bowlerData.name}</span>
                <span className="font-display font-black text-[#4caf50] text-lg tabular-nums">{bowlerData.w}-{bowlerData.r}</span>
                <span className="text-white/50 text-[11px] tabular-nums">{getOversString(bowlerData.balls, bpo)}</span>
              </div>
            )}
            {/* This over balls */}
            <div className="flex gap-1 mt-1">
              {currentOverBalls.map((e, i) => <BallCircle key={i} event={e} />)}
              {Array.from({ length: Math.max(0, bpo - currentOverBalls.length) }).map((_, i) => <EmptyBall key={`e-${i}`} />)}
            </div>
          </div>

          {/* Chevron 4 */}
          <ChevronSeparator />

          {/* RIGHT: Bowling team flag */}
          <div className="relative z-10 flex items-center justify-center px-2 flex-shrink-0">
            <TeamFlag team={bowlingTeam || match.team2} size={42} />
          </div>
        </div>

        {/* Bottom gold accent */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        {/* Bottom white thin line */}
        <div className="h-[2px] w-full bg-white/80" />
      </div>
    );
  };

  // ============ VS BANNER ============
  const VSBanner = () => (
    <div className={`relative w-full overflow-hidden transition-all duration-700 ${vsAnimIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <div className="h-[2px] w-full bg-white/80" />
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      <div className="relative flex items-stretch" style={{ height: '60px', background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
        {/* Team 1 */}
        <div className={`flex items-center relative overflow-hidden flex-1 transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'}`}>
          <div className="h-full flex items-center justify-center px-3 flex-shrink-0 relative z-10" style={{ backgroundColor: t1Color, minWidth: '60px' }}>
            <TeamFlag team={match.team1} size={36} />
          </div>
          <div className="absolute left-[60px] top-0 bottom-0 w-6 z-[5]" style={{ background: t1Color, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
          <span className="relative z-10 font-display text-2xl lg:text-3xl font-black text-white uppercase tracking-[0.12em] pl-6">{match.team1.name}</span>
        </div>
        {/* Center */}
        <div className={`relative flex-shrink-0 flex items-center justify-center z-20 w-[200px] transition-all duration-700 delay-400 ${vsAnimIn ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          <div className="absolute -left-[14px] top-0 bottom-0"><ChevronSeparator /></div>
          <div className="absolute -right-[14px] top-0 bottom-0"><ChevronSeparator /></div>
          <div className="relative z-10 text-center">
            <div className="font-display text-[10px] text-amber-400 font-bold tracking-[0.2em] uppercase">{match.matchType || 'MATCH'}</div>
            <div className="font-display text-white text-sm font-black tracking-wider">MATCH #{match.matchNo || 1}</div>
            <div className="font-display text-[9px] text-white/50 tracking-widest">{match.overs} OVERS</div>
          </div>
        </div>
        {/* Team 2 */}
        <div className={`flex items-center justify-end relative overflow-hidden flex-1 transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
          <span className="relative z-10 font-display text-2xl lg:text-3xl font-black text-white uppercase tracking-[0.12em] pr-6">{match.team2.name}</span>
          <div className="absolute right-[60px] top-0 bottom-0 w-6 z-[5]" style={{ background: t2Color, clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }} />
          <div className="h-full flex items-center justify-center px-3 flex-shrink-0 relative z-10" style={{ backgroundColor: t2Color, minWidth: '60px' }}>
            <TeamFlag team={match.team2} size={36} />
          </div>
        </div>
      </div>
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      <div className="h-[2px] w-full bg-white/80" />
    </div>
  );

  // ============ TARGET BANNER ============
  const TargetBanner = () => {
    if (!target || !currentInnings || !battingTeam) return <VSBanner />;
    const need = Math.max(0, target - currentInnings.runs);
    const remainBalls = match.overs * match.ballsPerOver - currentInnings.balls;
    const rrr = remainBalls > 0 ? ((need / remainBalls) * match.ballsPerOver).toFixed(2) : '0.00';
    return (
      <div className="w-full">
        <div className="h-[2px] w-full bg-white/80" />
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="relative flex items-stretch h-14" style={{ background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
          <div className="flex-1 flex items-center justify-center gap-6 px-4">
            <span className="font-display text-xl font-black text-white uppercase">{battingTeam.name}</span>
            <div className="text-center">
              <p className="font-display text-white font-bold text-sm uppercase">NEED <span className="text-amber-300 text-lg font-black">{need}</span> RUNS FROM <span className="text-amber-300 text-lg font-black">{remainBalls}</span> BALLS</p>
              <p className="text-white/50 text-xs font-display">REQ. RR: <span className="text-amber-300">{rrr}</span></p>
            </div>
            <span className="font-display text-xl font-black text-white uppercase">{bowlingTeam?.name}</span>
          </div>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="h-[2px] w-full bg-white/80" />
      </div>
    );
  };

  // ============ BATTING SUMMARY ============
  const BattingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-white text-center p-8">Innings not available</p>;
    const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
    const extras = inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes;
    const btColor = inn.battingTeamIndex === 0 ? t1Color : t2Color;
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div className="relative" style={{ background: `linear-gradient(135deg, ${btColor}dd, ${btColor}88)` }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0L40 20L20 40L0 20Z' fill='white' fill-opacity='0.1'/%3E%3C/svg%3E")`, backgroundSize: '30px 30px' }} />
          <div className="flex items-center justify-between px-5 py-3 relative z-10">
            <div className="flex items-center gap-3">
              <TeamFlag team={bt} size={32} />
              <span className="font-display text-lg md:text-xl font-black text-white uppercase tracking-wider drop-shadow-lg">{bt.name} - BATTING</span>
            </div>
            <div className="font-display text-xl md:text-2xl font-black text-white px-4 py-1 rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}>{inn.runs}-{inn.wickets}</div>
          </div>
        </div>
        {/* Gold accent */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        {/* Column headers */}
        <div className="px-5 py-2 text-[11px] text-white/50 font-bold flex tracking-wider" style={{ background: 'linear-gradient(180deg, #1e1660 0%, #150f50 100%)' }}>
          <span className="flex-1">BATSMAN</span><span className="w-12 text-right">R</span><span className="w-12 text-right">B</span><span className="w-10 text-right">4s</span><span className="w-10 text-right">6s</span>
        </div>
        {/* Player rows */}
        <div style={{ background: 'linear-gradient(180deg, #150f50 0%, #0d0a38 100%)' }}>
          {bt.players.map((p, idx) => {
            const isNotOut = !p.isOut && (p.id === inn.currentStrikerId || p.id === inn.currentNonStrikerId || (inn.isComplete && !p.isOut && p.ballsFaced > 0));
            const hasBatted = p.ballsFaced > 0 || p.isOut;
            if (!hasBatted) return null;
            return (
              <div key={p.id} className={`flex items-center px-5 py-2 border-b border-white/5 transition-colors ${isNotOut ? 'bg-white/5' : ''} ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                <div className="flex-1 min-w-0">
                  <span className="font-display font-bold text-sm text-white uppercase tracking-wide">{p.name}</span>
                  {p.isOut && <span className="text-white/30 text-[10px] ml-2 italic">{p.dismissalType} {p.dismissedBy ? `b ${p.dismissedBy}` : ''}</span>}
                  {isNotOut && <span className="text-[10px] ml-2 font-black tracking-wider px-1.5 py-0.5 rounded" style={{ color: '#4caf50', background: 'rgba(76,175,80,0.15)' }}>NOT OUT</span>}
                </div>
                <span className="w-12 text-right font-display font-black text-white text-base tabular-nums">{p.runs}</span>
                <span className="w-12 text-right text-white/50 text-sm tabular-nums">{p.ballsFaced}</span>
                <span className="w-10 text-right text-[#00bcd4] text-sm font-bold tabular-nums">{p.fours}</span>
                <span className="w-10 text-right text-[#4caf50] text-sm font-bold tabular-nums">{p.sixes}</span>
              </div>
            );
          })}
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5" style={{ background: 'linear-gradient(135deg, #e91e63, #ff6f00)' }}>
          <span className="font-display text-white font-bold text-xs uppercase tracking-widest">{match.matchType}</span>
          <span className="text-white text-xs font-bold">EXTRAS: {extras}</span>
          <span className="text-white text-xs font-bold">{getOversString(inn.balls, match.ballsPerOver)} OV</span>
          <span className="font-display font-black text-white text-xl drop-shadow-lg">{inn.runs}/{inn.wickets}</span>
        </div>
      </div>
    );
  };

  // ============ BOWLING SUMMARY ============
  const BowlingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-white text-center p-8">Innings not available</p>;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const bltColor = inn.bowlingTeamIndex === 0 ? t1Color : t2Color;
    const bowlers = blt.players.filter(p => p.bowlingBalls > 0);
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div className="relative" style={{ background: `linear-gradient(135deg, ${bltColor}dd, ${bltColor}88)` }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0L40 20L20 40L0 20Z' fill='white' fill-opacity='0.1'/%3E%3C/svg%3E")`, backgroundSize: '30px 30px' }} />
          <div className="flex items-center gap-3 px-5 py-3 relative z-10">
            <TeamFlag team={blt} size={32} />
            <span className="font-display text-lg md:text-xl font-black text-white uppercase tracking-wider drop-shadow-lg">{blt.name} - BOWLING</span>
          </div>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="px-5 py-2 text-[11px] text-white/50 font-bold flex tracking-wider" style={{ background: 'linear-gradient(180deg, #1e1660 0%, #150f50 100%)' }}>
          <span className="flex-1">BOWLER</span><span className="w-14 text-right">O</span><span className="w-14 text-right">R</span><span className="w-14 text-right">W</span><span className="w-16 text-right">ECON</span>
        </div>
        <div style={{ background: 'linear-gradient(180deg, #150f50 0%, #0d0a38 100%)' }}>
          {bowlers.map((p, idx) => (
            <div key={p.id} className={`flex items-center px-5 py-2 border-b border-white/5 ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
              <span className="font-display font-bold text-sm text-white flex-1 uppercase tracking-wide">{p.name}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{p.bowlingRuns}</span>
              <span className="w-14 text-right font-bold text-sm tabular-nums" style={{ color: p.bowlingWickets > 0 ? '#e91e63' : '#e91e6388' }}>{p.bowlingWickets}</span>
              <span className="w-16 text-right text-white/50 text-sm tabular-nums">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
            </div>
          ))}
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ FOW ============
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
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
        <div className="relative px-5 py-3" style={{ background: 'linear-gradient(135deg, #e91e63dd, #e91e6388)' }}>
          <span className="font-display text-lg md:text-xl font-black text-white tracking-wider drop-shadow-lg">FALL OF WICKETS</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div style={{ background: 'linear-gradient(180deg, #150f50 0%, #0d0a38 100%)' }}>
          {fowList.map((f: any, i: number) => (
            <div key={i} className={`flex items-center px-5 py-2.5 border-b border-white/5 text-white ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
              <span className="w-10 text-sm font-black tabular-nums" style={{ color: '#e91e63' }}>{i + 1}.</span>
              <span className="flex-1 font-display font-bold uppercase text-sm tracking-wide">{f.name}</span>
              <span className="font-display font-black text-base tabular-nums">{f.score}</span>
              <span className="text-white/40 text-xs ml-3 tabular-nums">({f.overs})</span>
            </div>
          ))}
          {fowList.length === 0 && <p className="text-center text-white/30 py-6 text-sm font-display tracking-wider">NO WICKETS YET</p>}
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ PARTNERSHIP ============
  const Partnership = () => {
    if (!striker || !nonStriker) return null;
    const totalPartnership = striker.runs + nonStriker.runs;
    const strikerPct = totalPartnership > 0 ? (striker.runs / totalPartnership) * 100 : 50;
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
        <div className="relative px-5 py-3" style={{ background: 'linear-gradient(135deg, #4caf50dd, #2e7d3288)' }}>
          <span className="font-display text-lg md:text-xl font-black text-white tracking-wider drop-shadow-lg">CURRENT PARTNERSHIP</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="py-6 px-6" style={{ background: 'linear-gradient(180deg, #150f50 0%, #0d0a38 100%)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-center flex-1">
              <p className="font-display font-bold text-base md:text-lg text-white uppercase tracking-wider">{striker.name}</p>
              <p className="text-4xl md:text-5xl font-black font-display mt-1" style={{ color: '#4caf50' }}>{striker.runs}</p>
              <p className="text-white/40 text-xs mt-1">({striker.ballsFaced} balls)</p>
            </div>
            <div className="text-center px-6">
              <p className="text-amber-400 text-[10px] font-display font-bold tracking-[0.3em] uppercase">PARTNERSHIP</p>
              <p className="font-display text-5xl md:text-6xl font-black text-white mt-1 drop-shadow-lg">{totalPartnership}</p>
            </div>
            <div className="text-center flex-1">
              <p className="font-display font-bold text-base md:text-lg text-white uppercase tracking-wider">{nonStriker.name}</p>
              <p className="text-4xl md:text-5xl font-black font-display mt-1" style={{ color: '#4caf50' }}>{nonStriker.runs}</p>
              <p className="text-white/40 text-xs mt-1">({nonStriker.ballsFaced} balls)</p>
            </div>
          </div>
          {/* Contribution bar */}
          <div className="w-full h-2 rounded-full overflow-hidden bg-white/10 mt-2">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${strikerPct}%`, background: 'linear-gradient(90deg, #e91e63, #ff6f00)' }} />
          </div>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ TEAMS ============
  const TeamsPlayers = () => (
    <div className="w-[90vw] max-w-[800px] mx-auto grid grid-cols-2 gap-0 overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
      {[match.team1, match.team2].map((team, ti) => (
        <div key={ti} className={ti === 0 ? 'border-r border-white/10' : ''}>
          <div className="relative px-4 py-3 text-center font-display font-black text-white uppercase text-sm md:text-base flex items-center justify-center gap-2 tracking-wider" style={{ background: `linear-gradient(135deg, ${ti === 0 ? t1Color : t2Color}dd, ${ti === 0 ? t1Color : t2Color}88)` }}>
            <TeamFlag team={team} size={24} />{team.name}
          </div>
          <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #f5c842, #c17a1a)' }} />
          <div style={{ background: 'linear-gradient(180deg, #150f50 0%, #0d0a38 100%)' }}>
            {team.players.map((p, i) => (
              <div key={p.id} className={`px-4 py-2 text-white text-sm border-b border-white/5 flex items-center gap-2 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                <span className="text-white/30 text-xs w-6 tabular-nums font-bold">{i + 1}.</span>
                <span className="font-display uppercase text-sm tracking-wide">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // ============ SUMMARY ============
  const MatchSummary = () => (
    <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
      <div className="relative px-5 py-3" style={{ background: 'linear-gradient(135deg, #ff6f00dd, #e8a83288)' }}>
        <span className="font-display text-lg md:text-xl font-black text-white tracking-wider drop-shadow-lg">MATCH SUMMARY</span>
      </div>
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      <div className="space-y-3 text-white text-sm md:text-base px-6 py-5" style={{ background: 'linear-gradient(180deg, #150f50 0%, #0d0a38 100%)' }}>
        <p><span className="text-white/40">Toss:</span> <span className="font-display font-bold">{match.tossWonBy === 0 ? match.team1.name : match.team2.name}</span> won, opted to <span className="font-bold">{match.optedTo}</span></p>
        {match.innings.map((inn, idx) => {
          const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
          return <p key={idx}><span className="text-white/40">{bt.name}:</span> <span className="font-display font-bold text-lg">{inn.runs}/{inn.wickets}</span> <span className="text-white/50">({getOversString(inn.balls, match.ballsPerOver)} ov)</span></p>;
        })}
        {match.winner && <p className="text-amber-300 font-display font-black text-2xl mt-4 drop-shadow-lg">{match.winner} won by {match.winMargin}</p>}
      </div>
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
    </div>
  );

  // ============ RENDER ============
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
      <div className={isBottomAligned ? 'w-full' : 'w-full px-2 md:px-4'}>
        {renderContent()}
        {isBottomAligned && <BoundaryAlert snapshot={snapshot} variant="dark" />}
        {isBottomAligned && <ScoreboardTicker snapshot={snapshot} match={match} variant="dark" />}
      </div>
    </div>
  );
};

const Scoreboard = () => (
  <ScoreboardErrorBoundary>
    <ScoreboardInner />
  </ScoreboardErrorBoundary>
);

export default Scoreboard;
