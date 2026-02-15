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

  // This over balls for bowler display
  const currentOverBalls = currentInnings ? currentInnings.events.filter(e => {
    const overStart = Math.floor((currentInnings.balls - 1) / match.ballsPerOver) * match.ballsPerOver;
    return currentInnings.events.indexOf(e) >= currentInnings.events.length - (currentInnings.balls % match.ballsPerOver || match.ballsPerOver);
  }).slice(-match.ballsPerOver) : [];

  const OverBallsDisplay = () => (
    <div className="flex gap-1">
      {currentOverBalls.map((e, i) => (
        <span key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border
          ${e.isWicket ? 'bg-red-600 border-red-400 text-white' : e.type === 'wide' || e.type === 'noBall' ? 'bg-yellow-600 border-yellow-400 text-white' : e.runs === 4 ? 'bg-blue-500 border-blue-300 text-white' : e.runs === 6 ? 'bg-green-500 border-green-300 text-white' : 'bg-transparent border-white/50 text-white'}`}>
          {e.isWicket ? 'W' : e.type === 'wide' ? 'Wd' : e.type === 'noBall' ? 'Nb' : e.runs}
        </span>
      ))}
      {Array.from({ length: Math.max(0, match.ballsPerOver - currentOverBalls.length) }).map((_, i) => (
        <span key={`e-${i}`} className="w-6 h-6 rounded-full border border-white/30 flex items-center justify-center text-xs text-white/30">○</span>
      ))}
    </div>
  );

  // Overlay component
  const renderOverlay = () => {
    if (display.overlay === 'none') return null;
    const overlayConfig: Record<AnimationOverlay, { text: string; bg: string; textColor: string }> = {
      none: { text: '', bg: '', textColor: '' },
      four: { text: 'FOUR', bg: 'bg-gradient-to-r from-cyan-400 to-cyan-300', textColor: 'text-white' },
      six: { text: 'SIX', bg: 'bg-gradient-to-r from-green-400 to-emerald-500', textColor: 'text-white' },
      wicket: { text: 'WICKET', bg: 'bg-gradient-to-r from-pink-500 to-rose-500', textColor: 'text-white' },
      free_hit: { text: 'FREE HIT', bg: 'bg-gradient-to-r from-yellow-400 to-orange-500', textColor: 'text-white' },
      hat_trick: { text: 'HAT-TRICK BALL', bg: 'bg-gradient-to-r from-red-600 to-pink-600', textColor: 'text-white' },
      out: { text: 'OUT', bg: 'bg-gradient-to-r from-red-600 to-red-700', textColor: 'text-white' },
      not_out: { text: 'NOT OUT', bg: 'bg-gradient-to-r from-green-600 to-green-700', textColor: 'text-white' },
    };
    const cfg = overlayConfig[display.overlay];
    return cfg;
  };

  const overlayData = renderOverlay();

  // Default Score Bar - broadcast style
  const DefaultScoreBar = () => (
    <div className="w-full">
      {/* Main score bar */}
      <div className="relative flex items-stretch h-16 border-y-2 border-amber-500" style={{ background: 'linear-gradient(180deg, #1a1a4e 0%, #0d0d3b 100%)' }}>
        {/* Left Team Color Strip */}
        <div className="w-2 flex-shrink-0" style={{ backgroundColor: t1Color }} />
        
        {/* Left - Batting Info */}
        <div className="flex items-center gap-3 px-3 flex-1 min-w-0">
          {/* Team indicator */}
          {battingTeam?.logo ? (
            <img src={battingTeam.logo} alt={battingTeam.name} className="w-10 h-10 rounded flex-shrink-0 object-cover" />
          ) : (
            <div className="w-10 h-10 rounded flex-shrink-0 flex items-center justify-center font-display font-bold text-white text-sm" style={{ backgroundColor: t1Color }}>
              {battingTeam?.name.slice(0, 3).toUpperCase()}
            </div>
          )}
          {/* Batsmen */}
          <div className="text-white text-sm leading-tight min-w-0">
            {striker && (
              <div className="flex items-center gap-2">
                <span className="font-bold">✓ {striker.name.toUpperCase()}</span>
                <span className="font-bold text-lg">{striker.runs}</span>
                <span className="text-white/60 text-xs">{striker.ballsFaced}</span>
              </div>
            )}
            {nonStriker && (
              <div className="flex items-center gap-2">
                <span className="text-white/80">{nonStriker.name.toUpperCase()}</span>
                <span className="font-semibold">{nonStriker.runs}</span>
                <span className="text-white/60 text-xs">{nonStriker.ballsFaced}</span>
              </div>
            )}
          </div>
        </div>

        {/* Center - Score or Overlay */}
        <div className="flex flex-col items-center justify-center px-4 min-w-[180px]">
          {overlayData ? (
            <div className={`px-6 py-1 rounded ${overlayData.bg}`}>
              <span className={`font-display text-3xl font-bold ${overlayData.textColor} tracking-wider`}>{overlayData.text}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-white text-xs">
                <span>{match.team1.name.slice(0, 3).toUpperCase()} v <span className="font-bold">{match.team2.name.slice(0, 3).toUpperCase()}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-green-500 text-white font-bold px-3 py-0.5 rounded text-lg font-display">
                  {currentInnings ? `${currentInnings.runs}-${currentInnings.wickets}` : '0-0'}
                </span>
                {currentInnings && (
                  <span className="text-white text-xs">
                    {getOversString(currentInnings.balls, match.ballsPerOver)} OVERS
                  </span>
                )}
              </div>
              {target && currentInnings && (
                <div className="text-amber-300 text-[10px] font-bold uppercase">
                  {battingTeam?.name} NEED {Math.max(0, target - currentInnings.runs)} RUNS
                </div>
              )}
            </>
          )}
        </div>

        {/* Right - Bowling Info */}
        <div className="flex items-center gap-3 px-3 flex-1 min-w-0 justify-end">
          <div className="text-white text-sm text-right leading-tight">
            {bowler && (
              <>
                <div className="font-bold">{bowler.name.toUpperCase()}</div>
                <div className="flex items-center gap-2 justify-end">
                  <span className="font-semibold">{bowler.bowlingWickets}-{bowler.bowlingRuns}</span>
                  <span className="text-white/60 text-xs">{getOversString(bowler.bowlingBalls, match.ballsPerOver)}</span>
                </div>
              </>
            )}
            <OverBallsDisplay />
          </div>
          {bowlingTeam?.logo ? (
            <img src={bowlingTeam.logo} alt={bowlingTeam.name} className="w-10 h-10 rounded flex-shrink-0 object-cover" />
          ) : (
            <div className="w-10 h-10 rounded flex-shrink-0 flex items-center justify-center font-display font-bold text-white text-sm" style={{ backgroundColor: t2Color }}>
              {bowlingTeam?.name.slice(0, 3).toUpperCase()}
            </div>
          )}
        </div>

        {/* Right Team Color Strip */}
        <div className="w-2 flex-shrink-0" style={{ backgroundColor: t2Color }} />
        
        {/* Decorative lightning bolts */}
        <div className="absolute left-[28%] top-0 bottom-0 flex items-center pointer-events-none">
          <span className="text-amber-500 text-2xl font-bold">⚡</span>
        </div>
        <div className="absolute right-[28%] top-0 bottom-0 flex items-center pointer-events-none">
          <span className="text-amber-500 text-2xl font-bold">⚡</span>
        </div>
      </div>
    </div>
  );

  // VS Banner - ICC Broadcast Style

  const VSBanner = () => {

    return (
      <div className={`relative w-full overflow-hidden transition-all duration-700 ${vsAnimIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Thin green line at very top */}
        <div className="h-[2px] w-full bg-green-500" />
        
        {/* Gold accent line */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />

        {/* Main bar */}
        <div className="relative flex items-stretch h-[56px]" style={{ background: 'linear-gradient(180deg, #1c1a5e 0%, #12104a 50%, #0a0836 100%)' }}>
          
          {/* === Team 1 Section === */}
          <div className={`flex items-center relative overflow-hidden transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'}`} style={{ flex: '1 1 0' }}>
            {/* Team 1 logo area with team color bg */}
            <div className="h-full flex items-center justify-center px-2 flex-shrink-0 relative z-10" style={{ backgroundColor: t1Color, minWidth: '56px' }}>
              {match.team1.logo ? (
                <img src={match.team1.logo} alt={match.team1.name} className="w-10 h-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
              ) : (
                <span className="font-display text-white font-bold text-lg">{match.team1.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            {/* Diagonal cut from team color */}
            <div className="absolute left-[56px] top-0 bottom-0 w-6 z-[5]" style={{ background: t1Color, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
            
            {/* Team 1 Name */}
            <span className="relative z-10 font-display text-xl md:text-2xl lg:text-3xl font-extrabold text-white uppercase tracking-[0.15em] pl-6 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {match.team1.name}
            </span>
          </div>

          {/* === Center Tournament Badge === */}
          <div className={`relative flex-shrink-0 flex items-center justify-center z-20 transition-all duration-700 delay-400 ${vsAnimIn ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`} style={{ width: '240px' }}>
            {/* Left lightning bolt */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 z-30">
              <svg width="28" height="48" viewBox="0 0 28 48" fill="none">
                <path d="M18 0L0 28h10L8 48l20-28H18L18 0z" fill="url(#bolt1)" />
                <defs>
                  <linearGradient id="bolt1" x1="14" y1="0" x2="14" y2="48" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#f5c842" />
                    <stop offset="1" stopColor="#c17a1a" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            {/* Right lightning bolt */}
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-30">
              <svg width="28" height="48" viewBox="0 0 28 48" fill="none" style={{ transform: 'scaleX(-1)' }}>
                <path d="M18 0L0 28h10L8 48l20-28H18L18 0z" fill="url(#bolt2)" />
                <defs>
                  <linearGradient id="bolt2" x1="14" y1="0" x2="14" y2="48" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#f5c842" />
                    <stop offset="1" stopColor="#c17a1a" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Center badge background */}
            <div className="absolute inset-0">
              <svg viewBox="0 0 240 56" className="w-full h-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="badgeBg" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#2a2878" />
                    <stop offset="50%" stopColor="#1e1b68" />
                    <stop offset="100%" stopColor="#141252" />
                  </linearGradient>
                  <linearGradient id="badgeBorder" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#e8a832" />
                    <stop offset="50%" stopColor="#f5c842" />
                    <stop offset="100%" stopColor="#c17a1a" />
                  </linearGradient>
                </defs>
                <polygon points="24,0 216,0 240,28 216,56 24,56 0,28" fill="url(#badgeBg)" stroke="url(#badgeBorder)" strokeWidth="2" />
              </svg>
            </div>

            {/* Badge text content */}
            <div className="relative z-10 text-center px-8">
              <div className="font-display text-[10px] text-amber-400 font-bold tracking-[0.2em] uppercase leading-tight">
                {match.matchType || 'TOURNAMENT'}
              </div>
              <div className="font-display text-white text-sm font-extrabold tracking-wider leading-tight mt-0.5">
                MATCH #{match.matchNo || 1}
              </div>
              <div className="font-display text-[9px] text-white/50 tracking-widest uppercase leading-tight mt-0.5">
                {match.overs} OVERS
              </div>
            </div>
          </div>

          {/* === Team 2 Section === */}
          <div className={`flex items-center justify-end relative overflow-hidden transition-all duration-700 delay-200 ${vsAnimIn ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`} style={{ flex: '1 1 0' }}>
            {/* Team 2 Name */}
            <span className="relative z-10 font-display text-xl md:text-2xl lg:text-3xl font-extrabold text-white uppercase tracking-[0.15em] pr-6 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {match.team2.name}
            </span>
            {/* Diagonal cut from team color */}
            <div className="absolute right-[56px] top-0 bottom-0 w-6 z-[5]" style={{ background: t2Color, clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }} />
            {/* Team 2 logo area with team color bg */}
            <div className="h-full flex items-center justify-center px-2 flex-shrink-0 relative z-10" style={{ backgroundColor: t2Color, minWidth: '56px' }}>
              {match.team2.logo ? (
                <img src={match.team2.logo} alt={match.team2.name} className="w-10 h-10 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
              ) : (
                <span className="font-display text-white font-bold text-lg">{match.team2.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
          </div>
        </div>

        {/* Gold accent line bottom */}
        <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #c17a1a, #e8a832, #f5c842, #e8a832, #c17a1a)' }} />
        {/* Thin green line at very bottom */}
        <div className="h-[2px] w-full bg-green-500" />
      </div>
    );
  };

  // Target Banner  
  const TargetBanner = () => {
    if (!target || !currentInnings || !battingTeam) return <VSBanner />;
    const need = Math.max(0, target - currentInnings.runs);
    const rrr = currentInnings.balls < match.overs * match.ballsPerOver ? ((need / (match.overs * match.ballsPerOver - currentInnings.balls)) * match.ballsPerOver).toFixed(2) : '0.00';
    return (
      <div className="relative flex items-stretch h-14 border-y-2 border-amber-500" style={{ background: 'linear-gradient(180deg, #1a1a4e 0%, #0d0d3b 100%)' }}>
        <div className="w-2" style={{ backgroundColor: t1Color }} />
        <div className="flex-1 flex items-center">
          <div className="flex-1 flex items-center justify-center">
            <span className="font-display text-xl font-bold text-white uppercase">{battingTeam.name}</span>
          </div>
          <div className="flex-1 text-center">
            <p className="font-display text-white font-bold text-sm">{battingTeam.name.toUpperCase()} NEED {need} RUNS TO WIN</p>
            <p className="text-amber-300 text-xs font-bold">AT {rrr} RUNS PER OVER</p>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className="font-display text-xl font-bold text-white uppercase">{bowlingTeam?.name}</span>
          </div>
        </div>
        <div className="w-2" style={{ backgroundColor: t2Color }} />
      </div>
    );
  };

  // Batting Summary Card (like Summary.png)
  const BattingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-white text-center p-8">Innings not available</p>;
    const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const extras = inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes;
    return (
      <div className="w-full max-w-2xl mx-auto" style={{ background: 'linear-gradient(180deg, #1a1a4e 0%, #0d0d3b 100%)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b-2 border-purple-800">
          <div className="flex items-center gap-2">
            {blt.logo ? <img src={blt.logo} alt={blt.name} className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full" style={{ backgroundColor: blt.color || t1Color }} />}
            <span className="font-display text-lg font-bold text-white uppercase">{blt.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold text-white uppercase">{bt.name}</span>
            {bt.logo ? <img src={bt.logo} alt={bt.name} className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full" style={{ backgroundColor: bt.color || t2Color }} />}
          </div>
        </div>
        {/* Players */}
        <div className="divide-y divide-purple-800/50">
          {bt.players.map((p, i) => {
            const isNotOut = !p.isOut && (p.id === inn.currentStrikerId || p.id === inn.currentNonStrikerId || (inn.isComplete && !p.isOut && p.ballsFaced > 0));
            const hasBatted = p.ballsFaced > 0 || p.isOut;
            return (
              <div key={p.id} className={`flex items-center px-4 py-1.5 ${isNotOut ? 'bg-pink-600/80' : hasBatted ? 'bg-white/5' : 'bg-transparent'}`}>
                <span className={`font-display font-bold text-sm flex-1 ${isNotOut ? 'text-white' : hasBatted ? 'text-white' : 'text-white/40'} uppercase`}>
                  {p.name}
                </span>
                {p.isOut && (
                  <>
                    <span className="text-white/60 text-xs mr-2">{p.dismissalType}</span>
                    <span className="text-white/60 text-xs mr-4">b {p.dismissedBy}</span>
                  </>
                )}
                {isNotOut && <span className="text-white text-xs mr-4 font-semibold">NOT OUT</span>}
                {hasBatted && (
                  <>
                    <span className="font-display font-bold text-lg text-white w-10 text-right">{p.runs}</span>
                    <span className="text-white/60 text-xs w-8 text-right">{p.ballsFaced}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-pink-600 to-amber-500">
          <span className="font-display text-white font-bold text-sm">#{match.matchType.toUpperCase()}</span>
          <span className="text-white font-bold">{extras} <span className="text-white/80 text-sm">EXTRAS</span></span>
          <span className="text-white font-bold">{match.overs} <span className="text-white/80 text-sm">OVERS</span></span>
          <span className="bg-pink-700 text-white font-display font-bold text-xl px-4 py-0.5 rounded">{inn.runs}-{inn.wickets}</span>
        </div>
      </div>
    );
  };

  // Bowling Summary Card
  const BowlingSummary = ({ inningsIdx }: { inningsIdx: number }) => {
    const inn = match.innings[inningsIdx];
    if (!inn) return <p className="text-white text-center p-8">Innings not available</p>;
    const blt = inn.bowlingTeamIndex === 0 ? match.team1 : match.team2;
    const bowlers = blt.players.filter(p => p.bowlingBalls > 0);
    return (
      <div className="w-full max-w-2xl mx-auto" style={{ background: 'linear-gradient(180deg, #1a1a4e 0%, #0d0d3b 100%)' }}>
        <div className="px-4 py-2 border-b-2 border-purple-800">
          <span className="font-display text-lg font-bold text-white uppercase">{blt.name} - Bowling</span>
        </div>
        <div className="px-4 py-1 text-xs text-white/60 font-bold flex border-b border-purple-800/50">
          <span className="flex-1">BOWLER</span>
          <span className="w-12 text-right">O</span>
          <span className="w-12 text-right">R</span>
          <span className="w-12 text-right">W</span>
          <span className="w-16 text-right">ECON</span>
        </div>
        {bowlers.map(p => (
          <div key={p.id} className="flex items-center px-4 py-1.5 border-b border-purple-800/30">
            <span className="font-display font-bold text-sm text-white flex-1 uppercase">{p.name}</span>
            <span className="w-12 text-right text-white">{getOversString(p.bowlingBalls, match.ballsPerOver)}</span>
            <span className="w-12 text-right text-white">{p.bowlingRuns}</span>
            <span className="w-12 text-right text-white font-bold">{p.bowlingWickets}</span>
            <span className="w-16 text-right text-white/70">{getRunRate(p.bowlingRuns, p.bowlingBalls, match.ballsPerOver)}</span>
          </div>
        ))}
      </div>
    );
  };

  // FOW
  const FallOfWickets = () => {
    if (!currentInnings) return null;
    const wicketEvents = currentInnings.events.filter(e => e.isWicket);
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
      <div className="w-full max-w-2xl mx-auto" style={{ background: 'linear-gradient(180deg, #1a1a4e 0%, #0d0d3b 100%)' }}>
        <div className="px-4 py-2 border-b-2 border-purple-800">
          <span className="font-display text-lg font-bold text-white">FALL OF WICKETS</span>
        </div>
        {fowList.map((f: any, i: number) => (
          <div key={i} className="flex items-center px-4 py-1.5 border-b border-purple-800/30 text-white">
            <span className="w-8 text-sm font-bold">{i + 1}.</span>
            <span className="flex-1 font-display font-semibold uppercase">{f.name}</span>
            <span className="font-bold">{f.score}</span>
            <span className="text-white/60 text-xs ml-2">({f.overs})</span>
          </div>
        ))}
        {fowList.length === 0 && <p className="text-center text-white/50 py-4">No wickets fallen yet</p>}
      </div>
    );
  };

  // Partnership
  const Partnership = () => {
    if (!striker || !nonStriker) return <p className="text-white text-center p-4">No active partnership</p>;
    return (
      <div className="w-full max-w-2xl mx-auto p-4" style={{ background: 'linear-gradient(180deg, #1a1a4e 0%, #0d0d3b 100%)' }}>
        <h3 className="font-display text-lg font-bold text-white text-center mb-3">CURRENT PARTNERSHIP</h3>
        <div className="flex items-center justify-around">
          <div className="text-center">
            <p className="font-display font-bold text-xl text-white">{striker.name}</p>
            <p className="text-3xl font-bold text-green-400">{striker.runs}</p>
            <p className="text-white/60 text-sm">({striker.ballsFaced} balls)</p>
          </div>
          <div className="text-center">
            <p className="text-amber-300 text-sm font-bold">PARTNERSHIP</p>
            <p className="font-display text-4xl font-bold text-white">{striker.runs + nonStriker.runs}</p>
          </div>
          <div className="text-center">
            <p className="font-display font-bold text-xl text-white">{nonStriker.name}</p>
            <p className="text-3xl font-bold text-green-400">{nonStriker.runs}</p>
            <p className="text-white/60 text-sm">({nonStriker.ballsFaced} balls)</p>
          </div>
        </div>
      </div>
    );
  };

  // Teams Players
  const TeamsPlayers = () => (
    <div className="w-full max-w-2xl mx-auto grid grid-cols-2 gap-0" style={{ background: 'linear-gradient(180deg, #1a1a4e 0%, #0d0d3b 100%)' }}>
      {[match.team1, match.team2].map((team, ti) => (
        <div key={ti} className={ti === 0 ? 'border-r border-purple-800' : ''}>
          <div className="px-3 py-2 text-center font-display font-bold text-white uppercase text-sm" style={{ backgroundColor: ti === 0 ? t1Color : t2Color }}>
            {team.name}
          </div>
          {team.players.map((p, i) => (
            <div key={p.id} className="px-3 py-1 text-white text-sm border-b border-purple-800/30 flex items-center gap-2">
              <span className="text-white/50 text-xs">{i + 1}.</span>
              <span className="font-display uppercase">{p.name}</span>
            </div>
          ))}
          {team.players.length === 0 && <p className="text-center text-white/40 py-4 text-sm">No players</p>}
        </div>
      ))}
    </div>
  );

  // Summary
  const MatchSummary = () => (
    <div className="w-full max-w-2xl mx-auto p-4" style={{ background: 'linear-gradient(180deg, #1a1a4e 0%, #0d0d3b 100%)' }}>
      <h3 className="font-display text-lg font-bold text-white text-center mb-3">MATCH SUMMARY</h3>
      <div className="space-y-2 text-white text-sm">
        <p><span className="text-white/60">Toss:</span> {match.tossWonBy === 0 ? match.team1.name : match.team2.name} won, opted to {match.optedTo}</p>
        {match.innings.map((inn, idx) => {
          const bt = inn.battingTeamIndex === 0 ? match.team1 : match.team2;
          return <p key={idx}><span className="text-white/60">{bt.name}:</span> {inn.runs}/{inn.wickets} ({getOversString(inn.balls, match.ballsPerOver)} ov)</p>;
        })}
        {match.winner && <p className="text-amber-300 font-display font-bold text-lg mt-3">{match.winner} won by {match.winMargin}</p>}
      </div>
    </div>
  );

  // Render based on display mode
  const renderContent = () => {
    switch (display.mode) {
      case 'vs': return <VSBanner />;
      case 'target': return <TargetBanner />;
      case '1bat': return <BattingSummary inningsIdx={0} />;
      case '2bat': return <BattingSummary inningsIdx={1} />;
      case '1ball': return <BowlingSummary inningsIdx={0} />;
      case '2ball': return <BowlingSummary inningsIdx={1} />;
      case 'b1': return <BowlingSummary inningsIdx={0} />;
      case 'b2': return <BowlingSummary inningsIdx={1} />;
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
