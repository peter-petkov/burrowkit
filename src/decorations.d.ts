import type { ClassHelpers } from "./classes.js";

/** The image and icon helpers, for a component's parts. */
export interface Decorations<Part extends string> {
    /** The class an image of this part gets when it fails to load: its fixed class with "-broken". */
    brokenClass(part: Part): string;
    /**
     * Adds, changes or removes an image so it shows `url`, before `next`, loading lazily. Returns the image, or null
     * when there's no URL.
     */
    syncImage(image: HTMLImageElement | null, url: string, part: Part, next: Element): HTMLImageElement | null;
    /** Adds, changes or removes an icon (an emoji, say) showing `text`, before `next`. Returns it, or null. */
    syncIcon(icon: HTMLElement | null, text: string, part: Part, next: Element): HTMLElement | null;
    /** Marks the images of these parts inside `root` that fail to load with their broken class. */
    hideBrokenImages(root: Node, parts: readonly Part[], signal?: AbortSignal): void;
}

/** Images (data-image) and icons (data-icon) before an entry's label, with the component's classes. */
export default function createDecorations<Part extends string>(
    classes: Pick<ClassHelpers<Part>, "addClasses" | "fixedClass">): Decorations<Part>;