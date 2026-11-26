"use strict";

import Search from "./search.js";

/**
 * The entries matching a search. Matching is lazy: `pull()` scans only as far as it is asked to, so a long list is
 * never searched in one go, and a view that is no longer wanted is simply dropped.
 *
 * An entry matches when the query matches one of its texts (which ones, the component says: say its label, subtext
 * and icon), or its group's label (which includes the whole group), as Search.match matches: by its letters in order,
 * the first starting a word, or as a whole. Both sides are compared folded (see Search.fold), so case and accents
 * don't matter.
 *
 * An entry is any object the component makes; the view reads only `group` (an object with a `label`, or null) and
 * `dividerBefore` (whether a divider sits right before it in the list) from it, and the texts `texts(entry)` gives.
 *
 * Tiered, strong matches come first, those where every matched piece starts a word, then the weak ones, each in
 * list order: the list is scanned twice, the second time for the weak matches. A group moves as a whole,
 * with the tier of its best match, so its matches stay together under one header. A divider is kept only between
 * two matches of the same tier, so one that sits between entries that were filtered out is carried forward to the
 * next match, and there is never one before the first match of a tier. A list longer than #tierLimit keeps list
 * order.
 */
export default class FilteredView {
    static #none = 1;
    static #weak = 2;
    static #strong = 3;

    // The longest list put in tiers. The first weak match waits for the strong scan to cover the whole list, which
    // takes about 170ms at this size; longer lists keep list order, so their first matches show right away.
    static #tierLimit = 50000;

    #entries;
    #query;
    #tiered;
    #index = 0;
    #tier = FilteredView.#strong;   // the tier being scanned for
    #matchCount = 0;
    #tierCount = 0;                 // matches pulled in the tier being scanned for
    #count;                         // All the matches, once count() has counted them.
    #dividerPending = false;
    #dividers = new Set();          // matches that have a divider before them
    #tiers = new Map();             // entry -> how its own texts match
    #groupTiers = new Map();        // group -> how its label matches
    #blockTiers = new Map();        // group -> the tier the group goes in: that of its best match

    #fold;
    #prepare;
    #texts;

