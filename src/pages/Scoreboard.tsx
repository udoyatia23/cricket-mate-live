import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Match, BallEvent, getOversString, getRunRate } from '@/types/cricket';
import { getMatch } from '@/lib/store';
import { getDisplayState, DisplayState, AnimationOverlay, DisplayMode } from '@/lib/displaySync';
import { supabase } from '@/integrations/supabase/client';
import { ScoreboardSnapshot } from '@/lib/broadcastTypes';

const Scoreboard = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [display, setDisplay] = useState<DisplayState>({ mode: 'default', overlay: 'none', timestamp: 0 });
  const vsAnimDone = useRef(false);
  const [vsAnimIn, setVsAnimIn] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const loadMatch = async () => {
      try {
        const m = await getMatch(id);
        if (mounted && m) setMatch(m);
      } catch (e) { console.error('Failed to load match:', e); }
    };

    const loadDisplay = async () => {
      try {
        const ds = await getDisplayState(id);
        if (mounted) setDisplay(ds);
      } catch (e) { console.error(e); }
    };

    // Initial load
    loadMatch();
    loadDisplay();

    // Helper: apply snapshot to match state
    const applySnapshot = (snap: ScoreboardSnapshot) => {
      if (snap.overlay && snap.overlay !== 'none') {
        setDisplay(prev => ({ ...prev, overlay: snap.overlay! }));
      }
      setMatch(prev => {
        if (!prev) return prev;
        const m = JSON.parse(JSON.stringify(prev)) as Match;
        m.status = snap.status as Match['status'];
        m.winner = snap.winner;
        m.winMargin = snap.winMargin;
        m.currentInningsIndex = snap.inIdx;
        m.team1.name = snap.t1.name;
        m.team1.color = snap.t1.color;
        if (snap.t1.logo) m.team1.logo = snap.t1.logo;
        m.team2.name = snap.t2.name;
        m.team2.color = snap.t2.color;
        if (snap.t2.logo) m.team2.logo = snap.t2.logo;
        const inn = m.innings[snap.inIdx];
        if (inn) {
          inn.runs = snap.inn.runs;
          inn.wickets = snap.inn.wickets;
          inn.balls = snap.inn.balls;
          if (snap.ov.length > 0) {
            const existingIds = new Set(inn.events.map(e => e.id));
            const newEvents = snap.ov.filter(e => !existingIds.has(e.id));
            inn.events.push(...newEvents);
          }
          const batTeam = inn.battingTeamIndex === 0 ? m.team1 : m.team2;
          const bowlTeam = inn.bowlingTeamIndex === 0 ? m.team1 : m.team2;
          if (snap.s) {
            const sp = batTeam.players.find(p => p.name === snap.s!.name);
            if (sp) { sp.runs = snap.s.runs; sp.ballsFaced = snap.s.bf; inn.currentStrikerId = sp.id; }
          }
          if (snap.ns) {
            const nsp = batTeam.players.find(p => p.name === snap.ns!.name);
            if (nsp) { nsp.runs = snap.ns.runs; nsp.ballsFaced = snap.ns.bf; inn.currentNonStrikerId = nsp.id; }
          }
          if (snap.b) {
            const bp = bowlTeam.players.find(p => p.name === snap.b!.name);
            if (bp) { bp.bowlingWickets = snap.b.w; bp.bowlingRuns = snap.b.r; bp.bowlingBalls = snap.b.balls; inn.currentBowlerId = bp.id; }
          }
        }
        return m;
      });
    };

    // PRIMARY: Listen to score_live table (tiny table = instant postgres_changes)
    const scoreLiveCh = supabase
      .channel(`score-live-${id}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'score_live', filter: `match_id=eq.${id}` },
        (payload) => {
          if (!mounted) return;
          const row = payload.new as any;
          if (row?.snapshot) {
            applySnapshot(row.snapshot as ScoreboardSnapshot);
          }
        }
      )
      .subscribe();

    // SECONDARY: Broadcast (bonus, may or may not arrive)
    const broadcastCh = supabase
      .channel(`broadcast-${id}`)
      .on('broadcast', { event: 'match_update' }, (payload) => {
        if (!mounted) return;
        const data = payload.payload;
        if (data?.snapshot) {
          applySnapshot(data.snapshot as ScoreboardSnapshot);
          return;
        }
        if (data?.match_data) {
          setMatch({ ...data.match_data, id } as unknown as Match);
        }
        if (data?.display_state) {
          setDisplay(prev => ({ ...prev, ...data.display_state }));
        }
      })
      .subscribe();

    // BACKUP: Postgres changes on matches table (slow but reliable)
    const pgCh = supabase
      .channel(`pg-${id}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${id}` },
        (payload) => {
          if (!mounted) return;
          const row = payload.new as any;
          if (row?.match_data) {
            setMatch({ ...row.match_data, id } as unknown as Match);
          }
          if (row?.display_state) {
            setDisplay(row.display_state as DisplayState);
          }
        }
      )
      .subscribe();

    // Safety poll every 30s
    // Poll every 5s as backup (realtime via score_live should be instant)
    fallbackTimer = setInterval(loadMatch, 5000);

    return () => {
      mounted = false;
      if (fallbackTimer) clearInterval(fallbackTimer);
      supabase.removeChannel(scoreLiveCh);
      supabase.removeChannel(broadcastCh);
      supabase.removeChannel(pgCh);
    };
  }, [id]);

  useEffect(() => {
    if (display.mode === 'vs' && !vsAnimDone.current) {
      const t = setTimeout(() => { setVsAnimIn(true); vsAnimDone.current = true; }, 50);
      return () => clearTimeout(t);
    }
    if (display.mode !== 'vs') { vsAnimDone.current = false; setVsAnimIn(false); }
  }, [display.mode]);

  if (!match) return <div className="w-full h-screen bg-transparent" />;

  const currentInnings = match.currentInningsIndex >= 0 ? match.innings[match.currentInningsIndex] : null;
  const inn1 = match.innings[0] || null;
  const battingTeam = currentInnings ? (currentInnings.battingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const bowlingTeam = currentInnings ? (currentInnings.bowlingTeamIndex === 0 ? match.team1 : match.team2) : null;
  const striker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentStrikerId) : null;
  const nonStriker = currentInnings && battingTeam ? battingTeam.players.find(p => p.id === currentInnings.currentNonStrikerId) : null;
  const bowler = currentInnings && bowlingTeam ? bowlingTeam.players.find(p => p.id === currentInnings.currentBowlerId) : null;
  const target = match.currentInningsIndex === 1 && inn1 ? inn1.runs + 1 : null;
  const t1Color = match.team1.color || '#c62828';
  const t2Color = match.team2.color || '#1565c0';
  const batTeamColor = currentInnings ? (currentInnings.battingTeamIndex === 0 ? t1Color : t2Color) : t1Color;
  const bowlTeamColor = currentInnings ? (currentInnings.bowlingTeamIndex === 0 ? t1Color : t2Color) : t2Color;

  // Current over balls
  const currentOverBalls = (() => {
    if (!currentInnings) return [];
    const bpo = match.ballsPerOver;
    const ballsInOver = currentInnings.balls % bpo || (currentInnings.balls > 0 ? bpo : 0);
    const events = currentInnings.events;
    const result: typeof events = [];
    let legalCount = 0;
    for (let i = events.length - 1; i >= 0 && result.length < bpo + 6; i--) {
      result.unshift(events[i]);
      if (events[i].isLegal) legalCount++;
      if (legalCount >= ballsInOver) break;
    }
    return result;
  })();

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
    const need = target && currentInnings ? Math.max(0, target - currentInnings.runs) : null;
    const remainBalls = currentInnings ? (match.overs * match.ballsPerOver - currentInnings.balls) : null;

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

          {/* LEFT: Batsmen info */}
          <div className="relative z-10 flex flex-col justify-center px-3 flex-1 min-w-0" style={{ maxWidth: '280px' }}>
            {striker && (
              <div className="flex items-center gap-1.5">
                <span className="text-cyan-300 text-sm font-bold">/</span>
                <span className="font-display font-bold text-white text-[13px] uppercase tracking-wide flex-1 truncate">{striker.name}</span>
                <span className="font-display font-black text-[#e91e63] text-lg tabular-nums">{striker.runs}</span>
                <span className="text-white/50 text-[11px] tabular-nums w-6 text-right">{striker.ballsFaced}</span>
              </div>
            )}
            {nonStriker && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm opacity-0">/</span>
                <span className="font-display text-white/70 text-[13px] uppercase tracking-wide flex-1 truncate">{nonStriker.name}</span>
                <span className="font-display font-bold text-[#e91e63] text-sm tabular-nums">{nonStriker.runs}</span>
                <span className="text-white/40 text-[11px] tabular-nums w-6 text-right">{nonStriker.ballsFaced}</span>
              </div>
            )}
          </div>

          {/* Chevron 2 */}
          <ChevronSeparator />

          {/* CENTER: Score info */}
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
                    {(battingTeam || match.team1).name.slice(0, 3).toUpperCase()}
                    <span className="text-white/40 mx-1">v</span>
                    <span className="font-bold text-white">{(bowlingTeam || match.team2).name.slice(0, 3).toUpperCase()}</span>
                  </span>
                  <div className="px-3 py-0.5 rounded font-display font-black text-white text-lg tabular-nums" style={{ backgroundColor: '#e91e63' }}>
                    {currentInnings ? `${currentInnings.runs}-${currentInnings.wickets}` : '0-0'}
                  </div>
                  {currentInnings && (
                    <span className="text-white/70 text-[12px] font-display">
                      <span className="font-bold tabular-nums">{getOversString(currentInnings.balls, match.ballsPerOver)}</span>
                      <span className="text-[10px] text-white/40 ml-1 tracking-wider">OVERS</span>
                    </span>
                  )}
                </div>
                {/* Bottom row: target or toss */}
                <div className="text-[11px] text-white/80 font-display font-bold tracking-wider mt-0.5 uppercase">
                  {need !== null && need > 0 && remainBalls !== null ? (
                    <>NEED <span className="text-amber-300">{need}</span> MORE RUNS FROM <span className="text-amber-300">{remainBalls}</span> BALLS</>
                  ) : match.status === 'finished' && match.winner ? (
                    <span className="text-amber-300">{match.winner} WON</span>
                  ) : (
                    <span className="text-white/40">
                      {match.tossWonBy === 0 ? match.team1.name.toUpperCase() : match.team2.name.toUpperCase()} WON THE TOSS
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Chevron 3 */}
          <ChevronSeparator />

          {/* RIGHT: Bowler + Over balls */}
          <div className="relative z-10 flex flex-col justify-center px-3 flex-1 min-w-0" style={{ maxWidth: '280px' }}>
            {bowler && (
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-white text-[13px] uppercase tracking-wide flex-1 truncate">{bowler.name}</span>
                <span className="font-display font-black text-[#4caf50] text-lg tabular-nums">{bowler.bowlingWickets}-{bowler.bowlingRuns}</span>
                <span className="text-white/50 text-[11px] tabular-nums">{getOversString(bowler.bowlingBalls, match.ballsPerOver)}</span>
              </div>
            )}
            {/* This over balls */}
            <div className="flex gap-1 mt-1">
              {currentOverBalls.map((e, i) => <BallCircle key={i} event={e} />)}
              {Array.from({ length: Math.max(0, match.ballsPerOver - currentOverBalls.length) }).map((_, i) => <EmptyBall key={`e-${i}`} />)}
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
    return (
      <div className="w-full max-w-3xl mx-auto overflow-hidden" style={{ background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <TeamFlag team={bt} size={24} />
            <span className="font-display text-base font-black text-white uppercase">{bt.name} - BATTING</span>
          </div>
          <div className="font-display text-lg font-black text-white px-3 py-0.5 rounded" style={{ backgroundColor: '#e91e63' }}>{inn.runs}-{inn.wickets}</div>
        </div>
        <div className="px-4 py-1 text-[10px] text-white/40 font-bold flex border-b border-white/10">
          <span className="flex-1">BATSMAN</span><span className="w-10 text-right">R</span><span className="w-10 text-right">B</span><span className="w-8 text-right">4s</span><span className="w-8 text-right">6s</span>
        </div>
        {bt.players.map(p => {
          const isNotOut = !p.isOut && (p.id === inn.currentStrikerId || p.id === inn.currentNonStrikerId || (inn.isComplete && !p.isOut && p.ballsFaced > 0));
          const hasBatted = p.ballsFaced > 0 || p.isOut;
          if (!hasBatted) return null;
          return (
            <div key={p.id} className={`flex items-center px-4 py-1.5 border-b border-white/5 ${isNotOut ? 'bg-[#e91e63]/25' : ''}`}>
              <div className="flex-1 min-w-0">
                <span className="font-display font-bold text-[13px] text-white uppercase">{p.name}</span>
                {p.isOut && <span className="text-white/35 text-[10px] ml-2">{p.dismissalType} {p.dismissedBy ? `b ${p.dismissedBy}` : ''}</span>}
                {isNotOut && <span className="text-[#4caf50] text-[10px] ml-2 font-bold">NOT OUT</span>}
              </div>
              <span className="w-10 text-right font-display font-bold text-white text-sm">{p.runs}</span>
              <span className="w-10 text-right text-white/50 text-xs">{p.ballsFaced}</span>
              <span className="w-8 text-right text-[#00bcd4] text-xs font-bold">{p.fours}</span>
              <span className="w-8 text-right text-[#4caf50] text-xs font-bold">{p.sixes}</span>
            </div>
          );
        })}
        <div className="flex items-center justify-between px-4 py-2" style={{ background: 'linear-gradient(90deg, #e91e63, #e8a832)' }}>
          <span className="font-display text-white font-bold text-xs uppercase">{match.matchType}</span>
          <span className="text-white text-xs font-bold">EXTRAS: {extras}</span>
          <span className="text-white text-xs font-bold">{getOversString(inn.balls, match.ballsPerOver)} OV</span>
          <span className="font-display font-black text-white text-lg">{inn.runs}/{inn.wickets}</span>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ BOWLING SUMMARY ============
  const BowlingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-white text-center p-8">Innings not available</p>;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const bowlers = blt.players.filter(p => p.bowlingBalls > 0);
    return (
      <div className="w-full max-w-3xl mx-auto overflow-hidden" style={{ background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="flex items-center gap-2 px-4 py-2">
          <TeamFlag team={blt} size={24} />
          <span className="font-display text-base font-black text-white uppercase">{blt.name} - BOWLING</span>
        </div>
        <div className="px-4 py-1 text-[10px] text-white/40 font-bold flex border-b border-white/10">
          <span className="flex-1">BOWLER</span><span className="w-12 text-right">O</span><span className="w-12 text-right">R</span><span className="w-12 text-right">W</span><span className="w-14 text-right">ECON</span>
        </div>
        {bowlers.map(p => (
          <div key={p.id} className="flex items-center px-4 py-1.5 border-b border-white/5">
            <span className="font-display font-bold text-[13px] text-white flex-1 uppercase">{p.name}</span>
            <span className="w-12 text-right text-white text-sm">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
            <span className="w-12 text-right text-white text-sm">{p.bowlingRuns}</span>
            <span className="w-12 text-right text-[#e91e63] font-bold text-sm">{p.bowlingWickets}</span>
            <span className="w-14 text-right text-white/50 text-sm">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
          </div>
        ))}
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
      <div className="w-full max-w-3xl mx-auto overflow-hidden" style={{ background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="px-4 py-2"><span className="font-display text-base font-black text-white">FALL OF WICKETS</span></div>
        {fowList.map((f: any, i: number) => (
          <div key={i} className="flex items-center px-4 py-1.5 border-b border-white/5 text-white">
            <span className="w-8 text-sm font-bold text-[#e91e63]">{i + 1}.</span>
            <span className="flex-1 font-display font-semibold uppercase text-[13px]">{f.name}</span>
            <span className="font-bold">{f.score}</span>
            <span className="text-white/40 text-xs ml-2">({f.overs})</span>
          </div>
        ))}
        {fowList.length === 0 && <p className="text-center text-white/30 py-4 text-sm font-display">NO WICKETS YET</p>}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ PARTNERSHIP ============
  const Partnership = () => {
    if (!striker || !nonStriker) return null;
    return (
      <div className="w-full max-w-3xl mx-auto overflow-hidden" style={{ background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="px-4 py-2"><span className="font-display text-base font-black text-white">CURRENT PARTNERSHIP</span></div>
        <div className="flex items-center justify-around py-4 px-4">
          <div className="text-center"><p className="font-display font-bold text-base text-white uppercase">{striker.name}</p><p className="text-3xl font-black text-[#4caf50] font-display">{striker.runs}</p><p className="text-white/40 text-xs">({striker.ballsFaced})</p></div>
          <div className="text-center"><p className="text-amber-400 text-[10px] font-display font-bold tracking-widest">PARTNERSHIP</p><p className="font-display text-4xl font-black text-white">{striker.runs + nonStriker.runs}</p></div>
          <div className="text-center"><p className="font-display font-bold text-base text-white uppercase">{nonStriker.name}</p><p className="text-3xl font-black text-[#4caf50] font-display">{nonStriker.runs}</p><p className="text-white/40 text-xs">({nonStriker.ballsFaced})</p></div>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ TEAMS ============
  const TeamsPlayers = () => (
    <div className="w-full max-w-3xl mx-auto grid grid-cols-2 gap-0 overflow-hidden" style={{ background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
      {[match.team1, match.team2].map((team, ti) => (
        <div key={ti} className={ti === 0 ? 'border-r border-white/10' : ''}>
          <div className="px-3 py-2 text-center font-display font-black text-white uppercase text-sm flex items-center justify-center gap-2" style={{ backgroundColor: ti === 0 ? t1Color : t2Color }}>
            <TeamFlag team={team} size={20} />{team.name}
          </div>
          {team.players.map((p, i) => (
            <div key={p.id} className="px-3 py-1.5 text-white text-sm border-b border-white/5 flex items-center gap-2">
              <span className="text-white/30 text-xs w-5">{i + 1}.</span><span className="font-display uppercase text-[13px]">{p.name}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  // ============ SUMMARY ============
  const MatchSummary = () => (
    <div className="w-full max-w-3xl mx-auto overflow-hidden" style={{ background: 'linear-gradient(180deg, #2d2272 0%, #150f50 100%)' }}>
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      <div className="px-4 py-2"><span className="font-display text-base font-black text-white">MATCH SUMMARY</span></div>
      <div className="space-y-2 text-white text-sm px-4 pb-4">
        <p><span className="text-white/40">Toss:</span> <span className="font-display font-bold">{match.tossWonBy === 0 ? match.team1.name : match.team2.name}</span> won, opted to <span className="font-bold">{match.optedTo}</span></p>
        {match.innings.map((inn, idx) => {
          const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
          return <p key={idx}><span className="text-white/40">{bt.name}:</span> <span className="font-display font-bold">{inn.runs}/{inn.wickets}</span> ({getOversString(inn.balls, match.ballsPerOver)} ov)</p>;
        })}
        {match.winner && <p className="text-amber-300 font-display font-black text-xl mt-3">{match.winner} won by {match.winMargin}</p>}
      </div>
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
    </div>
  );

  // ============ RENDER ============
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
    <div className="w-full min-h-screen bg-transparent flex items-end justify-center p-0">
      <div className="w-full">
        {renderContent()}
      </div>
    </div>
  );
};

export default Scoreboard;
