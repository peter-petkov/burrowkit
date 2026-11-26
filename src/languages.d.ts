/**
 * A text with a count, for the counts' plural forms. One of:
 *
 * - a string with `{count}`, and the text's other numbers, like `{total}`;
 * - plural forms picked by the language's plural rules, `other` being the fallback:
 *   `{ one: "{count} match", other: "{count} matches" }`;
 * - a function of the count and the other numbers, which gets them unformatted.
 *
 * `Numbers` are the text's other numbers, by name.
 */
export type CountedText<Numbers extends Record<string, number> = {}> =
    | string
    | PluralForms
    | ((count: number, numbers: Numbers) => string);

/** A text's plural forms, by Intl.PluralRules category. `other` is used for any form that's left out. */
export interface PluralForms {
    zero?: string;
    one?: string;
    two?: string;
    few?: string;
    many?: string;
    other: string;
}

/** What a component hands its Languages. `T` is its object of texts. */
export interface LanguagesOptions<T extends object> {
    /** The codes of the component's translations ("de", "zh-Hans"). */
    shipped: string[];
    /** Imports one translation, resolving to its module, whose default export is its texts. */
    load: (code: string) => Promise<{ default: Partial<T> }>;
    /** The page's own languages, by code, which win over the shipped ones text by text. */
    registered?: Record<string, Partial<T>>;
    /** The component's name, for warnings. */
    name: string;
}

/** A component's texts, in the language of its nearest `lang` attribute. */
export default class Languages<T extends object = Record<string, unknown>> {
    /** The language of an element: its nearest `lang` attribute, also past shadow roots. "" when there is none. */
    static of(element: Element): string;
    /** A text with a count, for a locale, with the count and the other numbers formatted for it. */
    static format<Numbers extends Record<string, number>>(text: CountedText<Numbers>, count: number, locale: string,
        numbers?: Numbers): string;
    /** Formats a number for a locale. */
    static number(count: number, locale: string): string;

    constructor(options: LanguagesOptions<T>);
    /** The codes of the component's translations. */
    shipped: string[];
    /** The page's own languages, by code. */
    registered: Record<string, Partial<T>>;
    /**
     * The texts for a language tag as far as they're known now: the fallback, under a shipped translation once it has
     * loaded, under the page's own. `ready` resolves once a translation that had to load has loaded, or is null.
     */
    texts(tag: string, fallback: T): { texts: T; ready: Promise<unknown> | null };
}