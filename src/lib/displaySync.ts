// Sync display state between Controller and Scoreboard via Supabase realtime
import { supabase } from '@/integrations/supabase/client';

export type DisplayMode = 
  | 'default' | 'score' | '1bat' | '1ball' | '2bat' | '2ball' 
  | 'summary' | 'fow' | 'b1' | 'b2' | 'bowler' | 'target' 
  | 'partnership' | 'teams' | 'vs' | 'upcoming';

export type AnimationOverlay = 'none' | 'four' | 'six' | 'wicket' | 'free_hit' | 'hat_trick' | 'out' | 'not_out';

export interface DisplayState {
  mode: DisplayMode;
  overlay: AnimationOverlay;
  customText?: string;
  momPlayer?: string;
  timestamp: number;
}

const DEFAULT_STATE: DisplayState = { mode: 'default', overlay: 'none', timestamp: 0 };

export async function setDisplayState(matchId: string, state: Partial<DisplayState>) {
  const current = await getDisplayState(matchId);
  const updated = { ...current, ...state, timestamp: Date.now() };
  try {
    await (supabase.from('matches') as any).update({
      display_state: updated,
    }).eq('id', matchId);
  } catch (e) {
    console.error('Failed to set display state:', e);
  }
}

export async function getDisplayState(matchId: string): Promise<DisplayState> {
  const { data } = await (supabase.from('matches') as any)
    .select('display_state')
    .eq('id', matchId)
    .maybeSingle();
  if (data?.display_state) {
    return data.display_state as DisplayState;
  }
  return { ...DEFAULT_STATE, timestamp: Date.now() };
}

export function useDisplaySync(matchId: string, callback: (state: DisplayState) => void) {
  const channel = supabase
    .channel(`display-${matchId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${matchId}`,
      },
      (payload) => {
        const ds = (payload.new as any)?.display_state;
        if (ds) {
          callback(ds as DisplayState);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
