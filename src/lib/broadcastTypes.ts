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
  // Upcoming match info (for 'upcoming' display mode)
  upcomingTeam1?: string;
  upcomingTeam2?: string;
  upcomingMatchType?: string;
  upcomingMatchNo?: number;
  // Tournament ID (for tour stats display modes)
  tournamentId?: string;
  // Tournament name (for VS banner)
  tournamentName?: string;
  // Player stats display (for BAT1/BAT2/BOWL buttons)
  playerStats?: {
    type: 'batsman' | 'bowler';
    name: string;
    teamName: string;
    teamColor: string;
    // Tournament aggregated stats
    matches: number;
    totalRuns: number;
    totalBalls: number;
    totalWickets: number;   // bowling wickets or times out (for batsman avg)
    totalBowlingRuns: number;
    totalBowlingBalls: number;
    totalFours: number;
    totalSixes: number;
    // Current match stats
    currentRuns: number;
    currentBalls: number;
    currentFours: number;
    currentSixes: number;
    currentBowlingWickets: number;
    currentBowlingRuns: number;
    currentBowlingBalls: number;
  };
  // Dismissed batsman info (shows for 5s after wicket)
  dismissal?: {
    name: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    dismissalType: string;
    dismissedBy: string;
  };
  ts: number;
}
