import { Tournament, Match } from '@/types/cricket';
import { supabase } from '@/integrations/supabase/client';

// ===== TOURNAMENT OPERATIONS =====

export async function getTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) {
    // Retry once on timeout
    if (error?.message?.includes('timeout') || error?.code === 'PGRST301') {
      const retry = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
      if (retry.data) return retry.data.map(t => ({ id: t.id, name: t.name, address: t.address || '', matches: [], createdAt: t.created_at }));
    }
    return [];
  }
  return data.map(t => ({
    id: t.id,
    name: t.name,
    address: t.address || '',
    matches: [],
    createdAt: t.created_at,
  }));
}

export async function addTournament(tournament: Tournament): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('tournaments').insert({
    owner_id: user.id,
    name: tournament.name,
    address: tournament.address,
  });
}

export async function deleteTournament(id: string): Promise<void> {
  await supabase.from('tournaments').delete().eq('id', id);
}

export async function getTournament(id: string): Promise<Tournament | undefined> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  return {
    id: data.id,
    name: data.name,
    address: data.address || '',
    matches: [],
    createdAt: data.created_at,
  };
}

// ===== MATCH OPERATIONS =====

export async function addMatch(match: Match): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('matches').insert({
    owner_id: user.id,
    tournament_id: match.tournamentId,
    match_data: JSON.parse(JSON.stringify(match)),
  });
}

export async function getMatch(id: string): Promise<Match | undefined> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return undefined;
  const md = data.match_data as Record<string, unknown>;
  return { ...md, id: data.id } as unknown as Match;
}

export async function updateMatch(match: Match): Promise<void> {
  await supabase.from('matches').update({
    match_data: JSON.parse(JSON.stringify(match)),
  }).eq('id', match.id);
}

export async function getMatchesForTournament(tournamentId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(m => {
    const md = m.match_data as Record<string, unknown>;
    return { ...md, id: m.id } as unknown as Match;
  });
}

export async function deleteMatch(id: string): Promise<void> {
  // Delete score_live row first so scoreboard doesn't show stale data
  await supabase.from('score_live').delete().eq('match_id', id);
  await supabase.from('matches').delete().eq('id', id);
}
