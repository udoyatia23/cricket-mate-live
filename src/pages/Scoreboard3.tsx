import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import ScoreboardTicker from '@/components/ScoreboardTicker';
import BoundaryAlert from '@/components/BoundaryAlert';
import BroadcastOverlayBanner from '@/components/BroadcastOverlayBanner';
import MatchSummaryCard from '@/components/MatchSummaryCard';
import UpcomingMatchDisplay from '@/components/UpcomingMatchDisplay';
import { useParams } from 'react-router-dom';
import { Match, BallEvent, getOversString, getRunRate } from '@/types/cricket';
import { getMatch } from '@/lib/store';
import { getDisplayState, DisplayState, AnimationOverlay, DisplayMode } from '@/lib/displaySync';
import { supabase } from '@/integrations/supabase/client';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';
import VSBannerDisplay, { vsPurple } from '@/components/VSBannerDisplay';

// ErrorBoundary
class Scoreboard3ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Scoreboard3] ErrorBoundary caught:', error, info);
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

const Scoreboard3Inner = () => {
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

  // === REALTIME SYNC ===
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    const loadMatch = async () => {
      try {
        const m = await getMatch(id);
        if (mounted && m) setMatch(m);
      } catch (e) { console.error('[Scoreboard3] Failed to load match:', e); }
    };

    const loadSnapshot = async () => {
      try {
        const { data } = await (supabase.from('score_live') as any).select('snapshot').eq('match_id', id).maybeSingle();
        if (data?.snapshot && mounted) {
          const snap = data.snapshot as ScoreboardSnapshot;
          setSnapshot(snap);
          // DO NOT restore overlay on initial load - overlays are transient animation events only.
          // Only restore display mode, always clear overlay to 'none' on page load.
          if (snap.displayMode) {
            setDisplay(prev => ({ ...prev, mode: snap.displayMode as DisplayMode, overlay: 'none' }));
          }
          lastPayloadTs.current = snap.ts || Date.now();
        }
      } catch (e) { console.error('[Scoreboard3] score_live fetch failed:', e); }
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
      // INSTANT PATCH: Update match state immediately from snapshot data
      setMatch(prev => {
        if (!prev || snap.inIdx < 0 || !prev.innings[snap.inIdx]) return prev;
        const updated = JSON.parse(JSON.stringify(prev)) as typeof prev;
        const inn = updated.innings[snap.inIdx];
        inn.runs = snap.inn.runs;
        inn.wickets = snap.inn.wickets;
        inn.balls = snap.inn.balls;
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
          overlay: snap.overlay !== undefined ? snap.overlay : prev.overlay,
        }));
      } else if (snap.overlay !== undefined) {
        setDisplay(prev => ({ ...prev, overlay: snap.overlay! }));
      }
      if (snap.displayCustomText !== undefined) {
        setDisplay(prev => ({ ...prev, customText: snap.displayCustomText }));
      }
      if (snap.displayMomPlayer !== undefined) {
        setDisplay(prev => ({ ...prev, momPlayer: snap.displayMomPlayer }));
      }
    };

    const scoreLiveCh = supabase.channel(`score-live3-${id}-${Date.now()}`)
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

    const pgCh = supabase.channel(`pg3-${id}-${Date.now()}`)
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

  // === LOADING ===
  if (!match && !snapshot) {
    return (
      <div className="w-full min-h-screen bg-transparent flex items-end justify-center p-0">
        <div className="w-full">
          <div className="relative flex items-center justify-center" style={{ height: '72px', background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}>
            <span className="text-white/40 text-sm font-mono animate-pulse">{connectionStatus === 'SUBSCRIBED' ? 'Waiting for controller...' : 'Connecting...'}</span>
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
    const c: Record<AnimationOverlay, { text: string; color: string; glow: string }> = {
      none: { text: '', color: '', glow: '' },
      four: { text: 'FOUR!', color: '#2196f3', glow: '0 0 30px rgba(33,150,243,0.6)' },
      six: { text: 'MAXIMUM SIX!', color: '#4caf50', glow: '0 0 30px rgba(76,175,80,0.6)' },
      wicket: { text: 'WICKET!', color: '#e91e63', glow: '0 0 30px rgba(233,30,99,0.6)' },
      free_hit: { text: 'FREE HIT', color: '#ff9800', glow: '0 0 30px rgba(255,152,0,0.6)' },
      hat_trick: { text: 'HAT-TRICK!', color: '#f44336', glow: '0 0 30px rgba(244,67,54,0.6)' },
      out: { text: 'OUT!', color: '#d32f2f', glow: '0 0 30px rgba(211,47,47,0.6)' },
      not_out: { text: 'NOT OUT!', color: '#388e3c', glow: '0 0 30px rgba(56,142,60,0.6)' },
    };
    return c[display.overlay];
  };
  const overlayData = getOverlayData();

  // === TEAM LOGO ===
  const TeamLogo = ({ team, size = 52 }: { team: typeof match.team1; size?: number }) => (
    <div className="flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: size + 12, height: '100%' }}>
      {team.logo ? (
        <img src={team.logo} alt={team.name} className="object-contain drop-shadow-lg" style={{ width: size, height: size }} />
      ) : (
        <div className="font-display font-black text-white/90 drop-shadow-lg" style={{ fontSize: size * 0.38 }}>
          {team.name.slice(0, 3).toUpperCase()}
        </div>
      )}
    </div>
  );

  // === BALL CIRCLE ===
  const BallCircle = ({ event }: { event: BallEvent }) => {
    let bg = 'rgba(255,255,255,0.08)'; let border = 'rgba(255,255,255,0.25)'; let text = String(event.runs); let tc = '#fff';
    if (event.isWicket) { bg = '#e91e63'; border = '#e91e63'; text = 'W'; }
    else if (event.runs === 6) { bg = '#4caf50'; border = '#4caf50'; }
    else if (event.runs === 4) { bg = '#2196f3'; border = '#2196f3'; }
    else if (event.type === 'wide') { border = '#ffc107'; text = 'Wd'; tc = '#ffc107'; bg = 'rgba(255,193,7,0.1)'; }
    else if (event.type === 'noBall') { border = '#ffc107'; text = 'Nb'; tc = '#ffc107'; bg = 'rgba(255,193,7,0.1)'; }
    return (
      <div className="w-[22px] h-[22px] md:w-[26px] md:h-[26px] rounded-full flex items-center justify-center text-[9px] md:text-[10px] font-black flex-shrink-0 transition-all"
        style={{ backgroundColor: bg, border: `2px solid ${border}`, color: tc }}>
        {text}
      </div>
    );
  };

  const EmptyBall = () => (
    <div className="w-[22px] h-[22px] md:w-[26px] md:h-[26px] rounded-full border-2 flex items-center justify-center text-[9px] flex-shrink-0"
      style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.15)' }}>○</div>
  );

  // ===== IPL-STYLE PREMIUM SCORE BAR =====
  const DefaultScoreBar = () => {
    const need = target ? Math.max(0, target - displayRuns) : null;
    const remainBalls = (match.overs * match.ballsPerOver - displayBalls);
    const bpo = s?.bpo || match.ballsPerOver;
    const batTeamName = s ? (s.inn.batIdx === 0 ? s.t1.name : s.t2.name) : (battingTeam || match.team1).name;
    const bowlTeamName = s ? (s.inn.batIdx === 0 ? s.t2.name : s.t1.name) : (bowlingTeam || match.team2).name;
    const batColor = s ? (s.inn.batIdx === 0 ? t1Color : t2Color) : t1Color;
    const bowlColor = s ? (s.inn.batIdx === 0 ? t2Color : t1Color) : t2Color;

    return (
      <div className="w-full">
        {/* Main bar */}
        <div className="relative flex items-stretch" style={{ height: '76px' }}>
          {/* Dark base with glass effect */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #2a2a3e 0%, #1a1a2e 40%, #111122 100%)' }} />
          {/* Subtle light streak across middle */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 30%, rgba(255,255,255,0.03) 50%, transparent 70%)' }} />

          {/* LEFT: Batting team logo */}
          <div className="relative z-10 flex-shrink-0 flex items-center" style={{ background: `linear-gradient(135deg, ${batColor}dd, ${batColor}88)`, minWidth: '70px', clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 100%, 0 100%)' }}>
            <TeamLogo team={battingTeam || match.team1} size={46} />
          </div>

          {/* Team name + Score pill */}
          <div className="relative z-10 flex items-center gap-0">
            {/* Team name on dark bg */}
            <div className="flex flex-col justify-center px-3 md:px-4" style={{ background: 'linear-gradient(180deg, #333348 0%, #222238 100%)', clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 100%, 0 100%)' }}>
              <span className="font-display font-black text-white text-base md:text-lg uppercase tracking-wider leading-tight">{batTeamName.slice(0, 3).toUpperCase()}</span>
              <span className="text-white/40 text-[9px] font-display tracking-widest">v {bowlTeamName.slice(0, 3).toUpperCase()}</span>
            </div>

            {/* Score pill - vibrant purple gradient like IPL */}
            <div className="flex items-center" style={{ background: 'linear-gradient(135deg, #6a1b9a, #8e24aa, #ab47bc)', clipPath: 'polygon(8px 0, calc(100% - 8px) 0, 100% 100%, 0 100%)' }}>
              <div className="flex items-baseline gap-1 px-4 md:px-5 py-1">
                <span className="font-display font-black text-white text-2xl md:text-3xl tabular-nums leading-none">{displayRuns}-{displayWickets}</span>
              </div>
            </div>

            {/* Powerplay indicator + Overs */}
            <div className="flex flex-col items-center justify-center px-2 md:px-3">
              <span className="text-amber-400 text-[9px] font-display font-black tracking-wider">P</span>
              <span className="font-display font-bold text-white text-sm md:text-base tabular-nums">{getOversString(displayBalls, bpo)}</span>
            </div>
          </div>

          {/* Diagonal separator with shimmer */}
          <div className="relative z-10 w-[3px] flex-shrink-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(200,180,255,0.3), rgba(255,255,255,0.1))' }} />

          {/* CENTER: Batsmen info with purple accent */}
          <div className="relative z-10 flex flex-col justify-center flex-1 min-w-0" style={{ maxWidth: '280px' }}>
            <div className="px-3 md:px-4" style={{ background: 'linear-gradient(135deg, #6a1b9a, #7b1fa2)' }}>
              {strikerData && (
                <div className="flex items-center gap-1.5 py-0.5">
                  <span className="text-white text-[10px]">✦</span>
                  <span className="font-display font-bold text-white text-[12px] md:text-[13px] uppercase tracking-wide flex-1 truncate">{strikerData.name}</span>
                  <span className="font-display font-black text-white text-base md:text-lg tabular-nums">{strikerData.runs}</span>
                  <span className="text-white/50 text-[10px] md:text-[11px] tabular-nums ml-0.5">{strikerData.bf}</span>
                </div>
              )}
              {nonStrikerData && (
                <div className="flex items-center gap-1.5 py-0.5">
                  <span className="text-[10px] opacity-0">✦</span>
                  <span className="font-display text-white/70 text-[12px] md:text-[13px] uppercase tracking-wide flex-1 truncate">{nonStrikerData.name}</span>
                  <span className="font-display font-bold text-white/80 text-sm md:text-base tabular-nums">{nonStrikerData.runs}</span>
                  <span className="text-white/40 text-[10px] md:text-[11px] tabular-nums ml-0.5">{nonStrikerData.bf}</span>
                </div>
              )}
            </div>
          </div>

          {/* Separator */}
          <div className="relative z-10 w-[3px] flex-shrink-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(200,180,255,0.3), rgba(255,255,255,0.1))' }} />

          {/* RIGHT: Target info / Toss */}
          <div className="relative z-10 flex flex-col items-center justify-center px-3 md:px-4 flex-shrink-0" style={{ background: 'linear-gradient(180deg, #333348, #222238)' }}>
            {overlayData ? (
              <div className="px-4 py-1.5 rounded" style={{ backgroundColor: overlayData.color, boxShadow: overlayData.glow }}>
                <span className="font-display text-lg md:text-xl font-black text-white tracking-wider">{overlayData.text}</span>
              </div>
            ) : need !== null && need > 0 && remainBalls > 0 ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <span className="text-white/50 text-[9px] font-display font-bold tracking-widest">TO WIN</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-0.5">
                  <div className="text-center">
                    <span className="text-white/50 text-[9px] font-display tracking-wider">RUNS</span>
                    <p className="font-display font-black text-amber-400 text-xl md:text-2xl tabular-nums leading-none">{need}</p>
                  </div>
                  <div className="text-center">
                    <span className="text-white/50 text-[9px] font-display tracking-wider">BALLS</span>
                    <p className="font-display font-black text-amber-400 text-xl md:text-2xl tabular-nums leading-none">{remainBalls}</p>
                  </div>
                </div>
              </>
            ) : (s?.status || match.status) === 'finished' && (s?.winner || match.winner) ? (
              <span className="font-display font-black text-amber-400 text-sm md:text-base uppercase tracking-wider">{s?.winner || match.winner} WON</span>
            ) : null}
          </div>

          {/* Separator */}
          <div className="relative z-10 w-[3px] flex-shrink-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(200,180,255,0.3), rgba(255,255,255,0.1))' }} />

          {/* FAR RIGHT: Bowler info + over balls (gold/amber accent) */}
          <div className="relative z-10 flex flex-col justify-center px-3 md:px-4 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #b8860b, #daa520)', minWidth: '140px', clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%)' }}>
            {bowlerData && (
              <div className="flex items-center gap-2 pl-3">
                <span className="font-display font-black text-[#1a1a2e] text-[12px] md:text-[13px] uppercase tracking-wide truncate">{bowlerData.name}</span>
                <span className="font-display font-black text-[#1a1a2e]/70 text-sm tabular-nums">{getOversString(bowlerData.balls, bpo)}-{bowlerData.r}-{bowlerData.w}</span>
              </div>
            )}
            <div className="flex gap-1 mt-1 pl-3">
              {currentOverBalls.slice(-bpo).map((e, i) => <BallCircle key={i} event={e} />)}
              {Array.from({ length: Math.max(0, bpo - currentOverBalls.length) }).map((_, i) => <EmptyBall key={`e-${i}`} />)}
            </div>
          </div>

          {/* RIGHT: Bowling team logo */}
          <div className="relative z-10 flex-shrink-0 flex items-center" style={{ background: `linear-gradient(135deg, ${bowlColor}88, ${bowlColor}dd)`, minWidth: '70px', clipPath: 'polygon(12px 0, 100% 0, 100% 100%, 0 100%)' }}>
            <TeamLogo team={bowlingTeam || match.team2} size={46} />
          </div>
        </div>

        {/* Bottom accent line - gradient shimmer */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #6a1b9a, #ab47bc, #e040fb, #ab47bc, #6a1b9a, transparent)' }} />
      </div>
    );
  };

  // ===== VS BANNER =====
  const VSBanner = () => (
    <VSBannerDisplay
      team1={{ name: s ? s.t1.name : match.team1.name, color: s?.t1.color || match.team1.color || '#6a1b9a', logo: match.team1.logo }}
      team2={{ name: s ? s.t2.name : match.team2.name, color: s?.t2.color || match.team2.color || '#1a237e', logo: match.team2.logo }}
      tournamentName={s?.tournamentName}
      matchType={s?.matchType || match.matchType}
      matchNo={s?.matchNo || match.matchNo}
      tossWonBy={s?.tossWonBy ?? match.tossWonBy ?? 0}
      optedTo={s?.optedTo || match.optedTo || 'bat'}
      animIn={vsAnimIn}
      theme={vsPurple}
    />
  );

  // ===== TARGET BANNER =====
  const TargetBanner = () => {
    if (!target || !currentInnings || !battingTeam) return <VSBanner />;
    const need = Math.max(0, target - currentInnings.runs);
    const remainBalls = match.overs * match.ballsPerOver - currentInnings.balls;
    const rrr = remainBalls > 0 ? ((need / remainBalls) * match.ballsPerOver).toFixed(2) : '0.00';
    return (
      <div className="w-full">
        <div className="relative flex items-stretch h-16" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #111122 100%)' }}>
          <div className="flex-1 flex items-center justify-center gap-4 md:gap-6 px-4">
            <span className="font-display text-lg md:text-xl font-black text-white uppercase">{battingTeam.name}</span>
            <div className="text-center px-5 py-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #6a1b9a, #ab47bc)', boxShadow: '0 0 15px rgba(171,71,188,0.3)' }}>
              <p className="font-display text-white font-bold text-xs md:text-sm uppercase">NEED <span className="text-amber-300 text-base font-black">{need}</span> FROM <span className="text-amber-300 text-base font-black">{remainBalls}</span> BALLS</p>
              <p className="text-white/50 text-[9px] font-display">RRR: <span className="text-amber-300">{rrr}</span></p>
            </div>
            <span className="font-display text-lg md:text-xl font-black text-white uppercase">{bowlingTeam?.name}</span>
          </div>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #6a1b9a, #e040fb, #6a1b9a, transparent)' }} />
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
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.5), 0 0 20px rgba(106,27,154,0.2)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: `linear-gradient(135deg, ${btColor}dd, ${btColor}88)` }}>
          <div className="flex items-center gap-3">
            {bt.logo && <img src={bt.logo} alt={bt.name} className="w-8 h-8 object-contain drop-shadow-lg" />}
            <span className="font-display text-lg md:text-xl font-black text-white uppercase tracking-wider drop-shadow">{bt.name} — BATTING SUMMARY</span>
          </div>
          <span className="font-display text-xl md:text-2xl font-black text-white px-3 py-0.5 rounded-md" style={{ background: 'rgba(0,0,0,0.3)' }}>{inn.runs}-{inn.wickets}</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #6a1b9a, #e040fb, #6a1b9a, transparent)' }} />
        {/* Column headers */}
        <div className="px-5 py-1.5 text-[11px] text-white/40 font-bold flex tracking-wider" style={{ background: '#1a1a2e' }}>
          <span className="w-6 text-white/20 text-[10px]">#</span>
          <span className="flex-1">BATSMAN</span>
          <span className="w-36 text-center text-[10px]">DISMISSAL</span>
          <span className="w-10 text-right">R</span>
          <span className="w-10 text-right">B</span>
        </div>
        {/* All 11 player rows */}
        <div style={{ background: 'linear-gradient(180deg, #16213e, #111122)' }}>
          {allSlots.map((p, idx) => {
            if (!p) {
              return (
                <div key={`empty-${idx}`} className="flex items-center px-5 border-b border-white/5" style={{ height: '32px', background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                  <span className="w-6 text-white/10 text-[11px] font-bold tabular-nums">{idx + 1}</span>
                  <div className="flex-1 h-[1px] rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
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
                className="flex items-center px-5 border-b border-white/5"
                style={{
                  height: '34px',
                  background: isCurrentlyBatting ? 'rgba(171,71,188,0.12)' : idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                }}>
                <span className="w-6 text-white/20 text-[11px] font-bold tabular-nums">{idx + 1}</span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {isStriker && <span style={{ color: '#e040fb', fontSize: '10px', fontWeight: 900, flexShrink: 0 }}>▶</span>}
                  <span className={`font-display font-bold text-[13px] uppercase tracking-wide truncate ${hasBatted ? 'text-white' : 'text-white/25'}`}>
                    {p.name}
                  </span>
                  {isNotOut && (
                    <span className="text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: '#66bb6a', background: 'rgba(102,187,106,0.15)' }}>NOT OUT</span>
                  )}
                </div>
                {/* Dismissal */}
                <div className="w-36 text-center">
                  {hasBatted && p.isOut && (
                    <span className="text-white/30 text-[10px] italic truncate block">{p.dismissalType}{p.dismissedBy ? ` b ${p.dismissedBy}` : ''}</span>
                  )}
                </div>
                {/* Stats */}
                <span className={`w-10 text-right font-display font-black text-base tabular-nums ${hasBatted ? 'text-white' : 'text-white/15'}`}>{hasBatted ? p.runs : ''}</span>
                <span className={`w-10 text-right text-sm tabular-nums ${hasBatted ? 'text-white/50' : 'text-white/15'}`}>{hasBatted ? p.ballsFaced : ''}</span>
              </div>
            );
          })}
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5" style={{ background: 'linear-gradient(135deg, #6a1b9a, #ab47bc)' }}>
          <span className="font-display text-white font-bold text-xs uppercase tracking-widest">{match.matchType}</span>
          <span className="text-white/80 text-xs font-bold">EXTRAS: {extras}</span>
          <span className="text-white/80 text-xs font-bold">{getOversString(inn.balls, match.ballsPerOver)} OV</span>
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
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.5), 0 0 20px rgba(106,27,154,0.2)' }}>
        <div className="flex items-center gap-3 px-5 py-3" style={{ background: `linear-gradient(135deg, ${bltColor}dd, ${bltColor}88)` }}>
          {blt.logo && <img src={blt.logo} alt={blt.name} className="w-8 h-8 object-contain drop-shadow-lg" />}
          <span className="font-display text-lg md:text-xl font-black text-white uppercase tracking-wider">{blt.name} - BOWLING</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #6a1b9a, #e040fb, #6a1b9a, transparent)' }} />
        <div className="px-5 py-2 text-[11px] text-white/40 font-bold flex tracking-wider" style={{ background: '#1a1a2e' }}>
          <span className="flex-1">BOWLER</span><span className="w-14 text-right">O</span><span className="w-14 text-right">R</span><span className="w-14 text-right">W</span><span className="w-16 text-right">ECON</span>
        </div>
        <div style={{ background: 'linear-gradient(180deg, #16213e, #111122)' }}>
          {bowlers.map((p, idx) => (
            <div key={p.id} className={`flex items-center px-5 py-2 border-b border-white/5 ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
              <span className="font-display font-bold text-sm text-white flex-1 uppercase tracking-wide">{p.name}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{p.bowlingRuns}</span>
              <span className="w-14 text-right font-bold text-sm tabular-nums" style={{ color: p.bowlingWickets > 0 ? '#e040fb' : '#e040fb55' }}>{p.bowlingWickets}</span>
              <span className="w-16 text-right text-white/50 text-sm tabular-nums">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
            </div>
          ))}
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #6a1b9a, #e040fb, #6a1b9a, transparent)' }} />
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
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.5), 0 0 20px rgba(233,30,99,0.2)' }}>
        <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #e91e63dd, #c2185b88)' }}>
          <span className="font-display text-lg md:text-xl font-black text-white tracking-wider">FALL OF WICKETS</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #e91e63, #ff80ab, #e91e63, transparent)' }} />
        <div style={{ background: 'linear-gradient(180deg, #16213e, #111122)' }}>
          {fowList.map((f: any, i: number) => (
            <div key={i} className={`flex items-center px-5 py-2.5 border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
              <span className="w-10 text-sm font-black tabular-nums text-[#e040fb]">{i + 1}.</span>
              <span className="flex-1 font-display font-bold uppercase text-sm tracking-wide text-white">{f.name}</span>
              <span className="font-display font-black text-base tabular-nums text-white">{f.score}</span>
              <span className="text-white/40 text-xs ml-3 tabular-nums">({f.overs})</span>
            </div>
          ))}
          {fowList.length === 0 && <p className="text-center text-white/20 py-6 text-sm font-display tracking-wider">NO WICKETS YET</p>}
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #e91e63, #ff80ab, #e91e63, transparent)' }} />
      </div>
    );
  };

  // ===== PARTNERSHIP =====
  const Partnership = () => {
    if (!striker || !nonStriker) return null;
    const totalPartnership = striker.runs + nonStriker.runs;
    const strikerPct = totalPartnership > 0 ? (striker.runs / totalPartnership) * 100 : 50;
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.5), 0 0 20px rgba(106,27,154,0.2)' }}>
        <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #2e7d32dd, #1b5e2088)' }}>
          <span className="font-display text-lg md:text-xl font-black text-white tracking-wider">CURRENT PARTNERSHIP</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #4caf50, #81c784, #4caf50, transparent)' }} />
        <div className="py-6 px-6" style={{ background: 'linear-gradient(180deg, #16213e, #111122)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-center flex-1">
              <p className="font-display font-bold text-base md:text-lg text-white uppercase tracking-wider">{striker.name}</p>
              <p className="text-4xl md:text-5xl font-black font-display mt-1 text-[#e040fb]">{striker.runs}</p>
              <p className="text-white/40 text-xs mt-1">({striker.ballsFaced} balls)</p>
            </div>
            <div className="text-center px-6">
              <p className="text-amber-400 text-[10px] font-display font-bold tracking-[0.3em] uppercase">PARTNERSHIP</p>
              <p className="font-display text-5xl md:text-6xl font-black text-white mt-1 drop-shadow-lg">{totalPartnership}</p>
            </div>
            <div className="text-center flex-1">
              <p className="font-display font-bold text-base md:text-lg text-white uppercase tracking-wider">{nonStriker.name}</p>
              <p className="text-4xl md:text-5xl font-black font-display mt-1 text-[#e040fb]">{nonStriker.runs}</p>
              <p className="text-white/40 text-xs mt-1">({nonStriker.ballsFaced} balls)</p>
            </div>
          </div>
          <div className="w-full h-2.5 rounded-full overflow-hidden bg-white/10 mt-2">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${strikerPct}%`, background: 'linear-gradient(90deg, #6a1b9a, #e040fb)' }} />
          </div>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #4caf50, #81c784, #4caf50, transparent)' }} />
      </div>
    );
  };

  // ===== TEAMS =====
  const TeamsPlayers = () => (
    <div className="w-[90vw] max-w-[800px] mx-auto grid grid-cols-2 gap-0 overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.5)' }}>
      {[match.team1, match.team2].map((team, ti) => (
        <div key={ti} className={ti === 0 ? 'border-r border-white/10' : ''}>
          <div className="px-4 py-3 text-center font-display font-black text-white uppercase text-sm md:text-base flex items-center justify-center gap-2 tracking-wider" style={{ background: `linear-gradient(135deg, ${ti === 0 ? t1Color : t2Color}dd, ${ti === 0 ? t1Color : t2Color}88)` }}>
            {team.logo && <img src={team.logo} alt={team.name} className="w-6 h-6 object-contain" />}
            {team.name}
          </div>
          <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, transparent, #e040fb, transparent)' }} />
          <div style={{ background: 'linear-gradient(180deg, #16213e, #111122)' }}>
            {team.players.map((p, i) => (
              <div key={p.id} className={`px-4 py-2 text-white text-sm border-b border-white/5 flex items-center gap-2 ${i % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                <span className="text-white/20 text-xs w-6 tabular-nums font-bold">{i + 1}.</span>
                <span className="font-display uppercase text-sm tracking-wide">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // ===== MATCH SUMMARY =====
  const MatchSummary = () => <MatchSummaryCard match={match} theme="premium" />;


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
      case 'upcoming': return <UpcomingMatchDisplay snapshot={snapshot} variant="purple" />;
      case 'score': case 'default': default: return <DefaultScoreBar />;
    }
  };

  return (
    <div className={`w-full min-h-screen bg-transparent flex justify-center p-0 ${isBottomAligned ? 'items-end' : 'items-center'}`}>
      <div className={isBottomAligned ? 'w-full relative' : 'w-full px-2 md:px-4'}>
        {renderContent()}
        {isBottomAligned && <ScoreboardTicker snapshot={snapshot} match={match} variant="premium" />}
        {isBottomAligned && <BoundaryAlert snapshot={snapshot} variant="premium" barHeight={76} />}
        {/* Full-width broadcast overlay banner for FOUR / SIX / WICKET */}
        <BroadcastOverlayBanner
          overlay={display.overlay}
          onHide={() => setDisplay(prev => ({ ...prev, overlay: 'none' }))}
        />
      </div>
    </div>
  );
};

const Scoreboard3 = () => (
  <Scoreboard3ErrorBoundary>
    <Scoreboard3Inner />
  </Scoreboard3ErrorBoundary>
);

export default Scoreboard3;