    /**
     * `query` is folded already; `fold` folds a text the same way, `prepare` makes it ready for Search.match (see
     * SearchCache, which remembers both), and `texts(entry)` lists the texts an entry is matched by, the strongest
     * first. Without `tiered`, the matches come in list order.
     */
    constructor(entries, query, { fold, prepare, texts, tiered = true }) {
        this.#entries = entries;
        this.#query = query;
        this.#fold = fold;
        this.#prepare = prepare;
        this.#texts = texts;
        this.#tiered = tiered && Boolean(query) && entries.length <= FilteredView.#tierLimit;
        if (!this.#tiered) this.#tier = FilteredView.#weak;
    }

    get query() {
        return this.#query;
    }

    /**
     * How many entries match: all of them without a search, otherwise -1 until the scan is done or count() has
     * counted them.
     */
    get size() {
        if (!this.#query) return this.#entries.length;
        return this.#count ?? (this.hasMore ? -1 : this.#matchCount);
    }

    /** Counts the matches in one go, without scanning on. */
    count() {
        if (!this.#query) return this.#entries.length;
        if (!this.hasMore) return this.#matchCount;

        this.#count ??= this.#entries.reduce((count, entry) => count + this.includes(entry), 0);
        return this.#count;
    }

    /** Whether part of the list has not been scanned yet. */
    get hasMore() {
        return this.#index < this.#entries.length || this.#tier === FilteredView.#strong;
    }

    /**
     * Scans on and returns the next matches: at most `count` of them, stopping early once `budget` milliseconds
     * are spent. Check `hasMore` to see whether the scan has finished.
     */
    pull(count = Infinity, budget = Infinity) {
        const found = [];
        const deadline = performance.now() + budget;

        for (let scanned = 1; this.hasMore && found.length < count; scanned++) {
            // Done with the strong matches: the weak ones, from the top.
            if (this.#index === this.#entries.length) {
                this.#tier = FilteredView.#weak;
                this.#index = this.#tierCount = 0;
                this.#dividerPending = false;
                continue;
            }

            const entry = this.#entries[this.#index++];
            if (entry.dividerBefore) this.#dividerPending = true;

            if (this.includes(entry) && this.#placeOf(entry) === this.#tier) {
                if (this.#dividerPending && this.#tierCount) this.#dividers.add(entry);
                this.#dividerPending = false;
                this.#matchCount++;
                this.#tierCount++;
                found.push(entry);
            }

            // The clock is only read now and then, since reading it is not free.
            if (scanned % 256 === 0 && performance.now() > deadline) break;
        }

        return found;
    }

    /** Whether the entry matches. Does not depend on how far the scan has got. */
    includes(entry) {
        return !this.#query || this.textMatches(entry) || this.groupMatches(entry.group);
    }

    /** Whether the query matches one of the entry's own texts. */
    textMatches(entry) {
        return Boolean(this.#query) && this.#tierOf(entry) !== FilteredView.#none;
    }

    /** Where the query matches a text, as { start, end } pieces of it (see Search.match), or null. */
    locate(text) {
        return Search.match(this.#prepare(text), this.#query)?.parts ?? null;
    }

    /** Whether the query matches the label of the entry's group. */
    groupMatches(group) {
        return Boolean(group && this.#query) && this.#groupTierOf(group) !== FilteredView.#none;
    }

    // The tier a match goes in: that of the group it's in, or its own. Untiered, all go in the weak one.
    #placeOf(entry) {
        if (!this.#tiered) return FilteredView.#weak;
        if (!entry.group) return this.#tierOf(entry);

        let tier = this.#blockTiers.get(entry.group);
        if (tier === undefined) {
            // A group's entries sit together in the list, and the strong scan meets the first of them first.
            tier = FilteredView.#none;
            for (let i = this.#index - 1; i < this.#entries.length && this.#entries[i].group === entry.group; i++)
                tier = Math.max(tier, this.#tierOf(this.#entries[i]));

            this.#blockTiers.set(entry.group, tier = Math.max(tier, this.#groupTierOf(entry.group)));
        }
        return tier;
    }

    // How the query matches an entry's own texts: the best of them, stopping at the first strong one.
    #tierOf(entry) {
        let tier = this.#tiers.get(entry);
        if (tier === undefined) {
            tier = FilteredView.#none;
            for (const text of this.#texts(entry)) {
                tier = Math.max(tier, this.#match(text));
                if (tier === FilteredView.#strong) break;
            }
            this.#tiers.set(entry, tier);
        }
        return tier;
    }

    #groupTierOf(group) {
        if (!group) return FilteredView.#none;

        let tier = this.#groupTiers.get(group);
        if (tier === undefined) this.#groupTiers.set(group, tier = this.#match(group.label.trim()));
        return tier;
    }

    // The cheap test on the folded text first, since most texts fail it and preparing a text costs more.
    #match(text) {
        if (!text || !Search.mayMatch(this.#fold(text), this.#query)) return FilteredView.#none;

        const match = Search.match(this.#prepare(text), this.#query);
        return !match ? FilteredView.#none : match.strong ? FilteredView.#strong : FilteredView.#weak;
    }

    /** Whether a divider is shown right before this match. Only known for matches already pulled. */
    hasDividerBefore(entry) {
        return this.#dividers.has(entry);
    }
}

/**
 * Remembers texts folded (see Search.fold) and prepared (see Search.prepare), so a search or type-ahead doesn't fold
 * every label again on every key. The memory is by text, so a changed entry simply misses it, and it starts over when
 * the language changes or it grows past `limit()` texts (say, a few times the number of entries).
 */
export class SearchCache {
    #folded = new Map();    // text -> its folded form, for #locale
    #prepared = new Map();  // text -> its form for Search.match, for #locale
    #locale = null;
    #limit;

    constructor(limit) {
        this.#limit = limit;
    }

    fold(text, locale = "") {
        return this.#remember(this.#folded, text, locale, Search.fold);
    }

    prepare(text, locale = "") {
        return this.#remember(this.#prepared, text, locale, Search.prepare);
    }

    #remember(memory, text, locale, make) {
        if (locale !== this.#locale) {
            this.#folded.clear();
            this.#prepared.clear();
            this.#locale = locale;
        }
        if (memory.size > this.#limit()) memory.clear();

        let made = memory.get(text);
        if (made === undefined) memory.set(text, made = make(text, locale));
        return made;
    }
}