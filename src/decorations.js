"use strict";

/**
 * The image (data-image) and icon (data-icon) before an entry's label, in a component's rows and badges. Both are
 * decorative: the label already names the entry. Each is made only for an entry that has one, so a row or badge
 * without stays as it was. The sync functions take the part's current element, or null, and return what is there
 * afterwards, writing only what differs.
 *
 * A component passes its class helpers (see classes.js), so its images and icons get its own classes, and an image
 * that fails to load gets its part's fixed class with "-broken", which its stylesheet hides.
 */
export default function createDecorations({ addClasses, fixedClass }) {
    /** The class an image that failed to load gets, which hides it. A new URL removes it. */
    const brokenClass = part => `${fixedClass(part)}-broken`;

    /**
     * Adds, changes or removes an image so it shows `url`, placed before `next`. It loads only once it's near the view,
     * so a long list fetches only the images of its rendered rows.
     */
    function syncImage(image, url, part, next) {
        if (!url) {
            image?.remove();
            return null;
        }

        if (!image) {
            image = document.createElement("img");
            image.alt = "";
            image.loading = "lazy";
            image.decoding = "async";
            addClasses(image, part);
            next.before(image);
        }

        if (image.getAttribute("src") !== url) {
            image.classList.remove(brokenClass(part));
            image.src = url;
        }
        return image;
    }

    /** Adds, changes or removes an icon so it shows `text` (an emoji, say), placed before `next`. */
    function syncIcon(icon, text, part, next) {
        if (!text) {
            icon?.remove();
            return null;
        }

        if (!icon) {
            icon = document.createElement("span");
            icon.setAttribute("aria-hidden", "true"); // Or a screen reader reads out the emoji's name before the label.
            addClasses(icon, part);
            next.before(icon);
        }

        if (icon.textContent !== text) icon.textContent = text;
        return icon;
    }

    /**
     * Hides the images of these parts inside `root` that fail to load, so they leave no gap before the label. Errors
     * don't bubble, so this listens on the way down.
     */
    function hideBrokenImages(root, parts, signal) {
        root.addEventListener("error", e => {
            const part = parts.find(part => e.target.classList?.contains(fixedClass(part)));
            if (part) e.target.classList.add(brokenClass(part));
        }, { capture: true, signal });
    }

    return { brokenClass, syncImage, syncIcon, hideBrokenImages };
}