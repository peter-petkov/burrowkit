"use strict";

/**
 * Wraps the CSS Custom Highlight API for search matches.
 *
 * A highlight is a page-wide resource, registered under a name the component chooses and styles with
 * `::highlight(name)`. Every instance with that name shares it, also across copies of this module on one page, so each
 * instance only tracks, and only ever removes, the ranges it created itself.
 */
export default class Highlighter {
    #name;

    /** `name` is the highlight's name in CSS.highlights, which the component's CSS styles. */
    constructor(name) {
        this.#name = name;
    }

    // Created on first use, so browsers without the API can still load the module and keep the native element.
    get #highlight() {
        let highlight = CSS.highlights.get(this.#name);
        if (!highlight) {
            highlight = new Highlight();
            CSS.highlights.set(this.#name, highlight);
        }

        return highlight;
    }

    #ranges = new WeakMap(); // owner element -> { [key]: Range[] }
    #owned = new Set();

    /**
     * Highlights the parts of a text node where search matched, as { start, end } in its text (see
     * Search.match), so "nyc" marks the N, Y and C of "New York City". Drops the ranges when there are none.
     */
    apply(owner, key, node, match) {
        if (!node || !match?.length) {
            this.drop(owner, key);
            return;
        }

        let ranges = this.#ranges.get(owner);
        if (!ranges) this.#ranges.set(owner, ranges = {});

        const list = ranges[key] ??= [];
        for (const range of list.splice(match.length)) this.#forget(range);

        match.forEach(({ start, end }, i) => {
            const range = list[i] ??= new Range();
            range.setStart(node, start);
            range.setEnd(node, end);

            this.#highlight.add(range);
            this.#owned.add(range);
        });
    }

    drop(owner, key) {
        const list = this.#ranges.get(owner)?.[key];
        if (!list) return;

        for (const range of list) this.#forget(range);
        delete this.#ranges.get(owner)[key];
    }

    #forget(range) {
        this.#highlight.delete(range);
        this.#owned.delete(range);
    }

    clear() {
        for (const range of this.#owned) this.#highlight.delete(range);
        this.#owned.clear();
    }
}