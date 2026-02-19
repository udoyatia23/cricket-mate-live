// Shared BallDot component — reference style dual-line display
// Top: runs number (bigger), Bottom: extra type label (smaller)
// Used across all scoreboards and match controller

import { BallEvent } from '@/types/cricket';

interface BallDotProps {
  event: BallEvent;
  size?: 'sm' | 'md' | 'lg';
  // Theme for light scoreboards
  theme?: 'dark' | 'light';
}

/**
 * Returns extra label for a ball event (shown below the run number).
 * Returns '' for normal deliveries.
 */
function getExtraLabel(event: BallEvent): string {
  if (event.type === 'wide') return 'WD';
  if (event.type === 'noBall') return 'NB';
  if (event.type === 'bye') return 'B';
  if (event.type === 'legBye') return 'LB';
  return '';
}

export function BallDot({ event, size = 'md', theme = 'dark' }: BallDotProps) {
  const extraLabel = getExtraLabel(event);
  const hasExtra = extraLabel !== '';

  // Size configs
  const sizeMap = {
    sm: { wh: 22, runSize: 9, extraSize: 7, border: 1.5 },
    md: { wh: 26, runSize: 11, extraSize: 7, border: 2 },
    lg: { wh: 30, runSize: 13, extraSize: 8, border: 2 },
  };
  const sz = sizeMap[size];

  // Color logic — reference image style
  let bg: string;
  let border: string;
  let textColor: string;
  let extraColor: string;
  let isSquare = false;

  if (event.isWicket) {
    bg = '#c62828'; border = '#c62828'; textColor = '#fff'; extraColor = '#ffd';
  } else if (event.runs === 6 && !hasExtra) {
    bg = '#1b5e20'; border = '#2e7d32'; textColor = '#fff'; extraColor = '#fff';
  } else if (event.runs === 4 && !hasExtra) {
    bg = '#e65100'; border = '#bf360c'; textColor = '#fff'; extraColor = '#fff'; isSquare = true;
  } else if (event.runs === 4 && hasExtra) {
    // e.g. 4+WD or 4+NB — dark green with label (matches reference image)
    bg = '#1b5e20'; border = '#2e7d32'; textColor = '#fff'; extraColor = '#b9f6ca';
  } else if (event.runs === 6 && hasExtra) {
    bg = '#1b5e20'; border = '#2e7d32'; textColor = '#fff'; extraColor = '#b9f6ca';
  } else if (event.runs === 0 && !hasExtra) {
    // dot ball
    bg = '#fdd835'; border = '#f9a825'; textColor = '#111'; extraColor = '#111';
  } else if (hasExtra) {
    // Regular extra (1 WD, 2 NB, 1 B, 1 LB, etc.) — outlined circle
    if (theme === 'light') {
      bg = 'rgba(0,0,0,0.06)'; border = 'rgba(0,0,0,0.35)'; textColor = '#111'; extraColor = '#555';
    } else {
      bg = 'rgba(255,255,255,0.08)'; border = 'rgba(255,255,255,0.45)'; textColor = '#fff'; extraColor = 'rgba(255,255,255,0.65)';
    }
  } else {
    // Normal run (1,2,3)
    if (theme === 'light') {
      bg = 'rgba(0,0,0,0.06)'; border = 'rgba(0,0,0,0.35)'; textColor = '#111'; extraColor = '#555';
    } else {
      bg = 'rgba(255,255,255,0.12)'; border = 'rgba(255,255,255,0.4)'; textColor = '#fff'; extraColor = 'rgba(255,255,255,0.65)';
    }
  }

  const runText = event.isWicket ? 'W' : String(event.runs);

  return (
    <div
      className="flex flex-col items-center justify-center flex-shrink-0"
      style={{
        width: sz.wh,
        height: sz.wh,
        backgroundColor: bg,
        border: `${sz.border}px solid ${border}`,
        borderRadius: isSquare ? '3px' : '50%',
      }}
    >
      <span
        style={{
          fontSize: hasExtra ? sz.runSize - 1 : sz.runSize,
          fontWeight: 900,
          color: textColor,
          lineHeight: hasExtra ? '1' : '1.1',
          fontFamily: 'Oswald, system-ui, sans-serif',
          letterSpacing: '-0.02em',
        }}
      >
        {runText}
      </span>
      {hasExtra && (
        <span
          style={{
            fontSize: sz.extraSize,
            fontWeight: 700,
            color: extraColor,
            lineHeight: '1',
            fontFamily: 'Oswald, system-ui, sans-serif',
            letterSpacing: '0.01em',
          }}
        >
          {extraLabel}
        </span>
      )}
    </div>
  );
}

export function EmptyBallDot({ size = 'md', theme = 'dark' }: { size?: 'sm' | 'md' | 'lg'; theme?: 'dark' | 'light' }) {
  const sizeMap = {
    sm: 22,
    md: 26,
    lg: 30,
  };
  const wh = sizeMap[size];
  const borderColor = theme === 'light' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.2)';
  const bg = theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  return (
    <div
      className="flex-shrink-0"
      style={{
        width: wh,
        height: wh,
        border: `2px solid ${borderColor}`,
        borderRadius: '50%',
        backgroundColor: bg,
      }}
    />
  );
}
