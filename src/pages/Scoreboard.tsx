import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import ScoreboardTicker from '@/components/ScoreboardTicker';
import BoundaryAlert from '@/components/BoundaryAlert';
import BroadcastOverlayBanner from '@/components/BroadcastOverlayBanner';
import MatchSummaryCard from '@/components/MatchSummaryCard';
import UpcomingMatchDisplay from '@/components/UpcomingMatchDisplay';
import DrsTimer from '@/components/DrsTimer';
import DismissalCard from '@/components/DismissalCard';
import TourStatsDisplay from '@/components/TourStatsDisplay';
import PlayerStatsCard from '@/components/PlayerStatsCard';
import { useParams } from 'react-router-dom';
import { Match, BallEvent, getOversString, getRunRate } from '@/types/cricket';
import { getMatch } from '@/lib/store';
import { getDisplayState, DisplayState, AnimationOverlay, DisplayMode } from '@/lib/displaySync';
import { supabase } from '@/integrations/supabase/client';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';
import VSBannerDisplay, { vsThemeDark } from '@/components/VSBannerDisplay';
import { BallDot, EmptyBallDot } from '@/components/BallDot';

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
          // DO NOT restore overlay on initial load - overlays are transient events only.
          // Only set display mode from snapshot, never re-trigger animation banners on page load.
          if (snap.displayMode) {
            setDisplay(prev => ({ ...prev, mode: snap.displayMode as DisplayMode, overlay: 'none' }));
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
      // Replace snapshot entirely - this is the SOLE source of truth for score bar
      setSnapshot(snap);
      // Also reload full match data so BattingSummary/BowlingSummary have fresh player stats
      loadMatch();
      // INSTANT PATCH: Update match state immediately from snapshot data so batting summary
      // shows correct runs/balls without waiting for the full DB reload (3s debounce)
      setMatch(prev => {
        if (!prev || snap.inIdx < 0 || !prev.innings[snap.inIdx]) return prev;
        const updated = JSON.parse(JSON.stringify(prev)) as typeof prev;
        const inn = updated.innings[snap.inIdx];
        // Update innings score
        inn.runs = snap.inn.runs;
        inn.wickets = snap.inn.wickets;
        inn.balls = snap.inn.balls;
        // Update striker stats from snapshot
        const bt = inn.battingTeamIndex === 0 ? updated.team1 : updated.team2;
        if (snap.s) {
          const striker = bt.players.find(p => p.id === inn.currentStrikerId);
          if (striker) { striker.runs = snap.s.runs; striker.ballsFaced = snap.s.bf; }
        }
        if (snap.ns) {
          const nonStriker = bt.players.find(p => p.id === inn.currentNonStrikerId);
          if (nonStriker) { nonStriker.runs = snap.ns.runs; nonStriker.ballsFaced = snap.ns.bf; }
        }
        return updated;
      });
      // Apply display mode from snapshot for instant sync
      if (snap.displayMode) {
        setDisplay(prev => ({
          ...prev,
          mode: snap.displayMode as DisplayMode,
          // Only set overlay if explicitly provided (including 'none' to clear)
          overlay: snap.overlay !== undefined ? snap.overlay : prev.overlay,
        }));
      } else if (snap.overlay !== undefined) {
        // Overlay update only (no displayMode change)
        setDisplay(prev => ({ ...prev, overlay: snap.overlay! }));
      }
      if (snap.displayCustomText !== undefined) {
        setDisplay(prev => ({ ...prev, customText: snap.displayCustomText }));
      }
      if (snap.displayMomPlayer !== undefined) {
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

    // BACKUP: postgres_changes on matches table (for display_state + match data changes)
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
          // Always update match_data from matches table so summaries stay fresh
          if (row?.match_data) {
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

  // Ball circle components — now use shared BallDot
  const BallCircle = ({ event }: { event: typeof currentOverBalls[0] }) => (
    <BallDot event={event} size="md" theme="dark" />
  );
  const EmptyBall = () => <EmptyBallDot size="md" theme="dark" />;

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

  // ============ BATTING SUMMARY ============
  const BattingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-white/40 text-center p-8">Innings not available</p>;
    const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
    const btColor = inn.battingTeamIndex === 0 ? t1Color : t2Color;
    const extras = inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes;
    const battedPlayers = bt.players.filter(p => p.ballsFaced > 0 || p.isOut || p.id === inn.currentStrikerId || p.id === inn.currentNonStrikerId);
    const allSlots: (typeof battedPlayers[0] | null)[] = [...battedPlayers, ...Array.from({ length: Math.max(0, 11 - battedPlayers.length) }, () => null)];
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ background: `linear-gradient(135deg, ${btColor}dd, ${btColor}88)` }}>
          <div className="flex items-center gap-3">
            {bt.logo && <img src={bt.logo} alt={bt.name} className="w-8 h-8 object-contain" />}
            <span className="font-display text-lg font-black text-white uppercase tracking-wider">{bt.name} — BATTING</span>
          </div>
          <span className="font-display text-xl font-black text-white px-3 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.3)' }}>{inn.runs}/{inn.wickets}</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="px-5 py-1.5 text-[11px] text-white/40 font-bold flex tracking-wider" style={{ background: 'linear-gradient(180deg, #150f50, #0d0a38)' }}>
          <span className="w-6 text-white/20 text-[10px]">#</span><span className="flex-1">BATSMAN</span><span className="w-36 text-center">DISMISSAL</span><span className="w-10 text-right">R</span><span className="w-10 text-right">B</span>
        </div>
        <div style={{ background: 'linear-gradient(180deg, #150f50, #0d0a38)' }}>
          {allSlots.map((p, idx) => {
            if (!p) return (
              <div key={`e-${idx}`} className="flex items-center px-5 border-b border-white/5" style={{ height: '32px' }}>
                <span className="w-6 text-white/10 text-[11px]">{idx + 1}</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
              </div>
            );
            const isStriker = p.id === inn.currentStrikerId;
            const isNonStriker = p.id === inn.currentNonStrikerId;
            const isNotOut = !p.isOut && (isStriker || isNonStriker || (inn.isComplete && !p.isOut && p.ballsFaced > 0));
            const hasBatted = p.ballsFaced > 0 || p.isOut;
            return (
              <div key={p.id} className="flex items-center px-5 border-b border-white/5" style={{ height: '34px', background: (isStriker || isNonStriker) ? 'rgba(233,30,99,0.1)' : idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <span className="w-6 text-white/20 text-[11px] tabular-nums">{idx + 1}</span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {isStriker && <span style={{ color: '#e91e63', fontSize: '10px', fontWeight: 900 }}>▶</span>}
                  <span className={`font-display font-bold text-[13px] uppercase tracking-wide truncate ${hasBatted ? 'text-white' : 'text-white/25'}`}>{p.name}</span>
                  {isNotOut && <span className="text-[10px] font-black px-1 rounded flex-shrink-0" style={{ color: '#66bb6a', background: 'rgba(102,187,106,0.15)' }}>*</span>}
                </div>
                <div className="w-36 text-center">{hasBatted && p.isOut && <span className="text-white/30 text-[10px] italic truncate block">{p.dismissalType}{p.dismissedBy ? ` b ${p.dismissedBy}` : ''}</span>}</div>
                <span className={`w-10 text-right font-display font-black text-base tabular-nums ${hasBatted ? 'text-white' : 'text-white/15'}`}>{hasBatted ? p.runs : ''}</span>
                <span className={`w-10 text-right text-sm tabular-nums ${hasBatted ? 'text-white/50' : 'text-white/15'}`}>{hasBatted ? p.ballsFaced : ''}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-5 py-2" style={{ background: `linear-gradient(135deg, ${btColor}cc, ${btColor}88)` }}>
          <span className="font-display text-white font-bold text-xs uppercase tracking-widest">{match.matchType}</span>
          <span className="text-white text-xs font-bold">EXTRAS: {extras}</span>
          <span className="font-display font-black text-white text-lg">{inn.runs}/{inn.wickets}</span>
        </div>
      </div>
    );
  };

  // ============ BOWLING SUMMARY ============
  const BowlingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-white/40 text-center p-8">Innings not available</p>;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const bltColor = inn.bowlingTeamIndex === 0 ? t1Color : t2Color;
    const bowlers = blt.players.filter(p => p.bowlingBalls > 0);
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-lg" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center gap-3 px-5 py-3" style={{ background: `linear-gradient(135deg, ${bltColor}dd, ${bltColor}88)` }}>
          {blt.logo && <img src={blt.logo} alt={blt.name} className="w-8 h-8 object-contain" />}
          <span className="font-display text-lg font-black text-white uppercase tracking-wider">{blt.name} - BOWLING</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="px-5 py-2 text-[11px] text-white/40 font-bold flex tracking-wider" style={{ background: 'linear-gradient(180deg, #150f50, #0d0a38)' }}>
          <span className="flex-1">BOWLER</span><span className="w-14 text-right">O</span><span className="w-14 text-right">R</span><span className="w-14 text-right">W</span><span className="w-16 text-right">ECON</span>
        </div>
        <div style={{ background: 'linear-gradient(180deg, #150f50, #0d0a38)' }}>
          {bowlers.map((p, idx) => (
            <div key={p.id} className={`flex items-center px-5 py-2 border-b border-white/5 ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
              <span className="font-display font-bold text-sm text-white flex-1 uppercase tracking-wide">{p.name}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{p.bowlingRuns}</span>
              <span className="w-14 text-right font-bold text-sm tabular-nums" style={{ color: p.bowlingWickets > 0 ? '#e91e63' : '#e91e6355' }}>{p.bowlingWickets}</span>
              <span className="w-16 text-right text-white/50 text-sm tabular-nums">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
            </div>
          ))}
          {bowlers.length === 0 && <p className="text-center text-white/30 py-6 text-sm font-display tracking-wider">NO BOWLING DATA YET</p>}
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ VS BANNER ============
  const VSBanner = () => (
    <VSBannerDisplay
      team1={{ name: s ? s.t1.name : match.team1.name, color: t1Color, logo: match.team1.logo }}
      team2={{ name: s ? s.t2.name : match.team2.name, color: t2Color, logo: match.team2.logo }}
      tournamentName={s?.tournamentName}
      matchType={s?.matchType || match.matchType}
      matchNo={s?.matchNo || match.matchNo}
      tossWonBy={s?.tossWonBy ?? match.tossWonBy ?? 0}
      optedTo={s?.optedTo || match.optedTo || 'bat'}
      animIn={vsAnimIn}
      theme={vsThemeDark}
    />
  );

  // ============ TARGET BANNER ============
  const TargetBanner = () => {
    if (!target || !currentInnings || !battingTeam) return <VSBanner />;
    const need = Math.max(0, target - currentInnings.runs);
    const remainBalls = match.overs * match.ballsPerOver - currentInnings.balls;
    const rrr = remainBalls > 0 ? ((need / remainBalls) * (s?.bpo || match.ballsPerOver)).toFixed(2) : '0.00';
    const batTeamName = s ? (s.inn.batIdx === 0 ? s.t1.name : s.t2.name) : battingTeam.name;
    return (
      <div className="w-full">
        <div className="h-[2px] w-full bg-white/80" />
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="relative flex items-center justify-center" style={{ height: '62px', background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
          <div className="text-center px-4">
            <p className="text-white/60 text-[9px] font-display tracking-widest uppercase">Target</p>
            <p className="font-display font-black text-white text-xl md:text-2xl">{target} runs</p>
          </div>
          <div className="mx-6 w-px self-stretch bg-white/20" />
          <div className="text-center">
            <p className="text-white/60 text-[9px] font-display tracking-widest uppercase">Need</p>
            <p className="font-display font-bold text-amber-300 text-base md:text-xl">{need} off {remainBalls}b</p>
          </div>
          <div className="mx-6 w-px self-stretch bg-white/20" />
          <div className="text-center">
            <p className="text-white/60 text-[9px] font-display tracking-widest uppercase">RRR</p>
            <p className="font-display font-bold text-amber-300 text-base md:text-xl">{rrr}</p>
          </div>
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
  const MatchSummary = () => <MatchSummaryCard match={match} theme="dark" />;

  // ============ RENDER ============
  const isBottomAligned = display.mode === 'default' || display.mode === 'score';

  const renderContent = () => {
    const tourId = snapshot?.tournamentId || match?.tournamentId;
    switch (display.mode) {
      case 'vs': return <VSBanner />;
      case 'target': return <TargetBanner />;
      case '1bat': return <BattingSummary inningsIdx={0} />;
      case '2bat': return <BattingSummary inningsIdx={1} />;
      case '1ball': return <BowlingSummary inningsIdx={0} />;
      case '2ball': return <BowlingSummary inningsIdx={1} />;
      case 'fow': return <FallOfWickets />;
      case 'summary': return <MatchSummary />;
      case 'upcoming': return <UpcomingMatchDisplay snapshot={snapshot} variant="dark" />;
      case 'tour_points' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_points" variant="forest" /> : null;
      case 'tour_points_tied' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_points_tied" variant="forest" /> : null;
      case 'tour_batters' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_batters" variant="forest" /> : null;
      case 'tour_bowlers' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_bowlers" variant="forest" /> : null;
      case 'tour_boundaries' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_boundaries" variant="forest" /> : null;
      case 'tour_series' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_series" variant="forest" /> : null;
      case 'player_bat1' as any:
      case 'player_bat2' as any:
      case 'player_bowl' as any:
        return <><PlayerStatsCard snapshot={snapshot} /><DefaultScoreBar /></>;
      case 'score': case 'default': default: return <DefaultScoreBar />;
    }
  };

  return (
    <div className={`w-full min-h-screen bg-transparent flex justify-center p-0 ${isBottomAligned ? 'items-end' : 'items-center'}`}>
      <div className={isBottomAligned ? 'w-full relative' : 'w-full px-2 md:px-4'}>
        {isBottomAligned && <DismissalCard snapshot={snapshot} />}
        {renderContent()}
        {isBottomAligned && <ScoreboardTicker snapshot={snapshot} match={match} variant="dark" />}
        {isBottomAligned && <BoundaryAlert snapshot={snapshot} variant="dark" barHeight={62} />}
        {/* Full-width broadcast overlay banner for FOUR / SIX / WICKET */}
        <BroadcastOverlayBanner
          overlay={display.overlay}
          onHide={() => setDisplay(prev => ({ ...prev, overlay: 'none' }))}
        />
        {/* DRS Timer — bottom-right overlay, counts 14→0 then auto-hides */}
        <DrsTimer drsTimerStart={display.drsTimerStart} />
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
