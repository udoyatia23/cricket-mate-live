/**
 * VSBannerDisplay – Professional Tournament VS Banner
 *
 * Layout (inspired by reference design):
 *  ┌──────────────────────────────────────────────────┐
 *  │         🏆 TOURNAMENT NAME (trapezoid ribbon)     │
 *  ├────────────────┬─────────────┬────────────────────┤
 *  │  LOGO  TEAM 1  │  VS / GROUP │  TEAM 2  LOGO      │
 *  ├────────────────┴─────────────┴────────────────────┤
 *  │       TEAM_NAME WON TOSS · OPTED TO BAT           │
 *  └──────────────────────────────────────────────────┘
 *
 * Each scoreboard passes its own theme colours so the banner
 * blends seamlessly with the rest of the layout.
 */

import { ScoreboardSnapshot } from '@/lib/broadcastTypes';

interface Team {
  name: string;
  color: string;
  logo?: string;
}

export interface VSBannerTheme {
  /** Main background for the banner wrapper */
  wrapperBg: string;
  /** Header (tournament name strip) gradient */
  headerBg: string;
  /** Text / accent colour for the header strip */
  headerAccent: string;
  /** Left team panel background (fallback if team has no colour) */
  team1Bg: string;
  /** Right team panel background (fallback if team has no colour) */
  team2Bg: string;
  /** Centre VS panel background */
  centerBg: string;
  /** Centre VS text colour */
  vsColor: string;
  /** Footer (toss result strip) background */
  footerBg: string;
  /** Divider / gold stripe colour */
  divider: string;
}

interface Props {
  team1: Team;
  team2: Team;
  tournamentName?: string;
  matchType?: string;
  matchNo?: number;
  tossWonBy: number; // 0 = team1, 1 = team2
  optedTo: string;   // 'bat' | 'bowl'
  animIn: boolean;
  theme: VSBannerTheme;
}

// ── Default themes used by each scoreboard ─────────────────────────

export const vsThemeDark: VSBannerTheme = {
  wrapperBg: 'linear-gradient(135deg, #0a0a14, #0d0d22)',
  headerBg: 'linear-gradient(135deg, #b71c1c 0%, #880e4f 60%, #6a1b9a 100%)',
  headerAccent: '#ffffff',
  team1Bg: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
  team2Bg: 'linear-gradient(135deg, #01579b, #0277bd)',
  centerBg: 'linear-gradient(180deg, #1a1a0a 0%, #111108 100%)',
  vsColor: '#fdd835',
  footerBg: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
  divider: 'linear-gradient(90deg, #fdd835, #ffee58, #fdd835)',
};

export const vsThemeGreen: VSBannerTheme = {
  wrapperBg: 'linear-gradient(135deg, #071a07, #0a2a0a)',
  headerBg: 'linear-gradient(135deg, #880e4f 0%, #b71c1c 50%, #880e4f 100%)',
  headerAccent: '#ffffff',
  team1Bg: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
  team2Bg: 'linear-gradient(135deg, #1b5e20 0%, #388e3c 100%)',
  centerBg: 'linear-gradient(180deg, #0d2b0d, #071407)',
  vsColor: '#fdd835',
  footerBg: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
  divider: 'linear-gradient(90deg, #fdd835, #ffee58, #fdd835)',
};

export const vsThemeWhite: VSBannerTheme = {
  wrapperBg: 'linear-gradient(135deg, #e8e8f0, #f5f5fa)',
  headerBg: 'linear-gradient(135deg, #b71c1c 0%, #880e4f 60%, #6a1b9a 100%)',
  headerAccent: '#ffffff',
  team1Bg: 'linear-gradient(135deg, #c62828, #b71c1c)',
  team2Bg: 'linear-gradient(135deg, #1565c0, #0d47a1)',
  centerBg: 'linear-gradient(180deg, #3d3d3d, #1a1a1a)',
  vsColor: '#fdd835',
  footerBg: 'linear-gradient(135deg, #4a148c, #6a1b9a)',
  divider: 'linear-gradient(90deg, #c17a1a, #fdd835, #c17a1a)',
};

export const vsPurple: VSBannerTheme = {
  wrapperBg: 'linear-gradient(135deg, #12002b, #1a0038)',
  headerBg: 'linear-gradient(135deg, #b71c1c 0%, #880e4f 60%, #4a148c 100%)',
  headerAccent: '#ffffff',
  team1Bg: 'linear-gradient(135deg, #4a148c, #6a1b9a)',
  team2Bg: 'linear-gradient(135deg, #1a237e, #283593)',
  centerBg: 'linear-gradient(180deg, #1a0038, #120020)',
  vsColor: '#e040fb',
  footerBg: 'linear-gradient(135deg, #880e4f, #4a148c)',
  divider: 'linear-gradient(90deg, #e040fb, #ce93d8, #e040fb)',
};

// ── Sub-components ─────────────────────────────────────────────────

