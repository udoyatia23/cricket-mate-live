// Sync display state between Controller and Scoreboard via localStorage

export type DisplayMode = 
  | 'default' | 'score' | '1bat' | '1ball' | '2bat' | '2ball' 
  | 'summary' | 'fow' | 'b1' | 'b2' | 'bowler' | 'target' 
  | 'partnership' | 'teams' | 'vs';

export type AnimationOverlay = 'none' | 'four' | 'six' | 'wicket' | 'free_hit' | 'hat_trick' | 'out' | 'not_out';

export interface DisplayState {
  mode: DisplayMode;
  overlay: AnimationOverlay;
  customText?: string;
  momPlayer?: string;
  timestamp: number;
}

const DISPLAY_KEY = (matchId: string) => `cricscorer_display_${matchId}`;

export function setDisplayState(matchId: string, state: Partial<DisplayState>) {
  const current = getDisplayState(matchId);
  const updated = { ...current, ...state, timestamp: Date.now() };
  localStorage.setItem(DISPLAY_KEY(matchId), JSON.stringify(updated));
  // Trigger storage event for same-tab listeners
  window.dispatchEvent(new CustomEvent('display-sync', { detail: { matchId, state: updated } }));
}

export function getDisplayState(matchId: string): DisplayState {
  const data = localStorage.getItem(DISPLAY_KEY(matchId));
  if (data) return JSON.parse(data);
  return { mode: 'default', overlay: 'none', timestamp: Date.now() };
}

export function useDisplaySync(matchId: string, callback: (state: DisplayState) => void) {
  // Returns cleanup function
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail.matchId === matchId) callback(detail.state);
  };
  const storageHandler = () => callback(getDisplayState(matchId));
  
  window.addEventListener('display-sync', handler);
  window.addEventListener('storage', storageHandler);
  
  return () => {
    window.removeEventListener('display-sync', handler);
    window.removeEventListener('storage', storageHandler);
  };
}
