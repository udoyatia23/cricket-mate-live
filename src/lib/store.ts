import { Tournament, Match } from '@/types/cricket';

const TOURNAMENTS_KEY = 'cricscorer_tournaments';
const MATCHES_KEY = 'cricscorer_matches';

export function getTournaments(): Tournament[] {
  const data = localStorage.getItem(TOURNAMENTS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveTournaments(tournaments: Tournament[]) {
  localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(tournaments));
}

export function addTournament(tournament: Tournament) {
  const tournaments = getTournaments();
  tournaments.push(tournament);
  saveTournaments(tournaments);
}

export function deleteTournament(id: string) {
  const tournaments = getTournaments().filter(t => t.id !== id);
  saveTournaments(tournaments);
  // Also delete associated matches
  const matches = getMatches().filter(m => m.tournamentId !== id);
  saveMatches(matches);
}

export function getTournament(id: string): Tournament | undefined {
  return getTournaments().find(t => t.id === id);
}

export function getMatches(): Match[] {
  const data = localStorage.getItem(MATCHES_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveMatches(matches: Match[]) {
  localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
}

export function addMatch(match: Match) {
  const matches = getMatches();
  matches.push(match);
  saveMatches(matches);
}

export function getMatch(id: string): Match | undefined {
  return getMatches().find(m => m.id === id);
}

export function updateMatch(match: Match) {
  const matches = getMatches().map(m => m.id === match.id ? match : m);
  saveMatches(matches);
}

export function getMatchesForTournament(tournamentId: string): Match[] {
  return getMatches().filter(m => m.tournamentId === tournamentId);
}

export function deleteMatch(id: string) {
  const matches = getMatches().filter(m => m.id !== id);
  saveMatches(matches);
}
