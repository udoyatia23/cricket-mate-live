import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Match, getOversString, getRunRate } from '@/types/cricket';
import { getMatch } from '@/lib/store';
import { getDisplayState, useDisplaySync, DisplayState, AnimationOverlay, DisplayMode } from '@/lib/displaySync';

const Scoreboard = () => {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [display, setDisplay] = useState<DisplayState>({ mode: 'default', overlay: 'none', timestamp: 0 });
  const vsAnimDone = useRef(false);
  const [vsAnimIn, setVsAnimIn] = useState(false);

  useEffect(() => {
    if (!id) return;
    const loadMatch = () => {
      getMatch(id).then(m => setMatch(m || null));
    };
    loadMatch();
    const interval = setInterval(loadMatch, 1500);
    getDisplayState(id).then(ds => setDisplay(ds));
    const cleanup = useDisplaySync(id, setDisplay);
    return () => { clearInterval(interval); cleanup(); };
  }, [id]);

  useEffect(() => {
    if (display.mode === 'vs' && !vsAnimDone.current) {
      const t = setTimeout(() => { setVsAnimIn(true); vsAnimDone.current = true; }, 50);
      return () => clearTimeout(t);
    }
    if (display.mode !== 'vs') { vsAnimDone.current = false; setVsAnimIn(false); }
  }, [display.mode]);

  if (!match) return <div className="w-full h-screen bg-transparent" />;

  const inn1 = match.innings[0] || null;
  const inn2 = match.innings[1] || null;
  const currentInnings = match.currentInningsIndex >= 0 ? match.innings[match.currentInningsIndex] : null;
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
    const totalLegal = currentInnings.balls;
    const currentOverNum = Math.floor((totalLegal - 1) / bpo);
    const ballsInCurrentOver = totalLegal % bpo || (totalLegal > 0 ? bpo : 0);
    
    // Get recent events for this over
    const events = currentInnings.events;
    const result: typeof events = [];
    let legalCount = 0;
    for (let i = events.length - 1; i >= 0 && result.length < bpo + 6; i--) {
      result.unshift(events[i]);
      if (events[i].isLegal) legalCount++;
      if (legalCount >= ballsInCurrentOver) break;
    }
    return result;
  })();

  // Overlay config
  const getOverlayData = () => {
    if (display.overlay === 'none') return null;
    const configs: Record<AnimationOverlay, { text: string; color: string }> = {
      none: { text: '', color: '' },
      four: { text: 'FOUR!', color: '#00bcd4' },
      six: { text: 'MAXIMUM!', color: '#4caf50' },
      wicket: { text: 'WICKET!', color: '#e91e63' },
      free_hit: { text: 'FREE HIT', color: '#ff9800' },
      hat_trick: { text: 'HAT-TRICK!', color: '#f44336' },
      out: { text: 'OUT!', color: '#d32f2f' },
      not_out: { text: 'NOT OUT!', color: '#388e3c' },
    };
    return configs[display.overlay];
  };

  const overlayData = getOverlayData();

  // Lightning bolt SVG
  const LightningBolt = ({ flip = false }: { flip?: boolean }) => (
    <svg width="24" height="64" viewBox="0 0 24 64" fill="none" className="flex-shrink-0" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      <path d="M16 0L0 36h9L6 64l18-36H15L16 0z" fill="url(#boltGrad)" />
      <defs>
        <linearGradient id="boltGrad" x1="12" y1="0" x2="12" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5c842" />
          <stop offset="1" stopColor="#e88a1a" />
        </linearGradient>
      </defs>
    </svg>
  );

  // Team logo/badge component
  const TeamBadge = ({ team, color, size = 40 }: { team: typeof match.team1; color: string; size?: number }) => (
    team.logo ? (
      <img src={team.logo} alt={team.name} className="rounded-sm object-cover flex-shrink-0" style={{ width: size, height: size }} />
    ) : (
      <div className="rounded-sm flex items-center justify-center font-display font-bold text-white flex-shrink-0" style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.3 }}>
        {team.name.slice(0, 3).toUpperCase()}
      </div>
    )
  );

  // Over ball display (ICC style circles)
  const OverBallCircle = ({ event }: { event: typeof currentOverBalls[0] }) => {
    let bg = 'transparent';
    let border = 'rgba(255,255,255,0.4)';
    let text = String(event.runs);
    let textColor = '#fff';

    if (event.isWicket) {
      bg = '#e91e63'; border = '#e91e63'; text = 'W'; 
    } else if (event.runs === 6) {
      bg = '#4caf50'; border = '#4caf50';
    } else if (event.runs === 4) {
      bg = '#00bcd4'; border = '#00bcd4';
    } else if (event.type === 'wide') {
      bg = 'transparent'; border = '#ffc107'; text = 'Wd'; textColor = '#ffc107';
    } else if (event.type === 'noBall') {
      bg = 'transparent'; border = '#ffc107'; text = 'Nb'; textColor = '#ffc107';
    } else if (event.type === 'bye' || event.type === 'legBye') {
      bg = 'transparent'; border = '#90caf9'; textColor = '#90caf9';
    }

    return (
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: bg, border: `2px solid ${border}`, color: textColor }}
      >
        {text}
      </div>
    );
  };

  // ============ DEFAULT SCORE BAR (ICC Style) ============
  const DefaultScoreBar = () => {
    const need = target && currentInnings ? Math.max(0, target - currentInnings.runs) : null;
    const remainBalls = currentInnings ? (match.overs * match.ballsPerOver - currentInnings.balls) : null;

    return (
      <div className="w-full relative">
        {/* Top gold border */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        
        {/* Main bar */}
        <div className="relative flex items-stretch overflow-hidden" style={{ height: '68px' }}>
          {/* Ornamental background pattern */}
          <div className="absolute inset-0" style={{ 
            background: 'linear-gradient(180deg, #2a1f6e 0%, #1a1452 40%, #120f42 100%)',
          }}>
            {/* Circular ornamental pattern overlay */}
            <div className="absolute inset-0 opacity-[0.08]" style={{
              backgroundImage: `radial-gradient(circle 20px, rgba(255,255,255,0.3) 0%, transparent 70%)`,
              backgroundSize: '40px 40px',
            }} />
          </div>

          {/* ===== LEFT: Batting team logo ===== */}
          <div className="relative z-10 flex items-center justify-center flex-shrink-0" style={{ width: '68px', backgroundColor: batTeamColor }}>
            <TeamBadge team={battingTeam || match.team1} color={batTeamColor} size={44} />
            {/* Diagonal cut */}
            <div className="absolute -right-4 top-0 bottom-0 w-8" style={{ background: batTeamColor, clipPath: 'polygon(0 0, 60% 0, 100% 100%, 0 100%)' }} />
          </div>

          {/* Left lightning bolt */}
          <div className="relative z-20 flex items-center -ml-1 -mr-1 flex-shrink-0">
            <LightningBolt />
          </div>

          {/* ===== LEFT: Batsmen info ===== */}
          <div className="relative z-10 flex flex-col justify-center pl-3 pr-2 min-w-[160px]">
            {striker && (
              <div className="flex items-center gap-2">
                <span className="text-cyan-300 text-xs">🏏</span>
                <span className="font-display font-bold text-white text-sm uppercase tracking-wide">{striker.name.toUpperCase()}</span>
                <span className="font-display font-bold text-[#ff4081] text-lg ml-auto">{striker.runs}</span>
                <span className="text-white/50 text-xs">{striker.ballsFaced}</span>
              </div>
            )}
            {nonStriker && (
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-0">🏏</span>
                <span className="font-display text-white/70 text-sm uppercase tracking-wide">{nonStriker.name.toUpperCase()}</span>
                <span className="font-display font-semibold text-white/70 text-sm ml-auto">{nonStriker.runs}</span>
                <span className="text-white/40 text-xs">{nonStriker.ballsFaced}</span>
              </div>
            )}
          </div>

          {/* Center lightning bolt left */}
          <div className="relative z-20 flex items-center -ml-1 -mr-1 flex-shrink-0">
            <LightningBolt />
          </div>

          {/* ===== CENTER: Score, teams, target ===== */}
          <div className="relative z-10 flex flex-col items-center justify-center px-3 min-w-[200px]">
            {overlayData ? (
              <div className="px-5 py-1.5 rounded-md animate-pulse" style={{ backgroundColor: overlayData.color }}>
                <span className="font-display text-2xl font-black text-white tracking-wider drop-shadow-lg">{overlayData.text}</span>
              </div>
            ) : (
              <>
                {/* Team abbreviations */}
                <div className="flex items-center gap-1.5 text-white text-xs font-display tracking-wider">
                  <span>{(battingTeam || match.team1).name.slice(0, 3).toUpperCase()}</span>
                  <span className="text-white/40">v</span>
                  <span className="font-bold">{(bowlingTeam || match.team2).name.slice(0, 3).toUpperCase()}</span>
                </div>
                {/* Score badge + overs */}
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="px-3 py-0.5 rounded font-display font-black text-white text-xl" style={{ backgroundColor: '#e91e63' }}>
                    {currentInnings ? `${currentInnings.runs}-${currentInnings.wickets}` : '0-0'}
                  </div>
                  {currentInnings && (
                    <span className="text-white/80 text-xs font-display font-semibold tracking-wide">
                      {getOversString(currentInnings.balls, match.ballsPerOver)} <span className="text-[10px] text-white/50">OVERS</span>
                    </span>
                  )}
                </div>
                {/* Target info */}
                {need !== null && need > 0 && remainBalls !== null && (
                  <div className="text-[10px] text-white/90 font-display font-bold tracking-wider mt-0.5 uppercase">
                    NEED <span className="text-amber-300">{need}</span> MORE RUNS FROM <span className="text-amber-300">{remainBalls}</span> BALLS
                  </div>
                )}
              </>
            )}
          </div>

          {/* Center lightning bolt right */}
          <div className="relative z-20 flex items-center -ml-1 -mr-1 flex-shrink-0">
            <LightningBolt flip />
          </div>

          {/* ===== RIGHT: Bowler + This Over ===== */}
          <div className="relative z-10 flex flex-col justify-center items-end pr-2 pl-3 min-w-[160px]">
            {bowler && (
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-white text-sm uppercase tracking-wide">{bowler.name.toUpperCase()}</span>
                <span className="font-display font-bold text-[#4caf50] text-lg">{bowler.bowlingWickets}-{bowler.bowlingRuns}</span>
                <span className="text-white/50 text-xs">{getOversString(bowler.bowlingBalls, match.ballsPerOver)}</span>
              </div>
            )}
            {/* This over balls */}
            <div className="flex gap-1 mt-0.5">
              {currentOverBalls.map((e, i) => (
                <OverBallCircle key={i} event={e} />
              ))}
              {Array.from({ length: Math.max(0, match.ballsPerOver - currentOverBalls.length) }).map((_, i) => (
                <div key={`e-${i}`} className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs" style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.2)' }}>○</div>
              ))}
            </div>
          </div>

          {/* Right lightning bolt */}
          <div className="relative z-20 flex items-center -ml-1 -mr-1 flex-shrink-0">
            <LightningBolt flip />
          </div>

          {/* ===== RIGHT: Bowling team logo ===== */}
          <div className="relative z-10 flex items-center justify-center flex-shrink-0" style={{ width: '68px', backgroundColor: bowlTeamColor }}>
            {/* Diagonal cut */}
            <div className="absolute -left-4 top-0 bottom-0 w-8" style={{ background: bowlTeamColor, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 40% 100%)' }} />
            <TeamBadge team={bowlingTeam || match.team2} color={bowlTeamColor} size={44} />
          </div>
        </div>

        {/* Bottom gold border */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ VS BANNER ============
  const VSBanner = () => (
    <div className={`relative w-full overflow-hidden transition-all duration-700 ${vsAnimIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      <div className="relative flex items-stretch h-[60px]" style={{ background: 'linear-gradient(180deg, #2a1f6e 0%, #120f42 100%)' }}>
        {/* Team 1 */}
        <div className={`flex items-center relative overflow-hidden flex-1 transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'}`}>
          <div className="h-full flex items-center justify-center px-3 flex-shrink-0 relative z-10" style={{ backgroundColor: t1Color, minWidth: '60px' }}>
            <TeamBadge team={match.team1} color={t1Color} />
          </div>
          <div className="absolute left-[60px] top-0 bottom-0 w-6 z-[5]" style={{ background: t1Color, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
          <span className="relative z-10 font-display text-2xl lg:text-3xl font-black text-white uppercase tracking-[0.12em] pl-6">{match.team1.name}</span>
        </div>

        {/* Center badge */}
        <div className={`relative flex-shrink-0 flex items-center justify-center z-20 transition-all duration-700 delay-400 ${vsAnimIn ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`} style={{ width: '200px' }}>
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 z-30"><LightningBolt /></div>
          <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-30"><LightningBolt flip /></div>
          <div className="absolute inset-0">
            <svg viewBox="0 0 200 60" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="vsBadgeBg" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#2a2878" />
                  <stop offset="100%" stopColor="#141252" />
                </linearGradient>
                <linearGradient id="vsBorder" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e8a832" />
                  <stop offset="100%" stopColor="#c17a1a" />
                </linearGradient>
              </defs>
              <polygon points="20,0 180,0 200,30 180,60 20,60 0,30" fill="url(#vsBadgeBg)" stroke="url(#vsBorder)" strokeWidth="2" />
            </svg>
          </div>
          <div className="relative z-10 text-center">
            <div className="font-display text-[10px] text-amber-400 font-bold tracking-[0.2em] uppercase">{match.matchType || 'MATCH'}</div>
            <div className="font-display text-white text-sm font-black tracking-wider">MATCH #{match.matchNo || 1}</div>
            <div className="font-display text-[9px] text-white/50 tracking-widest uppercase">{match.overs} OVERS</div>
          </div>
        </div>

        {/* Team 2 */}
        <div className={`flex items-center justify-end relative overflow-hidden flex-1 transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
          <span className="relative z-10 font-display text-2xl lg:text-3xl font-black text-white uppercase tracking-[0.12em] pr-6">{match.team2.name}</span>
          <div className="absolute right-[60px] top-0 bottom-0 w-6 z-[5]" style={{ background: t2Color, clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }} />
          <div className="h-full flex items-center justify-center px-3 flex-shrink-0 relative z-10" style={{ backgroundColor: t2Color, minWidth: '60px' }}>
            <TeamBadge team={match.team2} color={t2Color} />
          </div>
        </div>
      </div>
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
    </div>
  );

  // ============ TARGET BANNER ============
  const TargetBanner = () => {
    if (!target || !currentInnings || !battingTeam) return <VSBanner />;
    const need = Math.max(0, target - currentInnings.runs);
    const remainBalls = match.overs * match.ballsPerOver - currentInnings.balls;
    const rrr = remainBalls > 0 ? ((need / remainBalls) * match.ballsPerOver).toFixed(2) : '0.00';
    return (
      <div className="w-full relative">
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="relative flex items-stretch h-14" style={{ background: 'linear-gradient(180deg, #2a1f6e 0%, #120f42 100%)' }}>
          <div className="w-2 flex-shrink-0" style={{ backgroundColor: batTeamColor }} />
          <div className="flex-1 flex items-center justify-center gap-6 px-4">
            <span className="font-display text-xl font-black text-white uppercase">{battingTeam.name}</span>
            <div className="text-center">
              <p className="font-display text-white font-bold text-sm uppercase">NEED <span className="text-amber-300 text-lg">{need}</span> RUNS FROM <span className="text-amber-300 text-lg">{remainBalls}</span> BALLS</p>
              <p className="text-white/60 text-xs font-display">REQ. RR: <span className="text-amber-300">{rrr}</span></p>
            </div>
            <span className="font-display text-xl font-black text-white uppercase">{bowlingTeam?.name}</span>
          </div>
          <div className="w-2 flex-shrink-0" style={{ backgroundColor: bowlTeamColor }} />
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ BATTING SUMMARY ============
  const BattingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-white text-center p-8">Innings not available</p>;
    const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const extras = inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes;
    return (
      <div className="w-full max-w-2xl mx-auto overflow-hidden rounded-sm" style={{ background: 'linear-gradient(180deg, #2a1f6e 0%, #120f42 100%)' }}>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <TeamBadge team={bt} color={bt.color || t1Color} size={28} />
            <span className="font-display text-lg font-black text-white uppercase">{bt.name} - BATTING</span>
          </div>
          <div className="font-display text-xl font-black text-white px-3 py-0.5 rounded" style={{ backgroundColor: '#e91e63' }}>
            {inn.runs}-{inn.wickets}
          </div>
        </div>
        <div className="px-4 py-1 text-[10px] text-white/50 font-bold flex border-b border-white/10">
          <span className="flex-1">BATSMAN</span>
          <span className="w-10 text-right">R</span>
          <span className="w-10 text-right">B</span>
          <span className="w-8 text-right">4s</span>
          <span className="w-8 text-right">6s</span>
        </div>
        {bt.players.map(p => {
          const isNotOut = !p.isOut && (p.id === inn.currentStrikerId || p.id === inn.currentNonStrikerId || (inn.isComplete && !p.isOut && p.ballsFaced > 0));
          const hasBatted = p.ballsFaced > 0 || p.isOut;
          if (!hasBatted) return null;
          return (
            <div key={p.id} className={`flex items-center px-4 py-1.5 border-b border-white/5 ${isNotOut ? 'bg-[#e91e63]/30' : ''}`}>
              <div className="flex-1 min-w-0">
                <span className="font-display font-bold text-sm text-white uppercase">{p.name}</span>
                {p.isOut && <span className="text-white/40 text-[10px] ml-2">{p.dismissalType} {p.dismissedBy ? `b ${p.dismissedBy}` : ''}</span>}
                {isNotOut && <span className="text-[#4caf50] text-[10px] ml-2 font-bold">NOT OUT</span>}
              </div>
              <span className="w-10 text-right font-display font-bold text-white text-sm">{p.runs}</span>
              <span className="w-10 text-right text-white/60 text-xs">{p.ballsFaced}</span>
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
      <div className="w-full max-w-2xl mx-auto overflow-hidden rounded-sm" style={{ background: 'linear-gradient(180deg, #2a1f6e 0%, #120f42 100%)' }}>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="flex items-center gap-2 px-4 py-2">
          <TeamBadge team={blt} color={blt.color || t2Color} size={28} />
          <span className="font-display text-lg font-black text-white uppercase">{blt.name} - BOWLING</span>
        </div>
        <div className="px-4 py-1 text-[10px] text-white/50 font-bold flex border-b border-white/10">
          <span className="flex-1">BOWLER</span>
          <span className="w-12 text-right">O</span>
          <span className="w-12 text-right">R</span>
          <span className="w-12 text-right">W</span>
          <span className="w-14 text-right">ECON</span>
        </div>
        {bowlers.map(p => (
          <div key={p.id} className="flex items-center px-4 py-1.5 border-b border-white/5">
            <span className="font-display font-bold text-sm text-white flex-1 uppercase">{p.name}</span>
            <span className="w-12 text-right text-white text-sm">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
            <span className="w-12 text-right text-white text-sm">{p.bowlingRuns}</span>
            <span className="w-12 text-right text-[#e91e63] font-bold text-sm">{p.bowlingWickets}</span>
            <span className="w-14 text-right text-white/60 text-sm">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
          </div>
        ))}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ FALL OF WICKETS ============
  const FallOfWickets = () => {
    if (!currentInnings) return null;
    let runningScore = 0;
    let runningBalls = 0;
    const fowList = currentInnings.events.map(e => {
      if (e.isLegal) runningBalls++;
      runningScore += e.runs;
      if (e.isWicket) {
        const batsman = battingTeam?.players.find(p => p.id === e.batsmanId);
        return { name: batsman?.name || '?', score: runningScore, overs: getOversString(runningBalls, match.ballsPerOver) };
      }
      return null;
    }).filter(Boolean);
    return (
      <div className="w-full max-w-2xl mx-auto overflow-hidden rounded-sm" style={{ background: 'linear-gradient(180deg, #2a1f6e 0%, #120f42 100%)' }}>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="px-4 py-2">
          <span className="font-display text-lg font-black text-white">FALL OF WICKETS</span>
        </div>
        {fowList.map((f: any, i: number) => (
          <div key={i} className="flex items-center px-4 py-1.5 border-b border-white/5 text-white">
            <span className="w-8 text-sm font-bold text-[#e91e63]">{i + 1}.</span>
            <span className="flex-1 font-display font-semibold uppercase text-sm">{f.name}</span>
            <span className="font-bold">{f.score}</span>
            <span className="text-white/50 text-xs ml-2">({f.overs})</span>
          </div>
        ))}
        {fowList.length === 0 && <p className="text-center text-white/40 py-4 text-sm font-display">NO WICKETS FALLEN YET</p>}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ PARTNERSHIP ============
  const Partnership = () => {
    if (!striker || !nonStriker) return <p className="text-white text-center p-4 font-display">NO ACTIVE PARTNERSHIP</p>;
    return (
      <div className="w-full max-w-2xl mx-auto overflow-hidden rounded-sm" style={{ background: 'linear-gradient(180deg, #2a1f6e 0%, #120f42 100%)' }}>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        <div className="px-4 py-2"><span className="font-display text-lg font-black text-white">CURRENT PARTNERSHIP</span></div>
        <div className="flex items-center justify-around py-4 px-4">
          <div className="text-center">
            <p className="font-display font-bold text-lg text-white uppercase">{striker.name}</p>
            <p className="text-3xl font-black text-[#4caf50] font-display">{striker.runs}</p>
            <p className="text-white/50 text-xs">({striker.ballsFaced} balls)</p>
          </div>
          <div className="text-center">
            <p className="text-amber-400 text-xs font-display font-bold tracking-widest">PARTNERSHIP</p>
            <p className="font-display text-4xl font-black text-white">{striker.runs + nonStriker.runs}</p>
          </div>
          <div className="text-center">
            <p className="font-display font-bold text-lg text-white uppercase">{nonStriker.name}</p>
            <p className="text-3xl font-black text-[#4caf50] font-display">{nonStriker.runs}</p>
            <p className="text-white/50 text-xs">({nonStriker.ballsFaced} balls)</p>
          </div>
        </div>
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      </div>
    );
  };

  // ============ TEAMS ============
  const TeamsPlayers = () => (
    <div className="w-full max-w-2xl mx-auto grid grid-cols-2 gap-0 overflow-hidden rounded-sm" style={{ background: 'linear-gradient(180deg, #2a1f6e 0%, #120f42 100%)' }}>
      {[match.team1, match.team2].map((team, ti) => (
        <div key={ti} className={ti === 0 ? 'border-r border-white/10' : ''}>
          <div className="px-3 py-2 text-center font-display font-black text-white uppercase text-sm flex items-center justify-center gap-2" style={{ backgroundColor: ti === 0 ? t1Color : t2Color }}>
            <TeamBadge team={team} color={ti === 0 ? t1Color : t2Color} size={24} />
            {team.name}
          </div>
          {team.players.map((p, i) => (
            <div key={p.id} className="px-3 py-1.5 text-white text-sm border-b border-white/5 flex items-center gap-2">
              <span className="text-white/40 text-xs w-5">{i + 1}.</span>
              <span className="font-display uppercase">{p.name}</span>
            </div>
          ))}
          {team.players.length === 0 && <p className="text-center text-white/30 py-4 text-sm font-display">NO PLAYERS</p>}
        </div>
      ))}
    </div>
  );

  // ============ MATCH SUMMARY ============
  const MatchSummary = () => (
    <div className="w-full max-w-2xl mx-auto overflow-hidden rounded-sm" style={{ background: 'linear-gradient(180deg, #2a1f6e 0%, #120f42 100%)' }}>
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
      <div className="px-4 py-2"><span className="font-display text-lg font-black text-white">MATCH SUMMARY</span></div>
      <div className="space-y-2 text-white text-sm px-4 pb-4">
        <p><span className="text-white/50">Toss:</span> <span className="font-display font-bold">{match.tossWonBy === 0 ? match.team1.name : match.team2.name}</span> won, opted to <span className="font-bold">{match.optedTo}</span></p>
        {match.innings.map((inn, idx) => {
          const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
          return <p key={idx}><span className="text-white/50">{bt.name}:</span> <span className="font-display font-bold">{inn.runs}/{inn.wickets}</span> ({getOversString(inn.balls, match.ballsPerOver)} ov)</p>;
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
      case 'score':
      case 'default':
      default: return <DefaultScoreBar />;
    }
  };

  return (
    <div className="w-full min-h-screen bg-transparent flex items-end justify-center p-0">
      <div className="w-full max-w-5xl">
        {renderContent()}
      </div>
    </div>
  );
};

export default Scoreboard;
