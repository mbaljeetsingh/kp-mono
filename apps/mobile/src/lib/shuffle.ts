/** The full player's shuffle, here with an alert when the fetch fails. */
import { useShuffle } from '@kp/api';
import { Alert } from 'react-native';

import { playerStore } from '~/lib/player';
import { supabase } from '~/lib/supabase';

export function usePlayerShuffle() {
  return useShuffle(supabase, playerStore, () => Alert.alert('Could not shuffle. Try again.'));
}
