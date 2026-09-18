/**
 * Search BaniDB for a line.
 *
 * Shared by the workbench, where it links a shabad to a rendition, and by the
 * player's read-along, where a listener on a live broadcast can look up what
 * they are hearing.
 *
 * Typing is GurbaniLipi. The field keeps raw keystrokes and renders them in the
 * GurbaniLipi font, so `mdmA` shows as ਮਦਮਅ while the query still holds the
 * ASCII BaniDB's first-letter search wants. There is no transliteration step,
 * which is the point: nothing can disagree about what was typed, the caret
 * never jumps, and paste, backspace and selection behave like a normal input
 * because it is one.
 */
import { SEARCH_TYPES, useBaniDbSearch, type BaniDbHit } from "@kp/api"
import { Search, X } from "lucide-react"
import * as React from "react"
import { useLocalStorage } from "usehooks-ts"

import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { GurmukhiKeyboard } from "./gurmukhi-keyboard"
import { cn } from "../../lib/utils"

export interface ShabadPick {
  shabadId: number
  verseId: number
  firstLine: string
  transliteration: string
}

export function ShabadSearch({
  base,
  onSelect,
  placeholder = "Type the first letters…",
  className,
}: {
  base: string
  onSelect: (pick: ShabadPick) => void
  placeholder?: string
  className?: string
}) {
  const [lang, setLang] = useLocalStorage<number>("kp:shabad-lang", 0)
  const [term, setTerm] = React.useState("")

  const query = useBaniDbSearch(base, term, lang)
  const hits = query.data ?? []

  // English search is a different alphabet, so it drops the font and reads as
  // roman.
  const gurbaniLipi = lang === 0

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={placeholder}
            aria-label="Search BaniDB"
            className={cn("pl-9 pr-8", gurbaniLipi && "font-gurmukhi text-lg")}
          />
          {term ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear"
              onClick={() => setTerm("")}
              className="absolute right-1 top-1/2 -translate-y-1/2"
            >
              <X />
            </Button>
          ) : null}
        </div>

        {gurbaniLipi ? <GurmukhiKeyboard value={term} onChange={setTerm} /> : null}
      </div>

      <div className="flex gap-1">
        {SEARCH_TYPES.map((type) => (
          <Button
            key={type.key}
            variant={lang === type.key ? "secondary" : "ghost"}
            size="xs"
            aria-pressed={lang === type.key}
            onClick={() => setLang(type.key)}
          >
            {type.label}
          </Button>
        ))}
      </div>

      {query.isLoading ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Searching…</p>
      ) : null}

      {query.isError ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Could not reach BaniDB.</p>
      ) : null}

      {!query.isLoading && term.trim().length >= 2 && !hits.length ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Nothing matches.</p>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {hits.map((hit: BaniDbHit) => (
          <button
            key={hit.verseId}
            type="button"
            onClick={() =>
              // The line somebody searched for and clicked is a stronger signal
              // than any heuristic — they were looking for that line. It
              // becomes the anchor.
              onSelect({
                shabadId: hit.shabadId,
                verseId: hit.verseId,
                firstLine: hit.verse?.unicode ?? hit.verse?.gurmukhi ?? "",
                transliteration: hit.transliteration?.english ?? "",
              })
            }
            className="rounded-lg px-2 py-2 text-left hover:bg-accent/50"
          >
            <p className="text-sm">{hit.verse?.unicode ?? hit.verse?.gurmukhi}</p>
            <p className="text-xs text-muted-foreground">
              {hit.transliteration?.english}
            </p>
            {hit.writer?.english || hit.raag?.english ? (
              <p className="text-[11px] text-muted-foreground/70">
                {[hit.writer?.english, hit.raag?.english].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
