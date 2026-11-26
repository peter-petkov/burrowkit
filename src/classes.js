"use strict";

/**
 * The class plugs: every part a component creates gets a fixed class, which its script and stylesheet rely on, plus
 * the classes in its plug, a string of extra classes that a skin or the page fills, such as a framework's own classes.
 * Elements read their plug when they are created, and state plugs whenever their state changes, so plugs are filled
 * before the component creates its elements.
 *
 * A component passes its fixed classes (part -> class, in its own prefix) and its plugs (part -> classes, empty by
 * default, the object it exposes to skins and the page), and gets helpers that put both on its elements.
 */
export default function createClasses(fixed, classes) {
    const plug = part => String(classes[part] ?? "").split(/\s+/).filter(Boolean);

    return {
        /** A part's fixed class. */
        fixedClass: part => fixed[part],

        /** Adds a part's fixed class and the classes in its plug. */
        addClasses(element, part) {
            element.classList.add(...[fixed[part], ...plug(part)].filter(Boolean));
        },

        /** Removes a part's fixed class and the classes in its plug. */
        removeClasses(element, part) {
            element.classList.remove(...[fixed[part], ...plug(part)].filter(Boolean));
        },

        /** Adds or removes the classes in a state plug. */
        toggleClasses(element, part, force) {
            for (const name of plug(part)) element.classList.toggle(name, force);
        },
    };
}