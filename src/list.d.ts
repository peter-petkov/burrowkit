import type { ClassHelpers } from "./classes.js";
import type FilteredView from "./filtered-view.js";
import type { ViewEntry, ViewGroup } from "./filtered-view.js";
import type Highlighter from "./highlighter.js";

/** The parts of the list that get the component's classes. */
export type ListPart = "list" | "divider" | "group" | "groupList" | "header" | "item" | "placeholder" | "placeholderBar";

/** A rendered row: its entry, its element, and whatever parts the component's createRow returned. */
export type RowRecord<Entry, Parts> = { entry: Entry; element: HTMLElement } & Parts;

/** What a component tells the list, and how the list calls back. */
export interface RowListHooks<Entry extends ViewEntry, Parts extends object> {
    /** Makes a row's element and parts. An <li> is used as it is; anything else is wrapped in <li role="none">. */
    createRow(entry: Entry): { element: HTMLElement } & Parts;
    /** Brings a row up to date with its entry, writing only what differs. */
    updateRow(record: RowRecord<Entry, Parts>): void;
    /** Highlights the matches in a row, with `RowList.highlightText`. */
    highlightRow(record: RowRecord<Entry, Parts>, view: FilteredView<Entry>): void;
    /** Whether a group's rows are folded away, leaving its header. */
    isFolded?(group: ViewGroup, view: FilteredView<Entry> | null): boolean;
    /** Adds to a group's <li> as it's made: its header is `header`, holding the label as a text node. */
    createGroup?(li: HTMLLIElement, header: HTMLElement): void;
    /** Brings a group's header up to date. By default, sets its label. */
    syncGroup?(li: HTMLLIElement, group: ViewGroup, view: FilteredView<Entry> | null): void;
    /** What scrolls: the container or the list. */
    scroller(): HTMLElement;
    /** How much of the scroller's top and bottom sticky parts cover. */
    covered?(): { top: number; bottom: number };
    /** Whether the list is on screen. By default, whether the container is an open popover. */
    isShown?(): boolean;
    /** Called once rows were added or brought up to date. */
    rendered?(): void;
    /** Asks for more entries, while loading. */
    loadMore?(detail: { batchSize: number }): void;
}

export interface RowListOptions<Entry extends ViewEntry, Parts extends object> {
    /** What the list sits in, such as the popover; the list tops itself up as it scrolls or resizes. */
    container: HTMLElement;
    /** The component's class helpers, for the list's parts. */
    classes: Pick<ClassHelpers<ListPart>, "addClasses" | "fixedClass">;
    highlighter: Highlighter;
    signal: AbortSignal;
    hooks: RowListHooks<Entry, Parts>;
}

export interface RowListConfig {
    /** Rows per batch; 0 streams the whole list. Default 50. */
    batchSize?: number;
    /** Skeleton rows at the end while more are to come. */
    placeholders?: number;
    /** Whether more entries are on their way (loadMore asks for them). */
    loading?: boolean;
}

/** A list of rows rendered from a FilteredView, a batch at a time, with groups, dividers and reconciling. */
export default class RowList<Entry extends ViewEntry = ViewEntry, Parts extends object = {}> {
    constructor(options: RowListOptions<Entry, Parts>);
    /** The <ul role="listbox">, for the component to place. */
    readonly element: HTMLUListElement;
    destroy(): void;
    configure(config: RowListConfig): void;
    readonly view: FilteredView<Entry> | null;
    readonly rows: readonly RowRecord<Entry, Parts>[];
    readonly groupItems: ReadonlyMap<ViewGroup, HTMLLIElement>;
    recordOf(entry: Entry | null | undefined): RowRecord<Entry, Parts> | undefined;
    recordOfElement(element: Element | EventTarget | null): RowRecord<Entry, Parts> | undefined;
    readonly hasMore: boolean;
    readonly isBatched: boolean;
    readonly stepSize: number;
    readonly shownCount: number;
    /** Shows a view's matches from scratch, from the first batch. */
    show(view: FilteredView<Entry>): void;
    /** Shows the next `count` matches, scanning for at most `budget` milliseconds. */
    renderMore(count: number, budget?: number): void;
    scheduleTopUp(): void;
    /** Renders up to an entry; false when it doesn't match or is folded away. */
    ensureRendered(entry: Entry): boolean;
    /** Renders up to a group's header, and returns it. */
    renderHeader(group: ViewGroup): HTMLElement | null;
    /** Shows a view of changed entries, keeping the rows still shown. */
    reconcile(view: FilteredView<Entry>): void;
    syncSetSize(): void;
    highlightText(view: FilteredView<Entry>, owner: object, key: string, node: Text | null | undefined): void;
    /** Scrolls an element of the list into view, centred or by the least amount. */
    reveal(element: Element, center: boolean): void;
    readonly covered: { top: number; bottom: number };
}