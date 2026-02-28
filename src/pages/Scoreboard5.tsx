import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import BoundaryAlert from '@/components/BoundaryAlert';
import BroadcastOverlayBanner from '@/components/BroadcastOverlayBanner';
import MatchSummaryCard from '@/components/MatchSummaryCard';
import ScoreboardTicker from '@/components/ScoreboardTicker';
import UpcomingMatchDisplay from '@/components/UpcomingMatchDisplay';
import TourStatsDisplay from '@/components/TourStatsDisplay';
import DrsTimer from '@/components/DrsTimer';
import DismissalCard from '@/components/DismissalCard';
import { useParams } from 'react-router-dom';
import { Match, BallEvent, getOversString, getRunRate } from '@/types/cricket';
import { getMatch } from '@/lib/store';
import { getDisplayState, DisplayState, AnimationOverlay, DisplayMode } from '@/lib/displaySync';
import { supabase } from '@/integrations/supabase/client';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';
import VSBannerDisplay, { vsThemeGreen } from '@/components/VSBannerDisplay';
import { BallDot, EmptyBallDot } from '@/components/BallDot';

// ErrorBoundary
class Scoreboard5ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Scoreboard5] ErrorBoundary caught:', error, info);
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

const Scoreboard5Inner = () => {
  const { id } = useParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<ScoreboardSnapshot | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [display, setDisplay] = useState<DisplayState>({ mode: 'default', overlay: 'none', timestamp: 0 });
  const vsAnimDone = useRef(false);
  const [vsAnimIn, setVsAnimIn] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');
  const lastPayloadTs = useRef<number>(0);

  // Force transparent background for PRISM Live / OBS
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

  // === REALTIME SYNC (identical to SB4) ===
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    const loadMatch = async () => {
      try {
        const m = await getMatch(id);
        if (mounted && m) setMatch(m);
      } catch (e) { console.error('[Scoreboard5] Failed to load match:', e); }
    };

    const loadSnapshot = async () => {
      try {
        const { data } = await (supabase.from('score_live') as any).select('snapshot').eq('match_id', id).maybeSingle();
        if (data?.snapshot && mounted) {
          const snap = data.snapshot as ScoreboardSnapshot;
          setSnapshot(snap);
          if (snap.displayMode) {
            setDisplay(prev => ({ ...prev, mode: snap.displayMode as DisplayMode, overlay: 'none' }));
          }
          lastPayloadTs.current = snap.ts || Date.now();
        }
      } catch (e) { console.error('[Scoreboard5] score_live fetch failed:', e); }
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
      loadMatch();
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

    const scoreLiveCh = supabase.channel(`score-live5-${id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_live', filter: `match_id=eq.${id}` }, (payload) => {
        if (!mounted) return;
        const row = payload.new as any;
        if (row?.snapshot) applySnapshot(row.snapshot as ScoreboardSnapshot);
      })
      .subscribe((status) => { if (mounted) setConnectionStatus(status); });

    const broadcastCh = supabase.channel(`broadcast5-${id}`)
      .on('broadcast', { event: 'match_update' }, (payload) => {
        if (!mounted) return;
        const data = payload.payload;
        if (data?.snapshot) { applySnapshot(data.snapshot as ScoreboardSnapshot); return; }
        if (data?.display_state) setDisplay(prev => ({ ...prev, ...data.display_state }));
      }).subscribe();

    const pgCh = supabase.channel(`pg5-${id}-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${id}` }, (payload) => {
        if (!mounted) return;
        const row = payload.new as any;
        if (row?.display_state) setDisplay(row.display_state as DisplayState);
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
          <div className="relative flex items-center justify-center" style={{ height: '56px', background: 'linear-gradient(180deg, #e8e8e8, #d0d0d0)' }}>
            <span className="text-black/40 text-sm font-mono animate-pulse">{connectionStatus === 'SUBSCRIBED' ? 'Waiting for controller...' : 'Connecting...'}</span>
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
  const displayRuns = s ? s.inn.runs : 0;
  const displayWickets = s ? s.inn.wickets : 0;
  const displayBalls = s ? s.inn.balls : 0;
  const target = s ? (s.inIdx === 1 && s.inn1Runs !== undefined ? s.inn1Runs + 1 : null) : null;
  const t1Color = (s?.t1.color || match.team1.color || '#1b5e20');
  const t2Color = (s?.t2.color || match.team2.color || '#1565c0');
  const currentOverBalls = s?.ov || [];
  const bpo = s?.bpo || match.ballsPerOver;

  const batTeamName = s
    ? (s.inn.batIdx === 0 ? s.t1.name : s.t2.name)
    : (battingTeam || match.team1).name;
  const bowlTeamName = s
    ? (s.inn.batIdx === 0 ? s.t2.name : s.t1.name)
    : (bowlingTeam || match.team2).name;
  const batColor = s ? (s.inn.batIdx === 0 ? t1Color : t2Color) : t1Color;
  const bowlColor = s ? (s.inn.batIdx === 0 ? t2Color : t1Color) : t2Color;

  const batTeamObj = s?.inn.batIdx === 0 ? match.team1 : match.team2;
  const bowlTeamObj = s?.inn.batIdx === 0 ? match.team2 : match.team1;

  const need = target ? Math.max(0, target - displayRuns) : null;
  const remainBalls = (match.overs * match.ballsPerOver - displayBalls);

  const GOLD = '#c9a84c';

  // Team abbreviation (first 2-3 chars)
  const batAbbr = batTeamName.slice(0, 3).toUpperCase();

  // Compute RRR for 2nd innings
  const rrr = need !== null && need > 0 && remainBalls > 0
    ? ((need / remainBalls) * bpo).toFixed(1)
    : null;

  // CRR
  const crr = displayBalls > 0 ? ((displayRuns / displayBalls) * bpo).toFixed(1) : '0.0';

  // Player data from match for summary modes
  const striker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentStrikerId) : null;
  const nonStriker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentNonStrikerId) : null;

  // Team Badge
  const TeamBadge = ({ team, size = 40 }: { team: typeof match.team1; size?: number }) => (
    <div className="flex items-center justify-center flex-shrink-0" style={{ width: size + 6, height: size + 6 }}>
      {team.logo ? (
        <img src={team.logo} alt={team.name} className="object-contain drop-shadow-lg" style={{ width: size, height: size }} />
      ) : (
        <div
          className="font-display font-black text-white flex items-center justify-center rounded-full border-2"
          style={{ width: size, height: size, fontSize: size * 0.32, borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)' }}
        >
          {team.name.slice(0, 3).toUpperCase()}
        </div>
      )}
    </div>
  );

  // ===========================
  // DEFAULT SCORE BAR — Reference-matching single-row broadcast design
  // Layout: [BatLogo] [Striker | NonStriker] | [Abbr SCORE Overs] [RRR/CRR] | [Bowler Stats] [BallTracker] [BowlLogo]
  // ===========================
  const DefaultScoreBar = () => {
    const BLUE = '#2c3094';
    const BLUE_DARK = '#1a1f6e';
    const GREEN_DARK = '#0d4a2b';
    const GREEN_MID = '#126b3a';
    const WHITE_BG = 'linear-gradient(180deg, #f5f5f5 0%, #d8d8d8 50%, #e8e8e8 100%)';
    const BORDER_GOLD = '#8b7530';

    return (
      <div className="w-full" style={{ fontFamily: 'Oswald, system-ui, sans-serif' }}>
        {/* Thin gold top line */}
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${BLUE_DARK}, ${GOLD}, ${GREEN_DARK})` }} />

        <div className="flex items-stretch w-full" style={{ height: '52px' }}>

          {/* === LEFT: Batting team section (Blue/Purple bg) === */}
          <div className="flex items-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${BLUE_DARK} 0%, ${BLUE} 100%)` }}>
            {/* Batting team logo */}
            <div className="px-2 flex items-center justify-center" style={{ minWidth: '52px' }}>
              <TeamBadge team={batTeamObj} size={36} />
            </div>

            {/* Batsmen info */}
            <div className="flex items-center gap-4 px-3 pr-4">
              {/* Striker */}
              {strikerData && (
                <div className="flex items-center gap-1.5">
                  <span style={{ color: '#fbbf24', fontSize: '9px', fontWeight: 900 }}>▶</span>
                  <span className="font-display font-bold text-white uppercase tracking-wider" style={{ fontSize: '15px' }}>
                    {strikerData.name.split(' ').slice(-1)[0]}
                  </span>
                  <span className="font-display font-black text-white tabular-nums" style={{ fontSize: '17px' }}>
                    {strikerData.runs}
                  </span>
                  <span className="font-display text-white/50 tabular-nums" style={{ fontSize: '12px' }}>
                    {strikerData.bf}
                  </span>
                </div>
              )}
              {/* Non-striker */}
              {nonStrikerData && (
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-bold text-white/70 uppercase tracking-wider" style={{ fontSize: '15px' }}>
                    {nonStrikerData.name.split(' ').slice(-1)[0]}
                  </span>
                  <span className="font-display font-bold text-white/80 tabular-nums" style={{ fontSize: '16px' }}>
                    {nonStrikerData.runs}
                  </span>
                  <span className="font-display text-white/40 tabular-nums" style={{ fontSize: '12px' }}>
                    {nonStrikerData.bf}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* === CENTER: Score pill (white/silver bg with rounded shape) === */}
          <div className="flex flex-col items-center justify-center flex-shrink-0 relative" style={{
            background: WHITE_BG,
            minWidth: '200px',
            borderLeft: `3px solid ${BORDER_GOLD}`,
            borderRight: `3px solid ${BORDER_GOLD}`,
          }}>
            {/* Top row: Abbr + Score + Overs */}
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-gray-700 tracking-wider" style={{ fontSize: '15px' }}>
                {batAbbr}
              </span>
              <span className="font-display font-black tabular-nums" style={{ fontSize: '30px', color: '#1a1a1a', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {displayRuns}-{displayWickets}
              </span>
              <span className="font-display font-bold text-gray-500 tabular-nums" style={{ fontSize: '15px' }}>
                {getOversString(displayBalls, bpo)}
              </span>
            </div>
            {/* Bottom row: RRR or CRR */}
            <div className="flex items-center gap-1">
              {rrr ? (
                <>
                  <span className="font-display font-bold tracking-wider uppercase" style={{ fontSize: '11px', color: '#555' }}>
                    REQUIRED RUN RATE
                  </span>
                  <span className="font-display font-black tabular-nums" style={{ fontSize: '13px', color: '#c62828' }}>
                    {rrr}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-display font-bold tracking-wider uppercase" style={{ fontSize: '11px', color: '#555' }}>
                    RUN RATE
                  </span>
                  <span className="font-display font-black tabular-nums" style={{ fontSize: '13px', color: '#1a1a1a' }}>
                    {crr}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* === RIGHT: Bowling team section (Green bg) === */}
          <div className="flex items-center flex-1 min-w-0" style={{
            background: `linear-gradient(135deg, ${GREEN_DARK} 0%, ${GREEN_MID} 100%)`,
            border: `2px solid #b71c1c`,
            borderLeft: 'none',
          }}>
            {/* Bowler info */}
            {bowlerData && (
              <div className="flex items-center gap-1.5 px-3 flex-shrink-0">
                <span className="font-display font-bold text-white uppercase tracking-wider" style={{ fontSize: '15px' }}>
                  {bowlerData.name.split(' ').slice(-1)[0]}
                </span>
                <span className="font-display font-bold text-white tabular-nums" style={{ fontSize: '15px' }}>
                  {bowlerData.w}-{bowlerData.r}
                </span>
                <span className="font-display text-white/50 tabular-nums" style={{ fontSize: '12px' }}>
                  {getOversString(bowlerData.balls, bpo)}
                </span>
              </div>
            )}

            {/* Ball tracker */}
            <div className="flex items-center gap-1 px-2 flex-shrink-0">
              {currentOverBalls.map((e, i) => <BallDot key={i} event={e} size="md" theme="dark" />)}
              {Array.from({ length: Math.max(0, bpo - currentOverBalls.length) }).map((_, i) => (
                <EmptyBallDot key={`e-${i}`} size="md" theme="dark" />
              ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Bowling team logo */}
            <div className="px-2 flex items-center justify-center" style={{ minWidth: '52px' }}>
              <TeamBadge team={bowlTeamObj} size={36} />
            </div>
          </div>
        </div>

        {/* Thin gold bottom line */}
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${BLUE_DARK}, ${GOLD}, ${GREEN_DARK})` }} />
      </div>
    );
  };

  // ===========================
  // VS Banner
  // ===========================
  const vsTheme = {
    bg: 'linear-gradient(135deg, #1a1f6e, #2c3094)',
    text: '#ffffff',
    accent: GOLD,
    ribbonBg: 'linear-gradient(135deg, #0d4a2b, #126b3a)',
    ribbonText: '#ffffff',
  };

  const VSBanner = () => (
    <VSBannerDisplay
      team1={{ name: match.team1.name, color: t1Color, logo: match.team1.logo }}
      team2={{ name: match.team2.name, color: t2Color, logo: match.team2.logo }}
      tournamentName={s?.tournamentName}
      matchType={s?.matchType || match.matchType}
      matchNo={s?.matchNo || match.matchNo}
      tossWonBy={s?.tossWonBy ?? match.tossWonBy ?? 0}
      optedTo={s?.optedTo || match.optedTo || 'bat'}
      animIn={vsAnimIn}
      theme={vsThemeGreen}
    />
  );

  // ===========================
  // SUMMARY MODES (reused from SB4 style with blue/green theme)
  // ===========================
  const BLUE = '#2c3094';
  const GREEN_DARK_CONST = '#0d4a2b';

  const BattingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p style={{ color: '#aaa', textAlign: 'center', padding: '2rem' }}>Innings not available</p>;
    const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
    const btColor = inn.battingTeamIndex === 0 ? t1Color : t2Color;
    const extras = inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes;
    const battedPlayers = bt.players.filter(p =>
      p.ballsFaced > 0 || p.isOut || p.id === inn.currentStrikerId || p.id === inn.currentNonStrikerId
    );
    const allSlots: (typeof battedPlayers[0] | null)[] = [
      ...battedPlayers,
      ...Array.from({ length: Math.max(0, 11 - battedPlayers.length) }, () => null),
    ];
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6), 0 0 20px rgba(44,48,148,0.3)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ background: `linear-gradient(135deg, ${btColor}dd, ${btColor}88)` }}>
          <div className="flex items-center gap-3">
            {bt.logo && <img src={bt.logo} alt={bt.name} className="w-8 h-8 object-contain drop-shadow-lg" />}
            <span className="font-display text-lg font-black text-white uppercase tracking-wider">{bt.name} — BATTING SUMMARY</span>
          </div>
          <span className="font-display text-xl font-black text-white px-3 py-0.5 rounded-md" style={{ background: 'rgba(0,0,0,0.35)' }}>{inn.runs}-{inn.wickets}</span>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <div className="px-5 py-1.5 text-[11px] text-white/40 font-bold flex tracking-wider" style={{ background: '#1a1f3a' }}>
          <span className="w-6 text-white/20 text-[10px]">#</span>
          <span className="flex-1">BATSMAN</span>
          <span className="w-36 text-center text-[10px]">DISMISSAL</span>
          <span className="w-10 text-right">R</span>
          <span className="w-10 text-right">B</span>
        </div>
        <div style={{ background: 'linear-gradient(180deg, #141833, #0f1228)' }}>
          {allSlots.map((p, idx) => {
            if (!p) {
              return (
                <div key={`empty-${idx}`} className="flex items-center px-5 border-b" style={{ height: '32px', borderColor: 'rgba(201,168,76,0.06)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                  <span className="w-6 text-white/10 text-[11px] font-bold tabular-nums">{idx + 1}</span>
                  <div className="flex-1 h-[1px] rounded" style={{ background: 'rgba(201,168,76,0.08)' }} />
                </div>
              );
            }
            const isStriker = p.id === inn.currentStrikerId;
            const isNonStriker = p.id === inn.currentNonStrikerId;
            const isNotOut = !p.isOut && (isStriker || isNonStriker || (inn.isComplete && !p.isOut && p.ballsFaced > 0));
            const hasBatted = p.ballsFaced > 0 || p.isOut;
            const isCurrentlyBatting = isStriker || isNonStriker;
            return (
              <div key={p.id} className="flex items-center px-5 border-b" style={{
                height: '34px',
                borderColor: 'rgba(201,168,76,0.08)',
                background: isCurrentlyBatting ? 'rgba(201,168,76,0.08)' : idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
              }}>
                <span className="w-6 text-white/25 text-[11px] font-bold tabular-nums">{idx + 1}</span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {isStriker && <span style={{ color: GOLD, fontSize: '10px', fontWeight: 900, flexShrink: 0 }}>▶</span>}
                  <span className="font-display font-bold text-[13px] uppercase tracking-wide truncate"
                    style={{ color: hasBatted ? '#ffffff' : 'rgba(255,255,255,0.25)' }}>
                    {p.name}
                  </span>
                  {isNotOut && (
                    <span className="text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: '#66bb6a', background: 'rgba(102,187,106,0.15)' }}>NOT OUT</span>
                  )}
                </div>
                <div className="w-36 text-center">
                  {hasBatted && p.isOut && (
                    <span className="text-[10px] italic truncate block" style={{ color: 'rgba(255,255,255,0.3)' }}>{p.dismissalType}{p.dismissedBy ? ` b ${p.dismissedBy}` : ''}</span>
                  )}
                </div>
                <span className="w-10 text-right font-display font-black text-base tabular-nums"
                  style={{ color: hasBatted ? '#ffffff' : 'rgba(255,255,255,0.15)' }}>{hasBatted ? p.runs : ''}</span>
                <span className="w-10 text-right text-sm tabular-nums"
                  style={{ color: hasBatted ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)' }}>{hasBatted ? p.ballsFaced : ''}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-5 py-2.5" style={{ background: `linear-gradient(135deg, #2c3094, #1a1f6e)` }}>
          <span className="font-display text-white font-bold text-xs uppercase tracking-widest">{match.matchType}</span>
          <span className="text-white/80 text-xs font-bold">EXTRAS: {extras}</span>
          <span className="text-white/80 text-xs font-bold">{getOversString(inn.balls, match.ballsPerOver)} OV</span>
          <span className="font-display font-black text-white text-xl">{inn.runs}/{inn.wickets}</span>
        </div>
      </div>
    );
  };

  const BowlingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p style={{ color: '#aaa', textAlign: 'center', padding: '2rem' }}>Innings not available</p>;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const bltColor = inn.bowlingTeamIndex === 0 ? t1Color : t2Color;
    const bowlers = blt.players.filter(p => p.bowlingBalls > 0);
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6), 0 0 20px rgba(44,48,148,0.3)' }}>
        <div className="flex items-center gap-3 px-5 py-3" style={{ background: `linear-gradient(135deg, ${bltColor}dd, ${bltColor}88)` }}>
          {blt.logo && <img src={blt.logo} alt={blt.name} className="w-8 h-8 object-contain drop-shadow-lg" />}
          <span className="font-display text-lg font-black text-white uppercase tracking-wider">{blt.name} — BOWLING SUMMARY</span>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <div className="px-5 py-2 text-[11px] text-white/40 font-bold flex tracking-wider" style={{ background: '#1a1f3a' }}>
          <span className="flex-1">BOWLER</span><span className="w-14 text-right">O</span><span className="w-14 text-right">R</span><span className="w-14 text-right">W</span><span className="w-16 text-right">ECON</span>
        </div>
        <div style={{ background: 'linear-gradient(180deg, #141833, #0f1228)' }}>
          {bowlers.map((p, idx) => (
            <div key={p.id} className="flex items-center px-5 py-2 border-b" style={{ borderColor: 'rgba(201,168,76,0.08)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <span className="font-display font-bold text-sm text-white flex-1 uppercase tracking-wide">{p.name}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{p.bowlingRuns}</span>
              <span className="w-14 text-right font-bold text-sm tabular-nums" style={{ color: p.bowlingWickets > 0 ? GOLD : 'rgba(201,168,76,0.3)' }}>{p.bowlingWickets}</span>
              <span className="w-16 text-right text-white/50 text-sm tabular-nums">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
            </div>
          ))}
          {bowlers.length === 0 && <p className="text-center py-6 text-sm font-display tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>NO BOWLING DATA YET</p>}
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      </div>
    );
  };

  const FallOfWickets = () => {
    if (!currentInnings) return null;
    let runningScore = 0; let runningBalls = 0;
    const fowList = currentInnings.events.map(e => {
      if (e.isLegal) runningBalls++;
      runningScore += e.runs;
      if (e.isWicket) {
        const b = battingTeam?.players.find(p => p.id === e.batsmanId);
        return { name: b?.name || '?', score: runningScore, overs: getOversString(runningBalls, match.ballsPerOver), type: e.wicketType };
      }
      return null;
    }).filter(Boolean);
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6)' }}>
        <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #b71c1cdd, #7b0a0a88)' }}>
          <span className="font-display text-lg font-black text-white tracking-wider">FALL OF WICKETS</span>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <div style={{ background: 'linear-gradient(180deg, #141833, #0f1228)' }}>
          {fowList.map((f: any, i: number) => (
            <div key={i} className="flex items-center px-5 py-2.5 border-b" style={{ borderColor: 'rgba(201,168,76,0.08)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <span className="w-10 text-sm font-black tabular-nums" style={{ color: GOLD }}>{i + 1}.</span>
              <span className="flex-1 font-display font-bold uppercase text-sm tracking-wide text-white">{f.name}</span>
              {f.type && <span className="text-white/30 text-xs mr-3 italic">{f.type}</span>}
              <span className="font-display font-black text-base tabular-nums text-white">{f.score}</span>
              <span className="text-white/40 text-xs ml-3 tabular-nums">({f.overs})</span>
            </div>
          ))}
          {fowList.length === 0 && <p className="text-center py-6 text-sm font-display tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>NO WICKETS YET</p>}
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      </div>
    );
  };

  const Partnership = () => {
    if (!striker || !nonStriker) return (
      <div className="w-[90vw] max-w-[600px] mx-auto text-center py-8" style={{ color: 'rgba(255,255,255,0.4)' }}>Waiting for batsmen...</div>
    );
    const totalPartnership = striker.runs + nonStriker.runs;
    const strikerPct = totalPartnership > 0 ? (striker.runs / totalPartnership) * 100 : 50;
    return (
      <div className="w-[90vw] max-w-[700px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6)' }}>
        <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #2c3094dd, #1a1f6e88)' }}>
          <span className="font-display text-lg font-black text-white tracking-wider">CURRENT PARTNERSHIP</span>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <div className="py-6 px-6" style={{ background: 'linear-gradient(180deg, #141833, #0f1228)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-center flex-1">
              <p className="font-display font-bold text-base text-white uppercase tracking-wider">{striker.name}</p>
              <p className="text-4xl font-black font-display mt-1" style={{ color: GOLD }}>{striker.runs}</p>
              <p className="text-white/40 text-xs mt-1">({striker.ballsFaced} balls)</p>
            </div>
            <div className="text-center px-6">
              <p className="text-[10px] font-display font-bold tracking-[0.3em] uppercase" style={{ color: GOLD }}>PARTNERSHIP</p>
              <p className="font-display text-5xl font-black text-white mt-1 drop-shadow-lg">{totalPartnership}</p>
            </div>
            <div className="text-center flex-1">
              <p className="font-display font-bold text-base text-white uppercase tracking-wider">{nonStriker.name}</p>
              <p className="text-4xl font-black font-display mt-1" style={{ color: GOLD }}>{nonStriker.runs}</p>
              <p className="text-white/40 text-xs mt-1">({nonStriker.ballsFaced} balls)</p>
            </div>
          </div>
          <div className="w-full h-2.5 rounded-full overflow-hidden mt-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${strikerPct}%`, background: `linear-gradient(90deg, ${BLUE}, ${GOLD})` }} />
          </div>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      </div>
    );
  };

  const TeamsPlayers = () => (
    <div className="w-[90vw] max-w-[800px] mx-auto grid grid-cols-2 gap-0 overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6)' }}>
      {[match.team1, match.team2].map((team, ti) => (
        <div key={ti} style={{ borderRight: ti === 0 ? `1px solid rgba(201,168,76,0.15)` : 'none' }}>
          <div className="px-4 py-3 text-center font-display font-black text-white uppercase text-sm flex items-center justify-center gap-2 tracking-wider"
            style={{ background: `linear-gradient(135deg, ${ti === 0 ? t1Color : t2Color}dd, ${ti === 0 ? t1Color : t2Color}88)` }}>
            {team.logo && <img src={team.logo} alt={team.name} className="w-6 h-6 object-contain" />}
            {team.name}
          </div>
          <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
          <div style={{ background: 'linear-gradient(180deg, #141833, #0f1228)' }}>
            {team.players.map((p, i) => (
              <div key={p.id} className="px-4 py-2 text-white text-sm border-b flex items-center gap-2"
                style={{ borderColor: 'rgba(201,168,76,0.06)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <span className="text-white/20 text-xs w-6 tabular-nums font-bold">{i + 1}.</span>
                <span className="font-display uppercase text-sm tracking-wide">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const TargetBanner = () => {
    const targetVal = s?.inIdx === 1 && s?.inn1Runs !== undefined ? s.inn1Runs + 1 : null;
    const needRuns = targetVal ? Math.max(0, targetVal - displayRuns) : null;
    const remBalls = match.overs * match.ballsPerOver - displayBalls;
    const rrrVal = remBalls > 0 && needRuns !== null ? ((needRuns / remBalls) * bpo).toFixed(2) : '0.00';
    if (!targetVal || !battingTeam) return <VSBanner />;
    return (
      <div className="w-full">
        <div style={{ height: '3px', background: `linear-gradient(90deg, #1a1f6e, ${GOLD}, #0d4a2b)` }} />
        <div className="relative flex items-stretch" style={{ height: '72px', background: `linear-gradient(180deg, #2c3094 0%, #1a1f6e 100%)` }}>
          <div className="flex-1 flex items-center justify-center gap-4 px-4">
            <span className="font-display text-lg font-black text-white uppercase">{battingTeam.name}</span>
            <div className="text-center px-5 py-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #7b1a1a, #b71c1c)', boxShadow: '0 0 15px rgba(183,28,28,0.3)' }}>
              <p className="font-display text-white font-bold text-xs uppercase">NEED <span className="text-yellow-300 text-base font-black">{needRuns}</span> FROM <span className="text-yellow-300 text-base font-black">{remBalls}</span> BALLS</p>
              <p className="text-white/50 text-[9px] font-display">RRR: <span className="text-yellow-300">{rrrVal}</span></p>
            </div>
            <span className="font-display text-lg font-black text-white uppercase">{bowlingTeam?.name}</span>
          </div>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, #1a1f6e, ${GOLD}, #0d4a2b)` }} />
      </div>
    );
  };

  const MatchSummary = () => <MatchSummaryCard match={match} theme="premium" />;

  // ===========================
  // MAIN RENDER
  // ===========================
  const isBottomAligned = display.mode === 'default' || display.mode === 'score';

  const renderContent = () => {
    const tourId = snapshot?.tournamentId || match.tournamentId;
    switch (display.mode) {
      case 'vs': return <VSBanner />;
      case 'target': return <TargetBanner />;
      case '1bat': return <BattingSummary inningsIdx={0} />;
      case '2bat': return <BattingSummary inningsIdx={1} />;
      case '1ball': case 'b1': return <BowlingSummary inningsIdx={0} />;
      case '2ball': case 'b2': return <BowlingSummary inningsIdx={1} />;
      case 'bowler': return <BowlingSummary inningsIdx={match.currentInningsIndex} />;
      case 'fow': return <FallOfWickets />;
      case 'partnership': return <Partnership />;
      case 'teams': return <TeamsPlayers />;
      case 'summary': return <MatchSummary />;
      case 'upcoming': return <UpcomingMatchDisplay snapshot={snapshot} variant="blue" />;
      case 'tour_points' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_points" variant="dark" /> : null;
      case 'tour_points_tied' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_points_tied" variant="dark" /> : null;
      case 'tour_batters' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_batters" variant="dark" /> : null;
      case 'tour_bowlers' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_bowlers" variant="dark" /> : null;
      case 'tour_boundaries' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_boundaries" variant="dark" /> : null;
      case 'tour_series' as any:
        return tourId ? <TourStatsDisplay tournamentId={tourId} mode="tour_series" variant="dark" /> : null;
      case 'score': case 'default': default: return <DefaultScoreBar />;
    }
  };

  return (
    <div className={`w-full min-h-screen bg-transparent flex justify-center p-0 ${isBottomAligned ? 'items-end' : 'items-center'}`}>
      <div className={isBottomAligned ? 'w-full relative' : 'w-full px-2 md:px-4'}>
        {isBottomAligned && <DismissalCard snapshot={snapshot} />}
        {renderContent()}
        <BroadcastOverlayBanner
          overlay={display.overlay}
          onHide={() => setDisplay(prev => ({ ...prev, overlay: 'none' }))}
        />
        <DrsTimer drsTimerStart={display.drsTimerStart} />
        {isBottomAligned && <BoundaryAlert snapshot={snapshot} variant="dark" barHeight={58} />}
      </div>
    </div>
  );
};

export default function Scoreboard5() {
  return (
    <Scoreboard5ErrorBoundary>
      <Scoreboard5Inner />
    </Scoreboard5ErrorBoundary>
  );
}
