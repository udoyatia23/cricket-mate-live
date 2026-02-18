import { ScoreboardSnapshot } from '@/lib/broadcastTypes';

interface Props {
  snapshot: ScoreboardSnapshot | null;
  variant?: 'dark' | 'forest' | 'blue' | 'purple';
}

const UpcomingMatchDisplay = ({ snapshot, variant = 'dark' }: Props) => {
  if (!snapshot) return null;

  const team1 = snapshot.upcomingTeam1 || snapshot.t1.name;
  const team2 = snapshot.upcomingTeam2 || snapshot.t2.name;
  const matchType = snapshot.upcomingMatchType || snapshot.matchType || 'MATCH';
  const matchNo = snapshot.upcomingMatchNo || ((snapshot.matchNo || 0) + 1);
  const venue = snapshot.venue || '';
  const tournamentName = ''; // not stored in snapshot, use matchType label

  const matchTypeLabel = matchType === 'final' ? 'FINAL'
    : matchType === 'semi' ? 'SEMI FINAL'
    : matchType === 'friendly' ? 'FRIENDLY'
    : `MATCH ${matchNo}`;

  // Theme colors
  const themes = {
    dark: {
      bg: 'linear-gradient(135deg, #0a0a1a, #0d0d22)',
      headerBg: 'linear-gradient(135deg, #1a1a40, #252560)',
      teamBg1: 'linear-gradient(135deg, #1a237e, #283593)',
      teamBg2: 'linear-gradient(135deg, #b71c1c, #c62828)',
      centerBg: 'linear-gradient(135deg, #f5f5f5, #e0e0e0)',
      dividerBg: 'linear-gradient(90deg, #1565c0, #fdd835, #c62828)',
      footerBg: 'linear-gradient(135deg, #1a1a40, #252560)',
      accent: '#fdd835',
      centerText: '#0d0d22',
    },
    forest: {
      bg: 'linear-gradient(135deg, #071a07, #0a2a0a)',
      headerBg: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
      teamBg1: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
      teamBg2: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
      centerBg: 'linear-gradient(135deg, #f5f5f5, #e8f5e9)',
      dividerBg: 'linear-gradient(90deg, #2e7d32, #fdd835, #2e7d32)',
      footerBg: 'linear-gradient(135deg, #0d2a0d, #1a3a1a)',
      accent: '#fdd835',
      centerText: '#1b5e20',
    },
    blue: {
      bg: 'linear-gradient(135deg, #001233, #023e8a)',
      headerBg: 'linear-gradient(135deg, #023e8a, #0077b6)',
      teamBg1: 'linear-gradient(135deg, #023e8a, #0077b6)',
      teamBg2: 'linear-gradient(135deg, #023e8a, #0077b6)',
      centerBg: 'linear-gradient(135deg, #f5f5f5, #e3f2fd)',
      dividerBg: 'linear-gradient(90deg, #0077b6, #90e0ef, #0077b6)',
      footerBg: 'linear-gradient(135deg, #001233, #023e8a)',
      accent: '#90e0ef',
      centerText: '#023e8a',
    },
    purple: {
      bg: 'linear-gradient(135deg, #12002b, #2d1b69)',
      headerBg: 'linear-gradient(135deg, #4a148c, #7b1fa2)',
      teamBg1: 'linear-gradient(135deg, #4a148c, #7b1fa2)',
      teamBg2: 'linear-gradient(135deg, #4a148c, #7b1fa2)',
      centerBg: 'linear-gradient(135deg, #f5f5f5, #f3e5f5)',
      dividerBg: 'linear-gradient(90deg, #7b1fa2, #e040fb, #7b1fa2)',
      footerBg: 'linear-gradient(135deg, #12002b, #2d1b69)',
      accent: '#e040fb',
      centerText: '#4a148c',
    },
  };

  const t = themes[variant];

  return (
    <div
      className="w-full overflow-hidden"
      style={{ background: t.bg, borderRadius: 16, boxShadow: `0 0 40px rgba(0,0,0,0.8)` }}
    >
      {/* Header - Tournament / Match Type */}
      <div
        className="text-center py-2 px-4"
        style={{ background: t.headerBg }}
      >
        <span
          className="font-display font-black text-sm md:text-base tracking-[0.2em] uppercase"
          style={{ color: t.accent }}
        >
          ⏭ UPCOMING {matchTypeLabel}
        </span>
      </div>

      {/* Main 3-column row: Team1 | Center | Team2 */}
      <div className="flex items-stretch" style={{ minHeight: 120 }}>

        {/* Team 1 */}
        <div
          className="flex-1 flex flex-col items-center justify-center py-6 px-4"
          style={{ background: t.teamBg1 }}
        >
          {/* Logo placeholder circle */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-3 font-display font-black text-xl"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: `2px solid ${t.accent}`,
              color: '#fff',
            }}
          >
            {team1.slice(0, 2).toUpperCase()}
          </div>
          <div
            className="font-display font-black text-center uppercase tracking-wider"
            style={{ color: '#fff', fontSize: 'clamp(14px, 2.5vw, 28px)', lineHeight: 1.1 }}
          >
            {team1}
          </div>
        </div>

        {/* Center - VS panel */}
        <div
          className="flex flex-col items-center justify-center px-6 py-4"
          style={{
            background: t.centerBg,
            minWidth: 140,
          }}
        >
          <div
            className="font-display font-black text-sm tracking-widest uppercase mb-1"
            style={{ color: t.centerText, opacity: 0.7 }}
          >
            {matchTypeLabel}
          </div>
          <div
            className="font-display font-black text-5xl leading-none"
            style={{ color: t.centerText }}
          >
            V
          </div>
          <div
            className="font-display font-black text-sm tracking-widest uppercase mt-1"
            style={{ color: t.centerText, opacity: 0.7 }}
          >
            NEXT MATCH
          </div>
        </div>

        {/* Team 2 */}
        <div
          className="flex-1 flex flex-col items-center justify-center py-6 px-4"
          style={{ background: t.teamBg2 }}
        >
          {/* Logo placeholder */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-3 font-display font-black text-xl"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: `2px solid ${t.accent}`,
              color: '#fff',
            }}
          >
            {team2.slice(0, 2).toUpperCase()}
          </div>
          <div
            className="font-display font-black text-center uppercase tracking-wider"
            style={{ color: '#fff', fontSize: 'clamp(14px, 2.5vw, 28px)', lineHeight: 1.1 }}
          >
            {team2}
          </div>
        </div>
      </div>

      {/* Gold / accent divider */}
      <div style={{ height: 4, background: t.dividerBg }} />

      {/* Footer - Team names banner + venue */}
      <div
        className="flex items-center"
        style={{ background: t.footerBg }}
      >
        <div className="flex-1 text-center py-2.5 px-3">
          <span
            className="font-display font-black uppercase tracking-widest text-sm md:text-base"
            style={{ color: '#fff' }}
          >
            {team1}
          </span>
        </div>
        <div
          className="font-display font-black text-lg"
          style={{ color: t.accent, padding: '0 8px' }}
        >
          V
        </div>
        <div className="flex-1 text-center py-2.5 px-3">
          <span
            className="font-display font-black uppercase tracking-widest text-sm md:text-base"
            style={{ color: '#fff' }}
          >
            {team2}
          </span>
        </div>
      </div>

      {/* Venue row */}
      {venue && (
        <div
          className="text-center py-1.5 px-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)' }}>
            📍 {venue}
          </span>
        </div>
      )}
    </div>
  );
};

export default UpcomingMatchDisplay;