const TeamLogo = ({ team, size = 52 }: { team: Team; size?: number }) => (
  <div
    className="flex items-center justify-center flex-shrink-0 rounded-full overflow-hidden"
    style={{
      width: size,
      height: size,
      background: 'rgba(255,255,255,0.15)',
      border: '2px solid rgba(255,255,255,0.3)',
    }}
  >
    {team.logo ? (
      <img src={team.logo} alt={team.name} className="object-contain" style={{ width: size - 8, height: size - 8 }} />
    ) : (
      <span
        className="font-display font-black text-white"
        style={{ fontSize: size * 0.3, letterSpacing: '0.05em' }}
      >
        {team.name.slice(0, 2).toUpperCase()}
      </span>
    )}
  </div>
);

// ── Main component ─────────────────────────────────────────────────

const VSBannerDisplay = ({
  team1,
  team2,
  tournamentName,
  matchType,
  matchNo,
  tossWonBy,
  optedTo,
  animIn,
  theme,
}: Props) => {
  const t1Color = team1.color || '#1b5e20';
  const t2Color = team2.color || '#0d47a1';

  const matchLabel =
    matchType === 'final' ? 'FINAL'
    : matchType === 'semi' ? 'SEMI FINAL'
    : matchType === 'friendly' ? 'FRIENDLY'
    : `GROUP ${matchNo ? `#${matchNo}` : ''}`;

  const tossWinner = tossWonBy === 0 ? team1.name : team2.name;
  const tossResult = `${tossWinner.toUpperCase()} WON TOSS · OPTED TO ${optedTo.toUpperCase()} FIRST`;

  return (
    <div
      className={`w-full overflow-hidden transition-all duration-700 ${animIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      style={{ background: theme.wrapperBg }}
    >
      {/* ── TOP: Tournament name ribbon (trapezoid shape) ── */}
      <div className="relative flex justify-center" style={{ background: theme.headerBg }}>
        {/* Trapezoid clip via clip-path */}
        <div
          className="relative z-10 flex items-center justify-center gap-2 px-10 py-2"
          style={{
            clipPath: 'polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)',
            background: theme.headerBg,
            minWidth: '60%',
          }}
        >
          <span className="text-lg mr-1">🏆</span>
          <span
            className="font-display font-black uppercase tracking-[0.18em] text-sm md:text-base"
            style={{ color: theme.headerAccent, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
          >
            {tournamentName || 'TOURNAMENT'}
          </span>
        </div>
        {/* Side fill to make edges solid */}
        <div className="absolute inset-0" style={{ background: theme.headerBg, zIndex: 0 }} />
      </div>

      {/* ── GOLD divider ── */}
      <div style={{ height: '3px', background: theme.divider }} />

      {/* ── MIDDLE: Team1 | VS | Team2 ── */}
      <div className="relative flex items-stretch w-full" style={{ minHeight: '84px' }}>

        {/* Team 1 */}
        <div
          className={`flex flex-1 items-center gap-3 px-4 md:px-6 py-4
            transition-all duration-700 delay-150
            ${animIn ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-16'}`}
          style={{ background: `linear-gradient(135deg, ${t1Color}ee, ${t1Color}88)` }}
        >
          <TeamLogo team={team1} size={50} />
          <span
            className="font-display font-black text-white uppercase"
            style={{ fontSize: 'clamp(16px, 3vw, 28px)', letterSpacing: '0.06em', lineHeight: 1.1, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
          >
            {team1.name}
          </span>
        </div>

        {/* Centre VS block */}
        <div
          className="flex flex-col items-center justify-center px-5 md:px-8 flex-shrink-0 z-10"
          style={{ background: theme.centerBg, minWidth: '100px' }}
        >
          <span
            className="font-display font-black leading-none"
            style={{ fontSize: 'clamp(22px, 4vw, 38px)', color: theme.vsColor, textShadow: `0 0 20px ${theme.vsColor}80` }}
          >
            VS
          </span>
          <span
            className="font-display font-bold uppercase tracking-widest mt-1"
            style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.18em' }}
          >
            {matchLabel}
          </span>
        </div>

        {/* Team 2 */}
        <div
          className={`flex flex-1 items-center justify-end gap-3 px-4 md:px-6 py-4
            transition-all duration-700 delay-150
            ${animIn ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-16'}`}
          style={{ background: `linear-gradient(225deg, ${t2Color}ee, ${t2Color}88)` }}
        >
          <span
            className="font-display font-black text-white uppercase text-right"
            style={{ fontSize: 'clamp(16px, 3vw, 28px)', letterSpacing: '0.06em', lineHeight: 1.1, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
          >
            {team2.name}
          </span>
          <TeamLogo team={team2} size={50} />
        </div>
      </div>

      {/* ── GOLD divider ── */}
      <div style={{ height: '3px', background: theme.divider }} />

      {/* ── BOTTOM: Toss result banner ── */}
      <div
        className={`flex items-center justify-center py-2.5 px-6 transition-all duration-700 delay-300
          ${animIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{
          background: theme.footerBg,
          clipPath: 'polygon(0 0, 100% 0, 92% 100%, 8% 100%)',
        }}
      >
        <span
          className="font-display font-black text-white uppercase tracking-wider text-center"
          style={{ fontSize: 'clamp(11px, 2vw, 16px)', letterSpacing: '0.15em', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
        >
          {tossResult}
        </span>
      </div>
    </div>
  );
};

export default VSBannerDisplay;
