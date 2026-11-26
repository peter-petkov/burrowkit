import type { MatchPart } from "./highlighter.js";

/** A text made ready for `Search.match`: folded, with where each folded unit came from and which start a word. */
export interface PreparedText {
    /** The text folded (see `Search.fold`). */
    folded: string;
    /** For each folded unit, where its letter starts in the text; null when the text is plain ASCII (unit = letter). */
    starts: number[] | null;
    /** For each folded unit, where its letter ends in the text, accents included; null for plain ASCII. */
    ends: number[] | null;
    /** For each folded unit, whether it starts a word (truthy). */
    words: ArrayLike<number | boolean>;
}

/** Where a query matched a text. */
export interface Match {
    /** The matched pieces, in the text itself. */
    parts: MatchPart[];
    /** Whether every piece starts a word. */
    strong: boolean;
}

/**
 * Search as the components do it: case and accents folded by the language's rules, and a query matching a text by
 * its letters in order, the first at the start of a word, or anywhere as a whole.
 */
export default class Search {
    /** A text as search compares it: lower case by the locale's rules, without accents, with ß, ø, æ… spelled out. */
    static fold(text: string, locale?: string): string;
    /** A text made ready for `match`. */
    static prepare(text: string, locale?: string): PreparedText;
    /** Where a folded query matches a prepared text, or null. */
    static match(prepared: PreparedText, query: string): Match | null;
    /** Whether the letters of a folded query occur in a folded text in order, spaces in the query left out. */
    static mayMatch(folded: string, query: string): boolean;
}