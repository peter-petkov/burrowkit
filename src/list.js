"use strict";

/**
 * A list of rows rendered from a FilteredView, a batch at a time: the rows a component's popover shows.
 *
 * It starts with a batch of rows and shows more a few at a time as the list scrolls, keeping a cushion of rendered
 * rows below the visible part, so the scrollbar shrinks smoothly instead of in steps; with a batch size of 0 it
 * streams every row in steps instead. It scans in time slices, so a long list never holds up a frame. It keeps rows
 * that are still shown when the entries change (reconcile), so focus, scroll position and highlights carry over;
 * renders groups, with a header naming each, and dividers; numbers the rows for screen readers (aria-posinset and
 * aria-setsize, known even while rows are still to come); marks the end of the list while more rows are to come,
 * with skeleton rows if there are any; and asks the component for more entries before the list runs out while it's
 * loading them.
 *
 * What a row is and what it shows is the component's: it makes each row's element and parts (createRow), brings them
 * up to date (updateRow), and says what's highlighted in them (highlightRow), through the hooks it passes. A record
 * is { entry, element, ...the parts createRow returned }. Rows are wrapped in an <li role="none">, unless the element
 * is an <li> itself.
 */
export default class RowList {
    // The list starts with a batch of rows and searches ahead a batch at a time, of the configured size; a batch size
    // of 0 turns batching off, and the list streams in steps of #streamChunkSize rows instead. A scan step takes at most
    // #scanBudget milliseconds.
    static #defaultBatchSize = 50;
    static #streamChunkSize = 100;
    static #scanBudget = 8;

    // How much of the list stays rendered below its visible part, in scroller heights. Rows are shown a few at a
    // time as the list scrolls, keeping this much ahead, so the scrollbar shrinks smoothly instead of in steps.
    static #cushion = 1;

    static #lastId = 0;

