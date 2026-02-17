// Ultra-lightweight payload for instant scoreboard sync via Supabase Broadcast
// This keeps the WebSocket payload under 1KB so it never gets dropped

import { BallEvent } from '@/types/cricket';
import { AnimationOverlay } from '@/lib/displaySync';

export interface ScoreboardSnapshot {
  // Innings info
  inn: {
    runs: number;
    wickets: number;
    balls: number;
    batIdx: number; // battingTeamIndex
  };
  // Striker
  s?: { name: string; runs: number; bf: number };
  // Non-striker
  ns?: { name: string; runs: number; bf: number };
  // Bowler
  b?: { name: string; w: number; r: number; balls: number };
  // Current over events (last N balls)
  ov: BallEvent[];
  // Team names/colors/logos
  t1: { name: string; color: string; logo?: string };
  t2: { name: string; color: string; logo?: string };
  // Match meta
  overs: number;
  bpo: number;
  inIdx: number; // currentInningsIndex
  status: string;
  winner?: string;
  winMargin?: string;
  tossWonBy: number;
  optedTo: string;
  matchType?: string;
  matchNo?: number;
  // 1st innings runs (for target calculation)
  inn1Runs?: number;
  // Overlay
  overlay?: AnimationOverlay;
  // Display mode (for instant display sync via score_live)
  displayMode?: string;
  displayCustomText?: string;
  displayMomPlayer?: string;
  venue?: string;
  // Boundary counters
  totalFours?: number;
  totalSixes?: number;
  // Boundary alert trigger: 'fours' | 'sixes' | undefined
  boundaryAlert?: 'fours' | 'sixes';
  ts: number;
}
