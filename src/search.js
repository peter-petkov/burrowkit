"use strict";

import validLocale from "./locale.js";

/**
 * Search as the components do it: case and accents folded by the language's rules, and a query matching a text by
 * its letters in order, the first at the start of a word (initials: "nyc" finds New York City), or anywhere as a
 * whole. A match is strong when every matched piece starts a word, which components show first.
 *
 * Texts are compared folded (fold), and matched once prepared (prepare), which remembers where each folded letter
 * came from, so a match is reported as pieces of the original text, for highlighting.
 */
export default class Search {
    // Accents that searching ignores: those of Latin, Greek and Cyrillic, and the optional vowel marks of Arabic and
    // Hebrew. Not every combining mark: the vowel signs of Indic scripts and the voicing marks of Japanese kana are
    // as much a part of the letter as its shape. Also variation selectors, so "🎙" finds "🎙️", which asks for the
    // emoji form.
    static #accents = /[︀-️̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-ً︯-ٰٟ֑-ׇ]/g;

    // Letters that have no accent to take off, but are searched for as their plain counterparts.
    static #letters = { "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ς": "σ" };
    static #lettersPattern = /[ßæœøłđðþς]/g;

    /**
     * A text as search compares it: lower case by the locale's rules (Turkish İ is i), without accents, so that
     * "zurich" finds "Zürich", and with ß, ø, æ and the like spelled out plainly.
     */
    static fold(text, locale) {
        return text.toLocaleLowerCase(validLocale(locale))
            .normalize("NFD")
            .replace(Search.#accents, "")
            .replace(Search.#lettersPattern, letter => Search.#letters[letter]);
    }

    /**
     * A text made ready for match(): folded a letter at a time, remembering which letters of the text each folded
     * unit came from and whether it starts a word. A letter's accents count as part of it, so a match never cuts one
     * off.
     */
    static prepare(text, locale) {
        const folded = Search.fold(text, locale);

        // Plain ASCII folds one letter to one unit, so the folded text lines up with the text as it is (starts and
        // ends are left out), and its words are told apart by character codes, which is quicker than patterns.
        if (folded.length === text.length && /^[\x00-\x7f]*$/.test(text)) {
            const words = new Uint8Array(text.length);
            let previous = 0;
            for (let i = 0; i < text.length; i++) {
                const kind = Search.#asciiKind(text.charCodeAt(i));
                words[i] = kind && (!previous || (previous === 1 && kind === 2) || (previous === 3) !== (kind === 3));
                previous = kind;
            }
            return { folded, starts: null, ends: null, words };
        }

        const starts = [];
        const ends = [];
        const words = [];
        let joined = "";
        let previous = "";      // the last letter that wasn't an accent
        let units = [];         // the folded units of that letter
        for (let i = 0; i < text.length;) {
            const letter = String.fromCodePoint(text.codePointAt(i));
            const part = Search.fold(letter, locale);
            const next = i + letter.length;

            if (part) {
                units = [];
                for (let unit = 0; unit < part.length; unit++) {
                    units.push(starts.length);
                    starts.push(i);
                    ends.push(next);
                    words.push(unit === 0 && Search.#startsWord(previous, letter));
                }
                joined += part;
                previous = letter;
            } else {
                // An accent, or another mark searching ignores: it goes with the letter before it.
                for (const unit of units) ends[unit] = next;
            }

            i = next;
        }

        return { folded: joined, starts, ends, words };
    }

    /**
     * Where a folded query matches a prepared text (see prepare), or null when it doesn't: `parts` lists the pieces
     * that matched as { start, end } in the text itself, and `strong` says whether each of them starts a word.
     *
     * The query's letters match in order, the first at the start of a word and the rest anywhere after it, so "nyc"
     * matches New York City, "unk" United Kingdom and "lt" Laptop. Spaces in the query are left out of this. Among
     * the ways to match, the one with the fewest pieces starting inside a word wins, then the one in the fewest
     * pieces, then the earliest. When the query's first letter starts no word, it still matches wherever it occurs as
     * a whole, as "rich" does in Zürich, which is never strong.
     */
    static match(prepared, query) {
        if (!query) return null;

        const { folded, starts, ends } = prepared;
        const part = (first, last) => ({ start: starts?.[first] ?? first, end: ends?.[last] ?? last + 1 });

        const initials = Search.#initials(prepared, query.replace(/\s+/g, ""));
        if (initials) return { parts: initials.runs.map(([first, last]) => part(first, last)), strong: initials.strong };

        const at = folded.indexOf(query);
        return at < 0 ? null : { parts: [part(at, at + query.length - 1)], strong: false };
    }

    /** Whether the letters of a query occur in a folded text in order, spaces in the query left out. */
    static mayMatch(folded, query) {
        let at = 0;
        for (const unit of query) {
            if (/\s/.test(unit)) continue;

            at = folded.indexOf(unit, at) + 1;
            if (!at) return false;
        }
        return true;
    }

    // A letter starts a word when it's a letter or a digit and comes first, after a space or punctuation, as an
    // upper case letter after a lower case one ("macOS"), or where letters and digits meet ("iPhone15").
    static #startsWord(previous, letter) {
        if (!/[\p{L}\p{N}]/u.test(letter)) return false;
        if (!previous || !/[\p{L}\p{N}]/u.test(previous)) return true;
        if (/\p{Ll}/u.test(previous) && /\p{Lu}/u.test(letter)) return true;
        return /\p{L}/u.test(previous) !== /\p{L}/u.test(letter);
    }

    // An ASCII character as #startsWord tells them apart: 0 for neither a letter nor a digit, 1 for a lower case
    // letter, 2 for an upper case one, 3 for a digit.
    static #asciiKind(code) {
        if (code >= 97 && code <= 122) return 1;
        if (code >= 65 && code <= 90) return 2;
        return code >= 48 && code <= 57 ? 3 : 0;
    }

    /**
     * The best way the query's letters match in order, the first at the start of a word and the rest anywhere after
     * it, as `runs` of [first, last] folded units, with `strong` true when every run starts a word; null when there's
     * none. The best way has the fewest pieces that start inside a word, then the fewest pieces, then comes earliest.
     */
    static #initials({ folded, words }, query) {
        const length = folded.length;
        if (!query || query.length > length || !Search.mayMatch(folded, query)) return null;

        // Where each letter of the query occurs in the text.
        const at = new Map();
        // By UTF-16 unit, as the text and the query are read below: an emoji is two of them.
        for (const unit of new Set(query.split(""))) at.set(unit, []);
        for (let t = 0; t < length; t++) at.get(folded[t])?.push(t);

        // cost[q * length + t]: what the rest of the query costs once its letter q matched at t, a piece inside a
        // word counting as more than any number of pieces at word starts; next[...] is where letter q + 1 then goes.
        const inside = 1 << 16;
        const none = 0x7fffffff;
        const cost = new Int32Array(query.length * length).fill(none);
        const next = new Int32Array(query.length * length);

        for (let q = query.length - 1; q >= 0; q--) {
            for (const t of at.get(query[q])) {
                const cell = q * length + t;
                if (q === query.length - 1) {
                    cost[cell] = 0;
                    continue;
                }

                // Letter q + 1 at s: right after t, where it continues the piece, or further on, where it starts one.
                const after = cell + length - t;
                for (const s of at.get(query[q + 1])) {
                    if (s <= t || cost[after + s] === none) continue;

                    const total = cost[after + s] + (s === t + 1 ? 0 : words[s] ? 1 : inside + 1);
                    if (total < cost[cell]) {
                        cost[cell] = total;
                        next[cell] = s;
                    }
                }
            }
        }

        let first = -1;
        for (const t of at.get(query[0]))
            if (words[t] && cost[t] !== none && (first < 0 || cost[t] < cost[first])) first = t;
        if (first < 0) return null;

        const runs = [[first, first]];
        for (let q = 0, t = first; q < query.length - 1; q++) {
            t = next[q * length + t];
            const run = runs[runs.length - 1];
            if (t === run[1] + 1) run[1] = t;
            else runs.push([t, t]);
        }
        return { runs, strong: cost[first] < inside };
    }
}