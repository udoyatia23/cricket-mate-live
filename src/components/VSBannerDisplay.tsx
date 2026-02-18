/**
 * VSBannerDisplay – Professional Tournament VS Banner
 *
 * Layout (matches reference design):
 *  ┌──────────────────────────────────────┐
 *  │    🏆 TOURNAMENT NAME  (trapezoid)   │  ← slides down from top
 *  ├──────────┬──────────────┬────────────┤
 *  │  LOGO TEAM1  │  VS/GROUP  │  TEAM2 LOGO │  ← slides in from sides
 *  ├──────────┴──────────────┴────────────┤
 *  │   TEAM WON TOSS · OPTED TO BAT       │  ← inverted trapezoid, slides up
 *  └──────────────────────────────────────┘
 */

export interface VSBannerTheme {
  team1Bg: string;   // left team panel background
  team2Bg: string;   // right team panel background
  centerBg: string;  // centre VS block
  vsColor: string;   // VS text color
  headerBg: string;  // tournament ribbon gradient
  headerAccent: string; // tournament text color
  footerBg: string;  // toss result strip
  divider: string;   // gold divider
  wrapperBg?: string; // optional wrapper tint
}

interface Team {
  name: string;
  color: string;
  logo?: string;
}

interface Props {
  team1: Team;
  team2: Team;
  tournamentName?: string;
  matchType?: string;
  matchNo?: number;
  tossWonBy: number;   // 0 = team1, 1 = team2
  optedTo: string;     // 'bat' | 'bowl'
  animIn: boolean;
  theme: VSBannerTheme;
}

// ── Default themes ──────────────────────────────────────────────────

export const vsThemeDark: VSBannerTheme = {
  headerBg: 'linear-gradient(135deg, #b71c1c 0%, #880e4f 60%, #6a1b9a 100%)',
  headerAccent: '#ffffff',
  team1Bg: '',   // uses team color
  team2Bg: '',   // uses team color
  centerBg: 'linear-gradient(180deg, #1a1230 0%, #0d0820 100%)',
  vsColor: '#fdd835',
  footerBg: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
  divider: 'linear-gradient(90deg, #c17a1a, #fdd835, #ffee58, #fdd835, #c17a1a)',
};

export const vsThemeGreen: VSBannerTheme = {
  headerBg: 'linear-gradient(135deg, #880e4f 0%, #b71c1c 50%, #880e4f 100%)',
  headerAccent: '#ffffff',
  team1Bg: '',
  team2Bg: '',
  centerBg: 'linear-gradient(180deg, #071407 0%, #040d04 100%)',
  vsColor: '#fdd835',
  footerBg: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
  divider: 'linear-gradient(90deg, #c17a1a, #fdd835, #ffee58, #fdd835, #c17a1a)',
};

export const vsThemeWhite: VSBannerTheme = {
  headerBg: 'linear-gradient(135deg, #b71c1c 0%, #880e4f 60%, #6a1b9a 100%)',
  headerAccent: '#ffffff',
  team1Bg: '',
  team2Bg: '',
  centerBg: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d1c 100%)',
  vsColor: '#fdd835',
  footerBg: 'linear-gradient(135deg, #4a148c, #6a1b9a)',
  divider: 'linear-gradient(90deg, #c17a1a, #fdd835, #ffee58, #fdd835, #c17a1a)',
};

export const vsPurple: VSBannerTheme = {
  headerBg: 'linear-gradient(135deg, #b71c1c 0%, #880e4f 60%, #4a148c 100%)',
  headerAccent: '#ffffff',
  team1Bg: '',
  team2Bg: '',
  centerBg: 'linear-gradient(180deg, #1a0038 0%, #120020 100%)',
  vsColor: '#e040fb',
  footerBg: 'linear-gradient(135deg, #880e4f, #4a148c)',
  divider: 'linear-gradient(90deg, #e040fb, #ce93d8, #e040fb)',
};

// ── Team Logo ────────────────────────────────────────────────────────

