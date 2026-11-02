/** The player's shuffle, here with a toast when the fetch fails. */
import { useShuffle } from '@kp/api';
import { toast } from 'sonner';

import { playerStore } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export function usePlayerShuffle() {
  return useShuffle(supabase, playerStore, () => toast.error('Could not shuffle. Try again.'));
}
