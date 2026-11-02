/**
 * search_shabads against the real function and the real view: its ranking, its
 * escaping, and that nobody but the fill can write the lines it reads.
 *
 * Local stack only, as permissions.db.test.ts is. The fixture lines use negative
 * verse ids, which BaniDB never has, and are removed afterwards. They hang off a
 * published recording taken from whatever the stack holds.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anon: SupabaseClient = createClient(inject('supabaseUrl'), inject('supabaseKey'), options);
const service: SupabaseClient = createClient(
  inject('supabaseUrl'),
  inject('supabaseSecretKey'),
  options
);

interface Row {
  shabad: { id: string; shabad_id: number };
  verse_id: number | null;
}

let shabadId: number;

const line = (verse_id: number, letters_en: string, letters_pa: string, roman: string) => ({
  verse_id,
  shabad_id: shabadId,
  gurmukhi: `ਟੈਸਟ${roman}`,
  gurmukhi_keys: `tYst${roman}`,
  roman,
  letters_en,
  letters_pa,
});

async function search(letters: string, words: string, script = 'en') {
  const { data, error } = await anon.rpc('search_shabads', { letters, words, script });
  expect(error).toBeNull();
  return (data ?? []) as Row[];
}

beforeAll(async () => {
  const { data } = await anon
    .from('shabads')
    .select('shabad_id')
    .not('shabad_id', 'is', null)
    .limit(1)
    .single();
  shabadId = (data as { shabad_id: number }).shabad_id;
  const { error } = await service
    .from('shabad_lines')
    .insert([
      line(-1, 'qqxzz', 'ਙਙਞਞਞ', 'zzqmiddleword line'),
      line(-2, 'zzqqxzz', 'ਞਞਙਙਞ', 'other 100%off line'),
    ]);
  expect(error).toBeNull();
});

afterAll(async () => {
  await service.from('shabad_lines').delete().lt('verse_id', 0);
});

it('shows the line that opens on the letters over one that holds them', async () => {
  const rows = await search('qqx', 'qqx');
  const found = rows.find((row) => row.shabad.shabad_id === shabadId);
  expect(found?.verse_id).toBe(-1);
});

it('finds letters inside a line, but not a term as wildcards', async () => {
  expect((await search('zzq', 'zzq')).map((row) => row.verse_id)).toContain(-2);
  expect((await search('z_q', 'zzz')).map((row) => row.verse_id)).not.toContain(-2);
});

it('matches letters in the script searched, not the other', async () => {
  expect((await search('ਙਙਞ', 'ਙਙਞ', 'pa')).map((row) => row.verse_id)).toContain(-1);
  expect((await search('ਙਙਞ', 'ਙਙਞ', 'en')).map((row) => row.verse_id)).not.toContain(-1);
});

it('reads words of four letters or more against the line, with % taken literally', async () => {
  expect((await search('', 'zzqmiddle')).map((row) => row.verse_id)).toContain(-1);
  expect((await search('', '100%off')).map((row) => row.verse_id)).toContain(-2);
  expect((await search('', '100%xoff')).map((row) => row.verse_id)).not.toContain(-2);
  expect((await search('', 'zzq')).map((row) => row.verse_id)).not.toContain(-1);
});

it('lets anyone read the lines and no listener write them', async () => {
  const read = await anon.from('shabad_lines').select('verse_id').eq('verse_id', -1);
  expect(read.data).toHaveLength(1);
  const write = await anon.from('shabad_lines').insert(line(-3, 'x', 'x', 'x'));
  expect(write.error).not.toBeNull();
});
