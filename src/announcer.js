"use strict";

/**
 * A component's status line for screen readers: a polite live region (role="status") whose text they read out when
 * it changes, such as how many entries match once typing pauses.
 *
 * The component makes the element, with its own classes, keeps it off screen with its own CSS, and puts it where it's
 * heard: a live region inside a closed popover isn't. One message is pending at a time; a newer one replaces it, so
 * the latest wins.
 */
export default class Announcer {
    #element;
    #timer;
    #frame;

    /** `element` becomes the live region. */
    constructor(element) {
        this.#element = element;
        element.setAttribute("role", "status");
    }

    get element() {
        return this.#element;
    }

    /** What it says now. */
    get text() {
        return this.#element.textContent;
    }

    /**
     * Says a text now. The line is emptied first and filled a frame later, so saying the same text again is heard
     * again. A function is called then, for a text that may have changed meanwhile; "" says nothing.
     */
    say(text) {
        this.cancel();
        this.#element.textContent = "";
        this.#frame = requestAnimationFrame(() => {
            this.#frame = undefined;
            this.#element.textContent = typeof text === "function" ? text() : text;
        });
    }

    /**
     * Says a text once `delay` milliseconds pass without another message, replacing what the line says (a count that
     * follows typing). A function is called then; "" empties the line.
     */
    sayLater(text, delay) {
        this.cancel();
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            this.#element.textContent = typeof text === "function" ? text() : text;
        }, delay);
    }

    /** Empties the line, for a reader that goes over the page later. A pending message still comes. */
    clear() {
        this.#element.textContent = "";
    }

    /** Drops the pending message, if there is one. */
    cancel() {
        clearTimeout(this.#timer);
        cancelAnimationFrame(this.#frame);
        this.#timer = this.#frame = undefined;
    }
}