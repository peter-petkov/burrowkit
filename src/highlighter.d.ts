/** Where a search matched, as a piece of a text: from `start` up to (not including) `end`, in UTF-16 units. */
export interface MatchPart {
    start: number;
    end: number;
}

/**
 * Wraps the CSS Custom Highlight API for search matches. A highlight is page-wide, registered under the name the
 * component gives it and styled with `::highlight(name)`; every instance with that name shares it, and each instance
 * only removes the ranges it created.
 */
export default class Highlighter {
    /** `name` is the highlight's name in `CSS.highlights`, which the component's CSS styles. */
    constructor(name: string);
    /**
     * Highlights the pieces of a text node where search matched. `owner` and `key` name the ranges (a row and which
     * of its texts), so a later call replaces them. No node or no pieces drops them.
     */
    apply(owner: object, key: string, node: Text | null | undefined, match: readonly MatchPart[] | null | undefined): void;
    /** Drops the ranges of an owner's text. */
    drop(owner: object, key: string): void;
    /** Drops every range this instance created. */
    clear(): void;
}