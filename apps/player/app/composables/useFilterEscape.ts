/**
 * Escape a search term for a PostgREST `or()` filter.
 *
 * `,` `(` `)` are structural in that syntax, so a term containing one breaks
 * out of its `ilike` clause and the request 400s. Double-quoting the value
 * makes it literal; embedded quotes and backslashes need escaping in turn.
 */
export function escapeFilterValue(term: string): string {
  return `"%${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`;
}
