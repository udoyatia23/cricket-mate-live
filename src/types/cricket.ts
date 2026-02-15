export interface Player {
  id: string;
  name: string;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalType?: string;
  dismissedBy?: string;
  bowlingBalls: number;
  bowlingRuns: number;
  bowlingWickets: number;
  bowlingMaidens: number;
}

export interface Team {
  name: string;
  players: Player[];
  color: string;
  logo?: string;
}

export interface Extras {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
}

export interface BallEvent {
  id: string;
  type: 'run' | 'wide' | 'noBall' | 'bye' | 'legBye' | 'wicket';
  runs: number;
  batsmanId: string;
  bowlerId: string;
  isWicket: boolean;
  wicketType?: string;
  isLegal: boolean;
  timestamp: number;
}

export interface Innings {
  battingTeamIndex: number;
  bowlingTeamIndex: number;
  runs: number;
  wickets: number;
  balls: number;
  extras: Extras;
  currentStrikerId?: string;
  currentNonStrikerId?: string;
  currentBowlerId?: string;
  events: BallEvent[];
  isComplete: boolean;
}

export interface Match {
  id: string;
  tournamentId: string;
  team1: Team;
  team2: Team;
  overs: number;
  ballsPerOver: number;
  matchNo: number;
  tossWonBy: number;
  optedTo: 'bat' | 'bowl';
  matchType: string;
  status: 'upcoming' | 'live' | 'finished';
  innings: Innings[];
  currentInningsIndex: number;
  winner?: string;
  winMargin?: string;
  mom?: string;
  createdAt: string;
}

export interface Tournament {
  id: string;
  name: string;
  address: string;
  matches: string[];
  createdAt: string;
}

export function createPlayer(name: string): Player {
  return {
    id: crypto.randomUUID(),
    name,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    isOut: false,
    bowlingBalls: 0,
    bowlingRuns: 0,
    bowlingWickets: 0,
    bowlingMaidens: 0,
  };
}

export function createInnings(battingTeamIndex: number): Innings {
  return {
    battingTeamIndex,
    bowlingTeamIndex: battingTeamIndex === 0 ? 1 : 0,
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
    events: [],
    isComplete: false,
  };
}

export function getOversString(balls: number, ballsPerOver: number): string {
  const overs = Math.floor(balls / ballsPerOver);
  const remaining = balls % ballsPerOver;
  return `${overs}.${remaining}`;
}

export function getRunRate(runs: number, balls: number, ballsPerOver: number): string {
  if (balls === 0) return '0.00';
  return ((runs / balls) * ballsPerOver).toFixed(2);
}
