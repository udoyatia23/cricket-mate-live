import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
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
class Scoreboard4ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Scoreboard4] ErrorBoundary caught:', error, info);
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

const Scoreboard4Inner = () => {
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
      } catch (e) { console.error('[Scoreboard4] Failed to load match:', e); }
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
      } catch (e) { console.error('[Scoreboard4] score_live fetch failed:', e); }
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

    const scoreLiveCh = supabase.channel(`score-live4-${id}-${Date.now()}`)
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

    const pgCh = supabase.channel(`pg4-${id}-${Date.now()}`)
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
          <div className="relative flex items-center justify-center" style={{ height: '80px', background: 'linear-gradient(180deg, #1a4a1a 0%, #0d2e0d 100%)' }}>
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

  // Toss info
  const tossTeamName = match.tossWonBy === 0 ? match.team1.name : match.team2.name;
  const matchTitle = s?.matchType ? s.matchType.toUpperCase() : match.matchType?.toUpperCase() || 'MATCH';
  const venue = s?.venue || '';

  // ===========================
  // BALL TRACKER (reference style)
  // ===========================
  const BallDot = ({ event }: { event: BallEvent }) => {
    let bg = '#2d2d2d';
    let border = '#555';
    let text = String(event.runs);
    let textColor = '#fff';
    let isSquare = false;

    if (event.isWicket) {
      bg = '#c62828'; border = '#c62828'; text = 'W'; textColor = '#fff';
    } else if (event.runs === 6) {
      bg = '#1b5e20'; border = '#2e7d32'; textColor = '#fff';
    } else if (event.runs === 4) {
      bg = '#e65100'; border = '#bf360c'; textColor = '#fff'; isSquare = true;
    } else if (event.runs === 0) {
      bg = '#fdd835'; border = '#f9a825'; textColor = '#111';
    } else if (event.type === 'wide') {
      bg = '#6d4c41'; border = '#795548'; text = 'Wd'; textColor = '#ffcc02';
    } else if (event.type === 'noBall') {
      bg = '#6d4c41'; border = '#795548'; text = 'Nb'; textColor = '#ffcc02';
    } else {
      bg = '#333'; border = '#555'; textColor = '#fff';
    }

    return (
      <div
        className="flex items-center justify-center text-[10px] font-black flex-shrink-0"
        style={{
          width: '22px', height: '22px',
          backgroundColor: bg,
          border: `2px solid ${border}`,
          borderRadius: isSquare ? '3px' : '50%',
          color: textColor,
          fontFamily: 'Oswald, sans-serif',
        }}
      >
        {text}
      </div>
    );
  };

  const EmptyDot = () => (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{ width: '22px', height: '22px', backgroundColor: '#3a3a3a', border: '2px solid #555', borderRadius: '50%' }}
    />
  );

  // ===========================
  // TEAM LOGO / BADGE
  // ===========================
  const TeamBadge = ({ team, size = 44 }: { team: typeof match.team1; size?: number }) => (
    <div className="flex items-center justify-center flex-shrink-0" style={{ width: size + 8, height: size + 8 }}>
      {team.logo ? (
        <img src={team.logo} alt={team.name} className="object-contain drop-shadow-lg" style={{ width: size, height: size }} />
      ) : (
        <div
          className="font-display font-black text-white flex items-center justify-center rounded-full border-2"
          style={{ width: size, height: size, fontSize: size * 0.32, borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)' }}
        >
          {team.name.slice(0, 3).toUpperCase()}
        </div>
      )}
    </div>
  );

  // ===========================
  // PLAYER DATA FROM MATCH (for summary modes)
  // ===========================
  const striker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentStrikerId) : null;
  const nonStriker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentNonStrikerId) : null;
  const bowler = currentInnings && bowlingTeam ? bowlingTeam.players.find(p => p.id === currentInnings.currentBowlerId) : null;

  // ===========================
  // OVERLAY DATA
  // ===========================
  const getOverlayData = () => {
    if (display.overlay === 'none') return null;
    const c: Record<AnimationOverlay, { text: string; color: string }> = {
      none: { text: '', color: '' },
      four: { text: 'FOUR!', color: '#e65100' },
      six: { text: 'SIX!', color: '#1b5e20' },
      wicket: { text: 'WICKET!', color: '#c62828' },
      free_hit: { text: 'FREE HIT', color: '#ff9800' },
      hat_trick: { text: 'HAT-TRICK!', color: '#880e4f' },
      out: { text: 'OUT!', color: '#b71c1c' },
      not_out: { text: 'NOT OUT!', color: '#1b5e20' },
    };
    return c[display.overlay];
  };
  const overlayData = getOverlayData();

  // ===========================
  // DEFAULT SCORE BAR - Bangladesh broadcast style
  // Two rows: top = teams + score | bottom = batsmen + bowler
  // Dark forest green base, gold/red accents
  // ===========================
  const DefaultScoreBar = () => {
    // Deep forest green base
    const GREEN_DARK = '#0d3b0d';
    const GREEN_MID = '#155215';
    const GREEN_LIGHT = '#1e6b1e';
    const GOLD = '#fdd835';
    const RED_DARK = '#7b1a1a';

    return (
      <div className="w-full" style={{ fontFamily: 'Oswald, system-ui, sans-serif' }}>
        {/* Gold top accent line */}
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${GREEN_DARK}, ${GOLD} 30%, ${GOLD} 70%, ${GREEN_DARK})` }} />

        {/* ── TOP ROW ── */}
        <div className="relative flex items-stretch w-full" style={{ height: '44px', background: `linear-gradient(180deg, ${GREEN_LIGHT} 0%, ${GREEN_DARK} 100%)` }}>

          {/* Left chevron decoration */}
          <div className="absolute left-0 top-0 bottom-0 flex items-center z-10" style={{ width: '20px' }}>
            <div style={{ width: 0, height: 0, borderTop: '22px solid transparent', borderBottom: '22px solid transparent', borderLeft: `14px solid ${GREEN_MID}`, opacity: 0.6 }} />
          </div>

          {/* BATTING TEAM section */}
          <div className="flex items-center gap-2 pl-6 pr-3 flex-shrink-0" style={{ minWidth: '220px', background: `linear-gradient(135deg, ${GREEN_LIGHT}, ${GREEN_MID})` }}>
            <TeamBadge team={batTeamObj} size={34} />
            <span className="font-display font-black text-white text-base md:text-lg uppercase tracking-wider truncate">
              {batTeamName}
            </span>
            {/* Match phase pill (P1/P2) */}
            <div className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-black"
              style={{ background: GOLD, color: '#111', fontFamily: 'Oswald, sans-serif' }}>
              P{(s?.inIdx ?? match.currentInningsIndex) + 1}
            </div>
          </div>

          {/* SCORE block - highlighted center */}
          <div className="flex items-center justify-center px-4 flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${RED_DARK}, #a52a2a)`, minWidth: '100px' }}>
            <span className="font-display font-black text-white tabular-nums"
              style={{ fontSize: '26px', letterSpacing: '0.02em', lineHeight: 1 }}>
              {displayRuns}-{displayWickets}
            </span>
          </div>

          {/* OVERS block */}
          <div className="flex items-center justify-center px-3 flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${GREEN_MID}, ${GREEN_DARK})`, minWidth: '56px' }}>
            <span className="font-display font-bold text-white tabular-nums text-base md:text-lg">
              {getOversString(displayBalls, bpo)}
            </span>
          </div>

          {/* Separator */}
          <div className="flex-shrink-0 self-stretch" style={{ width: '2px', background: `linear-gradient(180deg, transparent, ${GOLD}80, transparent)` }} />

          {/* BOWLING TEAM section */}
          <div className="flex items-center gap-2 px-3 flex-shrink-0" style={{ minWidth: '200px', background: `linear-gradient(135deg, ${GREEN_MID}, ${GREEN_LIGHT})` }}>
            <span className="font-display font-black text-white text-base md:text-lg uppercase tracking-wider truncate">
              {bowlTeamName}
            </span>
            <TeamBadge team={bowlTeamObj} size={34} />
          </div>

          {/* Separator */}
          <div className="flex-shrink-0 self-stretch" style={{ width: '2px', background: `linear-gradient(180deg, transparent, ${GOLD}80, transparent)` }} />

          {/* TOSS / TARGET / MATCH INFO section */}
          <div className="flex flex-col items-center justify-center px-4 flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${GREEN_LIGHT}, ${GREEN_MID})`, minWidth: '120px' }}>
            {overlayData ? (
              <span className="font-display font-black text-white text-sm tracking-wider" style={{ color: overlayData.color }}>{overlayData.text}</span>
            ) : need !== null && need > 0 && remainBalls > 0 ? (
              <>
                <span className="text-white/60 text-[9px] font-display tracking-widest">NEED</span>
                <span className="font-display font-black text-yellow-300 text-base tabular-nums leading-tight">{need} off {remainBalls}b</span>
              </>
            ) : (s?.status || match.status) === 'finished' && (s?.winner || match.winner) ? (
              <span className="font-display font-black text-yellow-300 text-[11px] uppercase tracking-wider text-center leading-tight">{(s?.winner || match.winner)?.split(' ').slice(0, 2).join(' ')} WON</span>
            ) : (
              <>
                <span className="text-white/60 text-[9px] font-display tracking-widest">TOSS</span>
                <span className="font-display font-bold text-white text-[11px] uppercase tracking-wide text-center leading-tight">{tossTeamName.split(' ')[0]}</span>
              </>
            )}
          </div>

          {/* Separator */}
          <div className="flex-shrink-0 self-stretch" style={{ width: '2px', background: `linear-gradient(180deg, transparent, ${GOLD}80, transparent)` }} />

          {/* MATCH TITLE / VENUE */}
          <div className="flex items-center justify-center flex-1 px-4"
            style={{ background: `linear-gradient(135deg, ${GREEN_DARK}, ${GREEN_MID})` }}>
            <span className="font-display font-bold text-white uppercase tracking-widest text-center"
              style={{ fontSize: '13px', opacity: 0.9 }}>
              {venue ? venue.toUpperCase() : matchTitle}
            </span>
          </div>

          {/* Right chevron decoration */}
          <div className="absolute right-0 top-0 bottom-0 flex items-center z-10" style={{ width: '20px' }}>
            <div style={{ width: 0, height: 0, borderTop: '22px solid transparent', borderBottom: '22px solid transparent', borderRight: `14px solid ${GREEN_MID}`, opacity: 0.6 }} />
          </div>
        </div>

        {/* Gold divider line */}
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${GREEN_DARK}, ${GOLD} 30%, ${GOLD} 70%, ${GREEN_DARK})` }} />

        {/* ── BOTTOM ROW ── */}
        <div className="relative flex items-stretch w-full" style={{ height: '36px', background: `linear-gradient(180deg, #0a2a0a 0%, #071a07 100%)` }}>

          {/* BATSMEN section */}
          <div className="flex items-center gap-3 pl-6 pr-4 flex-1 min-w-0"
            style={{ borderRight: `2px solid ${GOLD}50` }}>
            {/* Striker */}
            {strikerData && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span style={{ color: GOLD, fontSize: '10px', fontWeight: 900 }}>▶</span>
                <span className="font-display font-bold text-white uppercase tracking-wide"
                  style={{ fontSize: '13px' }}>{strikerData.name.split(' ').slice(-1)[0]}</span>
                <span className="font-display font-black text-white tabular-nums" style={{ fontSize: '15px' }}>{strikerData.runs}</span>
                <span className="font-display text-white/50 tabular-nums" style={{ fontSize: '11px' }}>{strikerData.bf}</span>
              </div>
            )}
            {/* Non-striker */}
            {nonStrikerData && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span style={{ color: 'transparent', fontSize: '10px' }}>▶</span>
                <span className="font-display font-bold text-white/70 uppercase tracking-wide"
                  style={{ fontSize: '13px' }}>{nonStrikerData.name.split(' ').slice(-1)[0]}</span>
                <span className="font-display font-bold text-white/80 tabular-nums" style={{ fontSize: '14px' }}>{nonStrikerData.runs}</span>
                <span className="font-display text-white/40 tabular-nums" style={{ fontSize: '11px' }}>{nonStrikerData.bf}</span>
              </div>
            )}
          </div>

          {/* BOWLER section */}
          {bowlerData && (
            <div className="flex items-center gap-1.5 px-4 flex-shrink-0"
              style={{ borderRight: `2px solid ${GOLD}50` }}>
              <span className="font-display font-bold text-white/70 uppercase tracking-wide"
                style={{ fontSize: '13px' }}>{bowlerData.name.split(' ').slice(-1)[0]}</span>
              <span className="font-display font-bold text-white tabular-nums" style={{ fontSize: '13px' }}>
                {bowlerData.w}-{bowlerData.r}
              </span>
              <span className="font-display text-white/50 tabular-nums" style={{ fontSize: '11px' }}>
                {getOversString(bowlerData.balls, bpo)}
              </span>
            </div>
          )}

          {/* THIS OVER section */}
          <div className="flex items-center gap-2 px-4 flex-shrink-0">
            <span className="font-display font-bold text-white/70 uppercase tracking-widest" style={{ fontSize: '10px' }}>THIS OVER</span>
            <div className="flex items-center gap-1">
              {currentOverBalls.map((e, i) => <BallDot key={i} event={e} />)}
              {Array.from({ length: Math.max(0, bpo - currentOverBalls.length) }).map((_, i) => (
                <EmptyDot key={`e-${i}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom gold line */}
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${GREEN_DARK}, ${GOLD} 30%, ${GOLD} 70%, ${GREEN_DARK})` }} />
      </div>
    );
  };

  // ===========================
  // VS BANNER
  // ===========================
  const VSBanner = () => {
    const GREEN_DARK = '#0d3b0d';
    const GREEN_MID = '#155215';
    const GOLD = '#fdd835';
    return (
      <div className={`relative w-full overflow-hidden transition-all duration-700 ${vsAnimIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${GREEN_DARK}, ${GOLD}, ${GREEN_DARK})` }} />
        <div className="relative flex items-stretch" style={{ height: '80px', background: `linear-gradient(180deg, ${GREEN_MID} 0%, ${GREEN_DARK} 100%)` }}>
          {/* Team 1 */}
          <div className={`flex items-center gap-3 flex-1 px-6 transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'}`}
            style={{ background: `linear-gradient(135deg, ${t1Color}cc, ${t1Color}44)` }}>
            <TeamBadge team={match.team1} size={48} />
            <span className="font-display font-black text-white text-xl md:text-2xl uppercase tracking-wider">{match.team1.name}</span>
          </div>
          {/* VS center */}
          <div className="flex flex-col items-center justify-center px-6 flex-shrink-0"
            style={{ background: `linear-gradient(180deg, #1a1a0a, #0d0d05)` }}>
            <span className="font-display font-black uppercase tracking-widest" style={{ fontSize: '24px', color: GOLD }}>VS</span>
            <span className="font-display text-white/50 text-[10px] uppercase tracking-widest mt-0.5">{matchTitle}</span>
          </div>
          {/* Team 2 */}
          <div className={`flex items-center gap-3 flex-1 justify-end px-6 transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}
            style={{ background: `linear-gradient(225deg, ${t2Color}cc, ${t2Color}44)` }}>
            <span className="font-display font-black text-white text-xl md:text-2xl uppercase tracking-wider">{match.team2.name}</span>
            <TeamBadge team={match.team2} size={48} />
          </div>
        </div>
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${GREEN_DARK}, ${GOLD}, ${GREEN_DARK})` }} />
      </div>
    );
  };

  // ===========================
  // SUMMARY & INFO MODES
  // ===========================
  const GOLD = '#fdd835';
  const GREEN_DARK = '#0d3b0d';

  // Batting Summary for a given innings
  const BattingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p style={{ color: '#aaa', textAlign: 'center', padding: '2rem' }}>Innings not available</p>;
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
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6), 0 0 20px rgba(0,100,0,0.3)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ background: `linear-gradient(135deg, ${btColor}dd, ${btColor}88)` }}>
          <div className="flex items-center gap-3">
            {bt.logo && <img src={bt.logo} alt={bt.name} className="w-8 h-8 object-contain drop-shadow-lg" />}
            <span className="font-display text-lg font-black text-white uppercase tracking-wider">{bt.name} — BATTING SUMMARY</span>
          </div>
          <span className="font-display text-xl font-black text-white px-3 py-0.5 rounded-md" style={{ background: 'rgba(0,0,0,0.35)' }}>{inn.runs}-{inn.wickets}</span>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        {/* Column headers */}
        <div className="px-5 py-1.5 text-[11px] text-white/40 font-bold flex tracking-wider" style={{ background: '#0d2a0d' }}>
          <span className="w-6 text-white/20 text-[10px]">#</span>
          <span className="flex-1">BATSMAN</span>
          <span className="w-36 text-center text-[10px]">DISMISSAL</span>
          <span className="w-10 text-right">R</span>
          <span className="w-10 text-right">B</span>
        </div>
        {/* All 11 player rows */}
        <div style={{ background: 'linear-gradient(180deg, #0a1f0a, #071207)' }}>
          {allSlots.map((p, idx) => {
            if (!p) {
              return (
                <div key={`empty-${idx}`} className="flex items-center px-5 border-b" style={{ height: '32px', borderColor: `rgba(253,216,53,0.06)`, background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                  <span className="w-6 text-white/10 text-[11px] font-bold tabular-nums">{idx + 1}</span>
                  <div className="flex-1 h-[1px] rounded" style={{ background: 'rgba(253,216,53,0.08)' }} />
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
                className="flex items-center px-5 border-b"
                style={{
                  height: '34px',
                  borderColor: `rgba(253,216,53,0.08)`,
                  background: isCurrentlyBatting ? 'rgba(253,216,53,0.08)' : idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
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
                {/* Dismissal */}
                <div className="w-36 text-center">
                  {hasBatted && p.isOut && (
                    <span className="text-[10px] italic truncate block" style={{ color: 'rgba(255,255,255,0.3)' }}>{p.dismissalType}{p.dismissedBy ? ` b ${p.dismissedBy}` : ''}</span>
                  )}
                </div>
                {/* Stats */}
                <span className="w-10 text-right font-display font-black text-base tabular-nums"
                  style={{ color: hasBatted ? '#ffffff' : 'rgba(255,255,255,0.15)' }}>{hasBatted ? p.runs : ''}</span>
                <span className="w-10 text-right text-sm tabular-nums"
                  style={{ color: hasBatted ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)' }}>{hasBatted ? p.ballsFaced : ''}</span>
              </div>
            );
          })}
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5" style={{ background: `linear-gradient(135deg, #1a5c1a, #0d3b0d)` }}>
          <span className="font-display text-white font-bold text-xs uppercase tracking-widest">{match.matchType}</span>
          <span className="text-white/80 text-xs font-bold">EXTRAS: {extras}</span>
          <span className="text-white/80 text-xs font-bold">{getOversString(inn.balls, match.ballsPerOver)} OV</span>
          <span className="font-display font-black text-white text-xl">{inn.runs}/{inn.wickets}</span>
        </div>
      </div>
    );
  };

  // Bowling Summary for a given innings
  const BowlingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p style={{ color: '#aaa', textAlign: 'center', padding: '2rem' }}>Innings not available</p>;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const bltColor = inn.bowlingTeamIndex === 0 ? t1Color : t2Color;
    const bowlers = blt.players.filter(p => p.bowlingBalls > 0);
    return (
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6), 0 0 20px rgba(0,100,0,0.3)' }}>
        <div className="flex items-center gap-3 px-5 py-3" style={{ background: `linear-gradient(135deg, ${bltColor}dd, ${bltColor}88)` }}>
          {blt.logo && <img src={blt.logo} alt={blt.name} className="w-8 h-8 object-contain drop-shadow-lg" />}
          <span className="font-display text-lg font-black text-white uppercase tracking-wider">{blt.name} — BOWLING SUMMARY</span>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <div className="px-5 py-2 text-[11px] text-white/40 font-bold flex tracking-wider" style={{ background: '#0d2a0d' }}>
          <span className="flex-1">BOWLER</span><span className="w-14 text-right">O</span><span className="w-14 text-right">R</span><span className="w-14 text-right">W</span><span className="w-16 text-right">ECON</span>
        </div>
        <div style={{ background: 'linear-gradient(180deg, #0a1f0a, #071207)' }}>
          {bowlers.map((p, idx) => (
            <div key={p.id} className="flex items-center px-5 py-2 border-b" style={{ borderColor: 'rgba(255,216,53,0.08)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <span className="font-display font-bold text-sm text-white flex-1 uppercase tracking-wide">{p.name}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
              <span className="w-14 text-right text-white text-sm tabular-nums">{p.bowlingRuns}</span>
              <span className="w-14 text-right font-bold text-sm tabular-nums" style={{ color: p.bowlingWickets > 0 ? '#fdd835' : 'rgba(253,216,53,0.3)' }}>{p.bowlingWickets}</span>
              <span className="w-16 text-right text-white/50 text-sm tabular-nums">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
            </div>
          ))}
          {bowlers.length === 0 && <p className="text-center py-6 text-sm font-display tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>NO BOWLING DATA YET</p>}
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      </div>
    );
  };

  // Fall of Wickets
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
      <div className="w-[90vw] max-w-[800px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6), 0 0 20px rgba(0,100,0,0.3)' }}>
        <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #b71c1cdd, #7b0a0a88)' }}>
          <span className="font-display text-lg font-black text-white tracking-wider">FALL OF WICKETS</span>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <div style={{ background: 'linear-gradient(180deg, #0a1f0a, #071207)' }}>
          {fowList.map((f: any, i: number) => (
            <div key={i} className="flex items-center px-5 py-2.5 border-b" style={{ borderColor: 'rgba(255,216,53,0.08)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
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

  // Partnership
  const Partnership = () => {
    if (!striker || !nonStriker) return (
      <div className="w-[90vw] max-w-[600px] mx-auto text-center py-8" style={{ color: 'rgba(255,255,255,0.4)' }}>Waiting for batsmen...</div>
    );
    const totalPartnership = striker.runs + nonStriker.runs;
    const strikerPct = totalPartnership > 0 ? (striker.runs / totalPartnership) * 100 : 50;
    return (
      <div className="w-[90vw] max-w-[700px] mx-auto overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6), 0 0 20px rgba(0,100,0,0.3)' }}>
        <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #2e7d32dd, #1b5e2088)' }}>
          <span className="font-display text-lg font-black text-white tracking-wider">CURRENT PARTNERSHIP</span>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <div className="py-6 px-6" style={{ background: 'linear-gradient(180deg, #0a1f0a, #071207)' }}>
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
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${strikerPct}%`, background: `linear-gradient(90deg, ${GREEN_DARK}, ${GOLD})` }} />
          </div>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      </div>
    );
  };

  // Teams / Players
  const TeamsPlayers = () => (
    <div className="w-[90vw] max-w-[800px] mx-auto grid grid-cols-2 gap-0 overflow-hidden rounded-xl" style={{ boxShadow: '0 12px 50px rgba(0,0,0,0.6)' }}>
      {[match.team1, match.team2].map((team, ti) => (
        <div key={ti} style={{ borderRight: ti === 0 ? '1px solid rgba(253,216,53,0.15)' : 'none' }}>
          <div className="px-4 py-3 text-center font-display font-black text-white uppercase text-sm flex items-center justify-center gap-2 tracking-wider"
            style={{ background: `linear-gradient(135deg, ${ti === 0 ? t1Color : t2Color}dd, ${ti === 0 ? t1Color : t2Color}88)` }}>
            {team.logo && <img src={team.logo} alt={team.name} className="w-6 h-6 object-contain" />}
            {team.name}
          </div>
          <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
          <div style={{ background: 'linear-gradient(180deg, #0a1f0a, #071207)' }}>
            {team.players.map((p, i) => (
              <div key={p.id} className="px-4 py-2 text-white text-sm border-b flex items-center gap-2"
                style={{ borderColor: 'rgba(253,216,53,0.06)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <span className="text-white/20 text-xs w-6 tabular-nums font-bold">{i + 1}.</span>
                <span className="font-display uppercase text-sm tracking-wide">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // Target Banner
  const TargetBanner = () => {
    const targetVal = s?.inIdx === 1 && s?.inn1Runs !== undefined ? s.inn1Runs + 1 : null;
    const needRuns = targetVal ? Math.max(0, targetVal - displayRuns) : null;
    const remBalls = match.overs * match.ballsPerOver - displayBalls;
    const rrr = remBalls > 0 && needRuns !== null ? ((needRuns / remBalls) * bpo).toFixed(2) : '0.00';
    if (!targetVal || !battingTeam) return <VSBanner />;
    return (
      <div className="w-full">
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${GREEN_DARK}, ${GOLD}, ${GREEN_DARK})` }} />
        <div className="relative flex items-stretch" style={{ height: '72px', background: `linear-gradient(180deg, #155215 0%, #0d3b0d 100%)` }}>
          <div className="flex-1 flex items-center justify-center gap-4 px-4">
            <span className="font-display text-lg font-black text-white uppercase">{battingTeam.name}</span>
            <div className="text-center px-5 py-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #7b1a1a, #b71c1c)', boxShadow: '0 0 15px rgba(183,28,28,0.3)' }}>
              <p className="font-display text-white font-bold text-xs uppercase">NEED <span className="text-yellow-300 text-base font-black">{needRuns}</span> FROM <span className="text-yellow-300 text-base font-black">{remBalls}</span> BALLS</p>
              <p className="text-white/50 text-[9px] font-display">RRR: <span className="text-yellow-300">{rrr}</span></p>
            </div>
            <span className="font-display text-lg font-black text-white uppercase">{bowlingTeam?.name}</span>
          </div>
        </div>
        <div style={{ height: '3px', background: `linear-gradient(90deg, ${GREEN_DARK}, ${GOLD}, ${GREEN_DARK})` }} />
      </div>
    );
  };

  // Match Summary
  const MatchSummary = () => <MatchSummaryCard match={match} theme="forest" />;


  // ===========================
  // MAIN RENDER
  // ===========================
  const isBottomAligned = display.mode === 'default' || display.mode === 'score';

  const renderContent = () => {
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
      case 'score': case 'default': default: return <DefaultScoreBar />;
    }
  };

  return (
    <div className={`w-full min-h-screen bg-transparent flex justify-center p-0 ${isBottomAligned ? 'items-end' : 'items-center'}`}>
      <div className={isBottomAligned ? 'w-full relative' : 'w-full px-2 md:px-4'}>
        {renderContent()}
        {/* Broadcast overlay banner (FOUR / SIX / WICKET) */}
        <BroadcastOverlayBanner
          overlay={display.overlay}
          onHide={() => setDisplay(prev => ({ ...prev, overlay: 'none' }))}
        />
        {/* Boundary alert (Total 4 / Total 6 card) */}
        {isBottomAligned && <BoundaryAlert snapshot={snapshot} variant="dark" barHeight={82} />}
      </div>
    </div>
  );
};

export default function Scoreboard4() {
  return (
    <Scoreboard4ErrorBoundary>
      <Scoreboard4Inner />
    </Scoreboard4ErrorBoundary>
  );
}
