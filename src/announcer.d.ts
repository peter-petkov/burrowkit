/** A text to say, or a function called when it's said, for a text that may have changed meanwhile. */
export type Message = string | (() => string);

/**
 * A component's status line for screen readers: a polite live region (`role="status"`) whose text they read out when
 * it changes. The component makes the element, keeps it off screen and puts it where it's heard (not inside a closed
 * popover). One message is pending at a time; a newer one replaces it.
 */
export default class Announcer {
    /** `element` becomes the live region. */
    constructor(element: HTMLElement);
    readonly element: HTMLElement;
    /** What it says now. */
    readonly text: string;
    /** Says a text now: emptied first and filled a frame later, so the same text again is heard again. */
    say(text: Message): void;
    /** Says a text once `delay` milliseconds pass without another message. "" empties the line. */
    sayLater(text: Message, delay: number): void;
    /** Empties the line. A pending message still comes. */
    clear(): void;
    /** Drops the pending message. */
    cancel(): void;
}