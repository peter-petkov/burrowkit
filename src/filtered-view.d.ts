import type { MatchPart } from "./highlighter.js";
import type { PreparedText } from "./search.js";

/** A group of entries, as the view reads it: its label is matched too, and a match brings the whole group. */
export interface ViewGroup {
    readonly label: string;
}

/** What the view reads from an entry; a component's entries may carry anything else besides. */
export interface ViewEntry {
    readonly group: ViewGroup | null;
    /** Whether a divider sits right before the entry in the list. */
    readonly dividerBefore: boolean;
}

/** How a component has its entries matched. */
export interface FilteredViewOptions<Entry> {
    /** Folds a text as the query was folded (see `Search.fold`, `SearchCache`). */
    fold: (text: string) => string;
    /** Makes a text ready for `Search.match` (see `Search.prepare`, `SearchCache`). */
    prepare: (text: string) => PreparedText;
    /** The texts an entry is matched by, the strongest first. Empty texts are skipped. */
    texts: (entry: Entry) => readonly string[];
    /** Strong matches first (the default), or list order. */
    tiered?: boolean;
}

/**
 * The entries matching a search, found lazily: `pull()` scans only as far as it's asked to. Strong matches come
 * first, a group moves as a whole with its best match, dividers stay only between matches of one tier.
 */
export default class FilteredView<Entry extends ViewEntry = ViewEntry> {
    /** `query` is folded already; an empty one matches every entry. */
    constructor(entries: readonly Entry[], query: string, options: FilteredViewOptions<Entry>);
    readonly query: string;
    /** How many entries match: all without a search, otherwise -1 until counted or scanned to the end. */
    readonly size: number;
    /** Counts the matches in one go. */
    count(): number;
    /** Whether part of the list hasn't been scanned yet. */
    readonly hasMore: boolean;
    /** Scans on and returns the next matches: at most `count`, stopping once `budget` milliseconds are spent. */
    pull(count?: number, budget?: number): Entry[];
    /** Whether the entry matches, however far the scan has got. */
    includes(entry: Entry): boolean;
    /** Whether the query matches one of the entry's own texts. */
    textMatches(entry: Entry): boolean;
    /** Where the query matches a text, or null. */
    locate(text: string): MatchPart[] | null;
    /** Whether the query matches a group's label. */
    groupMatches(group: ViewGroup | null): boolean;
    /** Whether a divider shows right before this match; known for matches already pulled. */
    hasDividerBefore(entry: Entry): boolean;
}

/** Remembers folded and prepared texts, up to `limit()` of each, starting over when the language changes. */
export class SearchCache {
    constructor(limit: () => number);
    fold(text: string, locale?: string): string;
    prepare(text: string, locale?: string): PreparedText;
}