    /** Lets the browser handle input and paint before the next step. */
    static #yieldToMain() {
        return globalThis.scheduler?.yield?.() ?? new Promise(resolve => setTimeout(resolve));
    }

    #hooks;
    #classes;
    #highlighter;
    #signal;
    #container;

    #list;
    #config = {};
    #view = null;                       // The FilteredView being shown.
    #prepared = [];                     // Matches scanned ahead a batch at a time, waiting to be shown.
    #topUpFrame = 0;                    // The animation frame that tops the list up, while one is scheduled.
    #resizeObserver;                    // Tops the list up when the container changes size.
    #askedForMore = false;              // Whether the component was asked for more entries since it last added some.
    #wasAtEnd = false;                  // Whether every match was shown and the end in view, as of the last top-up.
    #lastGroup = null;                  // The group of the last row rendered.
    #rows = [];                         // The rendered records, in list order.
    #recordsByEntry = new WeakMap();    // Only the entries rendered right now.
    #recordsByElement = new WeakMap();
    #groupItems = new Map();            // group -> its <li role="group">, as rendered right now
    #dividerItems = new Map();          // entry -> the <li> of the divider rendered right before it
    #setSize = null;                    // The aria-setsize the rows carry.
    #consumed = 0;                      // How many matches were pulled from the view, folded ones too.
    #positions = new WeakMap();         // entry -> its place among the matches, for aria-posinset
    #pulledGroup = null;                // The group of the last match pulled.
    #tail = [];                         // The <li>s after the last row, present while more rows are to come.

    /**
     * `container` is what the list sits in (the popover): the list tops itself up as either of them scrolls or
     * changes size. `classes` are the component's class helpers (addClasses, fixedClass), for the parts list,
     * divider, group, groupList, header, item (a skeleton row), placeholder and placeholderBar. `highlighter` marks
     * search matches. `hooks`:
     *
     * - createRow(entry): makes a row, returning { element, ...parts }, which with the entry make its record;
     * - updateRow(record): brings a row up to date with its entry, writing only what differs;
     * - highlightRow(record, view): highlights the matches in a row, with highlightText();
     * - isFolded(group, view): whether a group's rows are folded away, leaving its header (optional);
     * - createGroup(li, header): adds to a group's <li> as it's made (optional);
     * - syncGroup(li, group, view): brings a group's header up to date (optional; by default, its label);
     * - scroller(): what scrolls, the container or the list;
     * - covered(): { top, bottom }, how much of the scroller sticky parts cover (optional);
     * - isShown(): whether the list is on screen (optional; by default, whether the container is an open popover);
     * - rendered(): called once rows were added or brought up to date (optional);
     * - loadMore({ batchSize }): asks for more entries, while loading (optional).
     */
    constructor({ container, classes, highlighter, signal, hooks }) {
        this.#container = container;
        this.#classes = classes;
        this.#highlighter = highlighter;
        this.#signal = signal;
        this.#hooks = hooks;

        this.#list = document.createElement("ul");
        classes.addClasses(this.#list, "list");
        this.#list.setAttribute("role", "listbox");

        // More rows as the list scrolls, or as the container grows (say, with the window), at most once a frame.
        for (const scroller of [container, this.#list])
            scroller.addEventListener("scroll", () => this.scheduleTopUp(), { passive: true, signal });
        this.#resizeObserver = new ResizeObserver(() => this.scheduleTopUp());
        this.#resizeObserver.observe(container);
        this.#resizeObserver.observe(this.#list);
    }

    /** The <ul role="listbox">, for the component to place. */
    get element() {
        return this.#list;
    }

    destroy() {
        cancelAnimationFrame(this.#topUpFrame);
        this.#resizeObserver.disconnect();
        this.#view = null;
        this.#rows = [];
        this.#tail = [];
    }

    /**
     * Applies the settings: { batchSize, placeholders (skeleton rows at the end, or undefined), loading }. Safe to call
     * again whenever any of them changes. A new batch size is used from the next batch on; rows already rendered stay.
     */
    configure(config) {
        const placeholdersChanged = config.placeholders !== this.#config.placeholders;
        const loadingChanged = Boolean(config.loading) !== Boolean(this.#config.loading);
        this.#config = config;

        if (placeholdersChanged || loadingChanged) {
            this.#askedForMore = false;
            this.#syncTail(placeholdersChanged);
            this.scheduleTopUp();
        }
        if (loadingChanged) this.#list.setAttribute("aria-busy", Boolean(config.loading));
    }

    /** The view being shown. */
    get view() {
        return this.#view;
    }

    /** The rendered records, in list order. */
    get rows() {
        return this.#rows;
    }

    /** The groups rendered, each with its <li role="group">. */
    get groupItems() {
        return this.#groupItems;
    }

    /** The record of an entry, while it's rendered. */
    recordOf(entry) {
        return this.#recordsByEntry.get(entry);
    }

    /** The record of a row's element. */
    recordOfElement(element) {
        return this.#recordsByElement.get(element);
    }

    /** Whether more matches are to come: prepared and waiting to be shown, or not scanned yet. */
    get hasMore() {
        return this.#prepared.length > 0 || Boolean(this.#view?.hasMore);
    }

    get isBatched() {
        return (this.#config.batchSize ?? RowList.#defaultBatchSize) > 0;
    }

    /** How many rows the next step renders. */
    get stepSize() {
        return this.#config.batchSize || (this.#config.batchSize === 0 ? RowList.#streamChunkSize : RowList.#defaultBatchSize);
    }

    /** How many matches the list has shown, as rows or inside folded groups. */
    get shownCount() {
        return this.#consumed - this.#prepared.length;
    }

    // -----------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------

    /**
     * Shows a view's matches from scratch. The first batch is rendered right away. With batching on, more rows follow
     * a few at a time as the list scrolls (see #topUp). With batching off, the rest streams in step by step. Either
     * way a newer view replaces the one being shown.
     */
    show(view) {
        this.#view = view;

        this.#prepared = [];
        this.#askedForMore = false;
        this.#highlighter.clear();
        this.#lastGroup = null;
        this.#setSize = null;
        this.#resetPull();
        this.#rows = [];
        this.#recordsByEntry = new WeakMap();
        this.#groupItems = new Map();
        this.#dividerItems = new Map();
        this.#list.replaceChildren();
        this.#tail = [];

        this.renderMore(this.stepSize);
        this.scheduleTopUp();

        if (!this.isBatched) {
            // noinspection JSIgnoredPromiseFromCall, The stream manages its own lifetime and doesn't need to be awaited.
            this.#stream(view);
        }
    }

    async #stream(view) {
        this.#list.setAttribute("aria-busy", view.hasMore || Boolean(this.#config.loading));

        try {
            while (this.hasMore) {
                await RowList.#yieldToMain();
                if (this.#view !== view || this.#signal.aborted) return;

                this.renderMore(this.stepSize);
            }
        } finally {
            if (this.#view === view) this.#list.setAttribute("aria-busy", Boolean(this.#config.loading));
        }
    }

    /**
     * Shows the next `count` matches, or fewer if the scan runs out of time or of entries. The scan prepares them a
     * batch at a time (or as many as a bigger step needs), so that showing a few rows per frame never scans per
     * frame.
     */
    renderMore(count, budget = RowList.#scanBudget) {
        if (this.#prepared.length < count && this.#view.hasMore) {
            const pulled = this.#pull(this.#view, Math.max(count - this.#prepared.length, this.stepSize), budget);
            this.#prepared = this.#prepared.concat(pulled);
        }

        this.#appendRows(this.#view, this.#prepared.splice(0, count));
        this.#syncTail();
        this.#hooks.rendered?.();
    }

    /**
     * Pulls the next `count` matches from the view to render, or fewer if `budget` milliseconds run out or the view
     * does. Of a folded group only the first match is kept, which brings its header; the rest are passed over, and
     * so don't count. Each kept match is given its place among all the matches, for aria-posinset.
     */
    #pull(view, count, budget) {
        const found = [];
        const deadline = performance.now() + budget;

        do {
            for (const entry of view.pull(count - found.length, deadline - performance.now())) {
                this.#consumed++;
                if (entry.group && entry.group === this.#pulledGroup && this.#isFolded(entry.group, view)) continue;

                this.#pulledGroup = entry.group;
                this.#positions.set(entry, this.#consumed);
                found.push(entry);
            }
        } while (found.length < count && view.hasMore && performance.now() < deadline);

        return found;
    }

    /** Starts #pull over, for a new view. */
    #resetPull() {
        this.#consumed = 0;
        this.#positions = new WeakMap();
        this.#pulledGroup = null;
    }

    #isFolded(group, view = this.#view) {
        return Boolean(group) && Boolean(this.#hooks.isFolded?.(group, view));
    }

    scheduleTopUp() {
        this.#topUpFrame ||= requestAnimationFrame(() => {
            this.#topUpFrame = 0;
            this.#topUp();
        });
    }

    /**
     * Keeps a cushion of rendered rows below the visible part of the list, showing just enough to make up for what
     * scrolled into view, so the list grows smoothly as it scrolls. Then sees whether to ask for more entries.
     */
    #topUp() {
        if (!this.#view || this.#signal.aborted || !this.#isShown()) return;

        // The skeleton rows' offsetTop is measured in the scroller, which the component's CSS positions.
        const scroller = this.#hooks.scroller();
        const end = this.#tail[0]?.offsetTop ?? scroller.scrollHeight;
        const below = end - scroller.scrollTop - scroller.clientHeight;
        const wanted = scroller.clientHeight * RowList.#cushion;

        if (below < wanted && this.hasMore && this.isBatched) {
            const rowHeight = this.#rows.at(-1)?.element.offsetHeight || 32;
            this.renderMore(Math.ceil((wanted - below) / rowHeight));
            this.scheduleTopUp(); // Again next frame, in case the scan ran out of time or the rows are taller.
        }

        this.#askForMore(below < wanted);
    }

    #isShown() {
        return this.#hooks.isShown?.() ?? this.#container.matches(":popover-open");
    }

    /**
     * While the component says it's loading more entries, asks it for more before the list runs out: as soon as fewer
     * than a batch of matches are left to show, so the next page has time to arrive. Once until entries are added,
     * and again whenever the end comes into view, in case a fetch got nowhere.
     */
    #askForMore(nearEnd) {
        if (!this.#config.loading) {
            this.#wasAtEnd = false;
            return;
        }

        const unshown = this.#view.count() - this.shownCount;
        const atEnd = nearEnd && unshown <= 0;

        if ((unshown < this.stepSize && !this.#askedForMore) || (atEnd && !this.#wasAtEnd)) {
            this.#askedForMore = true;
            this.#hooks.loadMore?.({ batchSize: this.stepSize });
        }

        this.#wasAtEnd = atEnd;
    }

    /**
     * Makes sure the entry has a row, rendering up to it if need be. Returns false when the entry doesn't match the
     * view, or is in a folded group.
     */
    ensureRendered(entry) {
        const view = this.#view;
        if (!view?.includes(entry) || this.#isFolded(entry.group, view)) return false;

        while (!this.#recordsByEntry.has(entry) && this.hasMore) this.renderMore(this.stepSize, Infinity);

        return this.#recordsByEntry.has(entry);
    }

    /** Renders the list as far as a group's header, and returns it. */
    renderHeader(group) {
        while (!this.#groupItems.has(group) && this.hasMore) this.renderMore(this.stepSize, Infinity);
        return this.#groupItems.get(group)?.firstElementChild ?? null;
    }

    #appendRows(view, entries) {
        if (!entries.length) return;

        const { items, groups } = this.#buildItems(view, entries);
        for (const [group, rows] of groups) group.lastElementChild.append(...rows);
        this.#list.insertBefore(this.#fragmentOf(items), this.#tail[0] ?? null);
        this.syncSetSize();
        this.#highlightItems(view, entries);
    }

    /**
     * Shows a view of entries that changed, touching only what changed. Rows of entries that are still shown are kept,
     * so focus, scroll position and highlights carry over; new rows are created and rows of entries that went away
     * are removed. As many matches as before stay rendered.
     */
    reconcile(view) {
        const keep = Math.max(this.#rows.length, this.stepSize);
        const previous = { records: this.#recordsByEntry, groups: this.#groupItems, dividers: this.#dividerItems };

        this.#view = view;

        this.#prepared = [];
        this.#askedForMore = false;
        this.#highlighter.clear();
        this.#lastGroup = null;
        this.#setSize = null;
        this.#resetPull();
        this.#rows = [];
        this.#recordsByEntry = new WeakMap();
        this.#groupItems = new Map();
        this.#dividerItems = new Map();

        const entries = this.#pull(view, keep, Infinity);
        const { items, groups } = this.#buildItems(view, entries, previous);
        this.#place(this.#list, items);
        for (const [group, rows] of groups) this.#place(group.lastElementChild, rows);
        this.syncSetSize();
        this.#highlightItems(view, entries);
        this.#syncTail();
        this.#hooks.rendered?.();

        this.scheduleTopUp();

        if (!this.isBatched) {
            // noinspection JSIgnoredPromiseFromCall, The stream manages its own lifetime and doesn't need to be awaited.
            this.#stream(view);
        }
    }

    /**
     * Makes the list items for the given matches, in order: dividers, groups and rows. A group is a
     * <li role="group"> named by its header, with its rows in a list of its own. Returns the items for the list
     * itself, and for each group the rows for its list. With `reuse` (the maps of a previous render), items that
     * are still needed are taken from there and brought up to date.
     */
    #buildItems(view, entries, reuse) {
        const items = [];
        const groups = new Map(); // group <li> -> the items for its own list
        const groupClass = this.#classes.fixedClass("group");

        // The items to add to: the list's own, or a group's. A group may be from an earlier batch.
        const itemsOf = group => {
            if (!group) return items;
            const li = this.#groupItems.get(group);
            if (!groups.has(li)) groups.set(li, []);
            return groups.get(li);
        };

        for (const entry of entries) {
            // Inside the group when it sits between two of its rows, before it when it comes ahead of the group.
            const inGroup = entry.group && entry.group === this.#lastGroup;

            if (view.hasDividerBefore(entry)) {
                let li = reuse?.dividers.get(entry);
                if (!li) {
                    const divider = document.createElement("hr");
                    this.#classes.addClasses(divider, "divider");
                    li = this.#wrapInListItem(divider);
                    li.setAttribute("aria-hidden", "true"); // A listbox holds options and groups only.
                    li.dataset.divider = ""; // So CSS can leave out the line the row after it would draw.
                }

                this.#dividerItems.set(entry, li);
                itemsOf(inGroup && entry.group).push(li);
            }

            if (entry.group !== this.#lastGroup) {
                this.#lastGroup = entry.group;

                // A group shows up once per render, so it can be keyed by the group.
                if (entry.group && !this.#groupItems.has(entry.group)) {
                    const li = reuse?.groups.get(entry.group) ?? this.#createGroup();
                    this.#syncGroup(li, entry.group, view);

                    // Marks the rows outside a group where a group follows them, for CSS that rounds them off, which
                    // it can't see without :has(): that would make a long list slow to restyle.
                    const previous = items.at(-1) ?? (reuse ? null : this.#lastListItem());
                    if (previous && !previous.classList.contains(groupClass))
                        previous.dataset.beforeGroup = "";

                    this.#groupItems.set(entry.group, li);
                    items.push(li);
                }
            }

            // A folded group brings only its header, and an empty list, which takes away rows rendered before.
            if (this.#isFolded(entry.group, view)) {
                itemsOf(entry.group);
                continue;
            }

            const old = reuse?.records.get(entry);
            const record = old ?? this.#createRecord(entry);
            if (old) this.#hooks.updateRow(old);
            this.#recordsByEntry.set(entry, record);
            this.#rows.push(record);
            record.element.setAttribute("aria-posinset", this.#positions.get(entry) ?? this.#rows.length);
            if (this.#setSize !== null) record.element.setAttribute("aria-setsize", this.#setSize);

            const li = old ? this.#itemOf(record.element) : this.#wrapInListItem(record.element);
            delete li.dataset.beforeGroup; // Set again above if a group still follows it.
            itemsOf(entry.group).push(li);
        }

        return { items, groups };
    }

    #createRecord(entry) {
        const record = { entry, ...this.#hooks.createRow(entry) };
        this.#recordsByElement.set(record.element, record);
        this.#hooks.updateRow(record);
        return record;
    }

    /** A row's list item: the element itself when it's an <li>, otherwise the <li> around it. */
    #itemOf(element) {
        return element.localName === "li" ? element : element.parentElement;
    }

    #wrapInListItem(element) {
        if (element.localName === "li") return element;

        const li = document.createElement("li");
        li.setAttribute("role", "none");
        li.append(element);
        return li;
    }

    /** The list's last item before the skeleton rows, if there are any. */
    #lastListItem() {
        return this.#tail.length ? this.#tail[0].previousElementSibling : this.#list.lastElementChild;
    }

    /**
     * A group's <li>: its header, hidden from screen readers since it names the group instead, and the list its
     * rows go in. The header holds the group's label as a text node; the component may add to it (createGroup).
     */
    #createGroup() {
        const header = document.createElement("h6");
        this.#classes.addClasses(header, "header");
        header.id = `${this.#list.id || "list"}-group-${++RowList.#lastId}`;
        header.setAttribute("aria-hidden", "true");
        header.append(document.createTextNode(""));

        const list = document.createElement("ul");
        this.#classes.addClasses(list, "groupList");
        list.setAttribute("role", "none");

        const li = document.createElement("li");
        this.#classes.addClasses(li, "group");
        li.setAttribute("role", "group");
        li.setAttribute("aria-labelledby", header.id);
        li.append(header, list);
        this.#hooks.createGroup?.(li, header);
        return li;
    }

    #syncGroup(li, group, view) {
        if (this.#hooks.syncGroup) {
            this.#hooks.syncGroup(li, group, view);
            return;
        }

        const text = li.firstElementChild.firstChild;
        if (text.data !== group.label) text.data = group.label;
    }

    /**
     * Gives every row the size of the list, for "3 of 20". It's known at once without a search, and once the scan is
     * done with one; until then it's -1, unknown.
     */
    syncSetSize() {
        const size = String(this.#view.size);
        if (size === this.#setSize) return;

        this.#setSize = size;
        for (const record of this.#rows) record.element.setAttribute("aria-setsize", size);
    }

    #fragmentOf(items) {
        const fragment = document.createDocumentFragment();
        fragment.append(...items);
        return fragment;
    }

    /**
     * Puts the items in a list (the list itself or a group's) in the given order, ahead of the tail. Items that are no
     * longer wanted are removed, and the rest only move when their order changed, since moving a node takes focus
     * away from it.
     */
    #place(list, items) {
        const wanted = new Set(items);
        for (const child of [...list.children])
            if (!wanted.has(child) && !this.#tail.includes(child)) child.remove();

        let cursor = list.firstElementChild;
        for (const item of items) {
            if (item === cursor) cursor = cursor.nextElementSibling;
            else list.insertBefore(item, cursor);
        }
    }

    /**
     * The tail marks the end of the list while more rows are to come: the skeleton rows if there are any
     * configured, otherwise a single empty item. More rows are to come while some matches aren't shown yet, or
     * while the component says it's loading more entries. #topUp shows them as the list scrolls.
     */
    #syncTail(rebuild = false) {
        const wanted = this.hasMore || Boolean(this.#config.loading);

        if (this.#tail.length && (!wanted || rebuild)) {
            for (const li of this.#tail) li.remove();
            this.#tail = [];
        }

        if (!wanted) return;

        if (!this.#tail.length) this.#createTail();
    }

    #createTail() {
        const count = this.#config.placeholders ?? 0;

        if (!count) {
            const li = document.createElement("li");
            li.setAttribute("aria-hidden", "true");
            this.#list.append(li);
            this.#tail.push(li);
            return;
        }

        for (let i = 0; i < count; i++) {
            const wave = document.createElement("div");
            this.#classes.addClasses(wave, "placeholder");

            const bar = document.createElement("span");
            this.#classes.addClasses(bar, "placeholderBar");
            wave.append(bar);

            const button = document.createElement("button");
            button.type = "button";
            this.#classes.addClasses(button, "item");
            button.disabled = true;
            button.setAttribute("aria-disabled", "true");
            button.append(wave);

            const li = this.#wrapInListItem(button);
            li.setAttribute("aria-hidden", "true");
            this.#list.append(li);
            this.#tail.push(li);
        }
    }

    // -----------------------------------------------------------------
    // Highlighting
    // -----------------------------------------------------------------

    /** Highlights the query in the rows of these entries and in the headers of groups matched by name. */
    #highlightItems(view, entries) {
        // Ranges are made once the items are in the document: moving a node collapses the ranges inside it.
        if (!view.query) return;

        for (const entry of entries) {
            const header = entry.group && this.#groupItems.get(entry.group)?.firstElementChild;
            if (header && view.groupMatches(entry.group) && !view.textMatches(entry))
                this.highlightText(view, header, "text", header.firstChild);

            const record = this.#recordsByEntry.get(entry);
            if (record && view.textMatches(entry)) this.#hooks.highlightRow(record, view);
        }
    }

    /** Highlights where the view's query matches a text node, as `key` of `owner` (a row's element, say). */
    highlightText(view, owner, key, node) {
        this.#highlighter.apply(owner, key, node, node && view.locate(node.data));
    }

    // -----------------------------------------------------------------
    // Moving between rows (the component focuses the row, or marks it active)
    // -----------------------------------------------------------------

    /**
     * The row `step` rows after a record's, or before it for a negative step, as the arrow keys move; from no record,
     * the first row going down and the last going up. It stops at either end. Moving down past the last rendered row
     * renders the next batch first, so the keys never stall at the end of a longer list. Undefined when there are no
     * rows.
     */
    move(record, step) {
        const index = record ? this.#rows.indexOf(record) : step > 0 ? -1 : this.#rows.length;
        const wanted = index + step;

        while (wanted >= this.#rows.length && this.hasMore) this.renderMore(this.stepSize, Infinity);

        return this.#rows[Math.min(Math.max(wanted, 0), this.#rows.length - 1)];
    }

    /**
     * The row a jump from a record's lands on: by pages (-1 or 1, as many rows as fit in the scroller) or at an end
     * (-Infinity or Infinity), as Page Up, Page Down, Home and End move. Rows that aren't rendered yet are rendered
     * first, so End reaches the last match of a long list. Undefined when there are no rows.
     */
    jump(record, pages) {
        const index = record ? this.#rows.indexOf(record) : -1;
        const { top, bottom } = this.covered;
        const room = this.#hooks.scroller().clientHeight - top - bottom;
        const rowHeight = (record ?? this.#rows[0])?.element.offsetHeight || 32;
        const pageSize = Math.max(1, Math.floor(room / rowHeight) - 1);
        const wanted = Number.isFinite(pages) ? index + pages * pageSize : pages;

        while (wanted >= this.#rows.length && this.hasMore)
            this.renderMore(wanted === Infinity ? Infinity : this.stepSize, Infinity);

        return this.#rows[Math.min(Math.max(wanted, 0), this.#rows.length - 1)];
    }

    // -----------------------------------------------------------------
    // Scrolling
    // -----------------------------------------------------------------

    /**
     * Scrolls so that an element of the list is in view, centred or by the least amount. Element.scrollIntoView()
     * would also scroll the page to bring it to the middle of the window, which makes the page jump. Whatever sticks
     * over the top or bottom of the scroller (covered()) doesn't count as in view.
     */
    reveal(element, center) {
        if (!this.#isShown()) return;

        const scroller = this.#hooks.scroller();
        const { top: bar, bottom } = this.covered;
        const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop - bar;
        const height = element.offsetHeight;
        const room = scroller.clientHeight - bar - bottom;

        if (center) scroller.scrollTop += top - (room - height) / 2;
        else if (top < 0) scroller.scrollTop += top;
        else if (top + height > room) scroller.scrollTop += top + height - room;
    }

    /** How much of the scroller's top and bottom sticky parts cover. */
    get covered() {
        return this.#hooks.covered?.() ?? { top: 0, bottom: 0 };
    }
}