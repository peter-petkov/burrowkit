/** The helpers that put a component's fixed classes and plugs on its elements. `Part` names its parts. */
export interface ClassHelpers<Part extends string> {
    /** A part's fixed class. */
    fixedClass(part: Part): string | undefined;
    /** Adds a part's fixed class and the classes in its plug. */
    addClasses(element: Element, part: Part): void;
    /** Removes a part's fixed class and the classes in its plug. */
    removeClasses(element: Element, part: Part): void;
    /** Adds or removes the classes in a state plug. */
    toggleClasses(element: Element, part: Part, force?: boolean): void;
}

/**
 * The class plugs: `fixed` maps a part to its fixed class, in the component's own prefix; `classes` maps a part to
 * its plug, a space-separated string of extra classes that skins and the page fill.
 */
export default function createClasses<Part extends string>(fixed: Partial<Record<Part, string>>,
    classes: Partial<Record<Part, string>>): ClassHelpers<Part>;