const TeamLogo = ({ team, size = 56 }: { team: Team; size?: number }) => (
  <div
    className="flex items-center justify-center flex-shrink-0 rounded-full overflow-hidden"
    style={{
      width: size,
      height: size,
      background: 'rgba(255,255,255,0.12)',
      border: '2.5px solid rgba(255,255,255,0.3)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    }}
  >
    {team.logo ? (
      <img
        src={team.logo}
        alt={team.name}
        className="object-contain"
        style={{ width: size - 10, height: size - 10 }}
      />
    ) : (
      <span
        className="font-display font-black text-white"
        style={{ fontSize: size * 0.28, letterSpacing: '0.05em' }}
      >
        {team.name.slice(0, 2).toUpperCase()}
      </span>
    )}
  </div>
);

// ── Main Component ───────────────────────────────────────────────────

const VSBannerDisplay = ({
  team1, team2, tournamentName, matchType, matchNo,
  tossWonBy, optedTo, animIn, theme,
}: Props) => {
  const t1Color = team1.color || '#1b5e20';
  const t2Color = team2.color || '#0d47a1';

  const matchLabel =
    matchType === 'final'   ? 'FINAL'
    : matchType === 'semi'  ? 'SEMI FINAL'
    : matchType === 'friendly' ? 'FRIENDLY'
    : `GROUP${matchNo ? ` #${matchNo}` : ''}`;

  const tossWinner = tossWonBy === 0 ? team1.name : team2.name;
  const tossText = `${tossWinner.toUpperCase()} WON TOSS · OPTED TO ${optedTo.toUpperCase()} FIRST`;

  return (
    <div className="w-full overflow-hidden">

      {/* ── TOURNAMENT NAME RIBBON (trapezoid, slides down) ── */}
      <div
        className={`relative flex justify-center transition-all duration-700 ease-out ${animIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6'}`}
        style={{ background: theme.headerBg }}
      >
        {/* Full-width background fill so edges are solid */}
        <div className="absolute inset-0" style={{ background: theme.headerBg }} />

        {/* Trapezoid ribbon — wider top, narrower bottom */}
        <div
          className="relative z-10 flex items-center justify-center gap-2.5 py-2.5 px-12"
          style={{
            clipPath: 'polygon(6% 0%, 94% 0%, 88% 100%, 12% 100%)',
            background: theme.headerBg,
            minWidth: '55%',
            minHeight: '42px',
          }}
        >
          <span className="text-xl leading-none">🏆</span>
          <span
            className="font-display font-black uppercase tracking-[0.2em] text-sm md:text-base"
            style={{
              color: theme.headerAccent,
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
              letterSpacing: '0.22em',
            }}
          >
            {tournamentName || 'TOURNAMENT'}
          </span>
        </div>
      </div>

      {/* ── GOLD DIVIDER ── */}
      <div style={{ height: '3px', background: theme.divider }} />

      {/* ── MIDDLE: Team1 | VS | Team2 ── */}
      <div className="relative flex items-stretch w-full" style={{ minHeight: '90px' }}>

        {/* Team 1 block */}
        <div
          className={`flex flex-1 items-center gap-3 px-4 md:px-6 py-4 transition-all duration-700 delay-150 ease-out ${animIn ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-16'}`}
          style={{ background: `linear-gradient(135deg, ${t1Color}f0 0%, ${t1Color}99 100%)` }}
        >
          <TeamLogo team={team1} size={54} />
          <span
            className="font-display font-black text-white uppercase"
            style={{
              fontSize: 'clamp(16px, 3vw, 30px)',
              letterSpacing: '0.08em',
              lineHeight: 1.1,
              textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            {team1.name}
          </span>
        </div>

        {/* Centre VS block */}
        <div
          className={`flex flex-col items-center justify-center px-4 md:px-8 flex-shrink-0 z-10 transition-all duration-700 delay-300 ease-out ${animIn ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
          style={{ background: theme.centerBg, minWidth: '110px' }}
        >
          {/* Decorative top line */}
          <div className="w-8 h-[2px] mb-1.5 rounded-full" style={{ background: theme.divider }} />
          <span
            className="font-display font-black leading-none"
            style={{
              fontSize: 'clamp(24px, 4.5vw, 42px)',
              color: theme.vsColor,
              textShadow: `0 0 24px ${theme.vsColor}90`,
            }}
          >
            VS
          </span>
          <span
            className="font-display font-bold uppercase tracking-widest mt-1.5 text-center"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.2em' }}
          >
            {matchLabel}
          </span>
          {/* Decorative bottom line */}
          <div className="w-8 h-[2px] mt-1.5 rounded-full" style={{ background: theme.divider }} />
        </div>

        {/* Team 2 block */}
        <div
          className={`flex flex-1 items-center justify-end gap-3 px-4 md:px-6 py-4 transition-all duration-700 delay-150 ease-out ${animIn ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-16'}`}
          style={{ background: `linear-gradient(225deg, ${t2Color}f0 0%, ${t2Color}99 100%)` }}
        >
          <span
            className="font-display font-black text-white uppercase text-right"
            style={{
              fontSize: 'clamp(16px, 3vw, 30px)',
              letterSpacing: '0.08em',
              lineHeight: 1.1,
              textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            {team2.name}
          </span>
          <TeamLogo team={team2} size={54} />
        </div>
      </div>

      {/* ── GOLD DIVIDER ── */}
      <div style={{ height: '3px', background: theme.divider }} />

      {/* ── TOSS RESULT (inverted trapezoid, slides up) ── */}
      <div
        className={`flex justify-center transition-all duration-700 delay-400 ease-out ${animIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        style={{ background: theme.footerBg }}
      >
        {/* Full-width background */}
        <div className="absolute inset-0 opacity-0" style={{ background: theme.footerBg }} />

        <div
          className="relative flex items-center justify-center py-2.5 px-12 w-full"
          style={{
            clipPath: 'polygon(8% 0%, 92% 0%, 84% 100%, 16% 100%)',
            background: theme.footerBg,
            minHeight: '44px',
          }}
        >
          <span
            className="font-display font-black text-white uppercase tracking-wider text-center"
            style={{
              fontSize: 'clamp(11px, 2vw, 16px)',
              letterSpacing: '0.16em',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            }}
          >
            {tossText}
          </span>
        </div>
      </div>

    </div>
  );
};

export default VSBannerDisplay;
