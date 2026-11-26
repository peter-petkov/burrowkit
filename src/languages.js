"use strict";

import validLocale from "./locale.js";

/**
 * A component's texts, in the language of its nearest lang attribute.
 *
 * A component ships translations, one module per language, each a plain object of texts as its default export, and
 * gives its Languages a way to load one: an import() of its own folder, which bundlers can follow and split out. A
 * translation loads the first time a component in that language needs it, so an English page loads none. A language
 * the page registers (in `registered`, an object the component hands it and exposes to the page) wins over a shipped
 * translation of the same language, text by text, so it can change a single text or be a whole language of its own.
 * Whatever a language leaves out comes from the fallback the component passes, its English texts.
 *
 * A text with a count, such as a number of matches, is a string with {count}, an object of plural forms picked by the
 * language's plural rules ({ one: "{count} match", other: "{count} matches" }, other being the fallback), or a
 * function of the count. A text can have other numbers too, like a {total}; the form is still picked by the count.
 */
export default class Languages {
    // Codes that name a Chinese translation by another name, in lower case, for a component that ships it.
    static #aliases = {
        "zh": "zh-Hans", "zh-cn": "zh-Hans", "zh-sg": "zh-Hans", "zh-my": "zh-Hans",
        "zh-tw": "zh-Hant", "zh-hk": "zh-Hant", "zh-mo": "zh-Hant",
    };

    static #formats = new Map();  // locale -> { plurals, numbers }

    /** The language of an element: its nearest lang attribute, also past shadow roots. "" when there is none. */
    static of(element) {
        for (let node = element; node; node = node.getRootNode().host) {
            const owner = node.closest?.("[lang]");
            if (owner) return owner.lang.trim();
        }
        return "";
    }

    /**
     * A text with a count, for a locale: a string with {count}, plural forms, or a function, which gets the count
     * and the other numbers. The count and the other numbers, like { total } for {total}, are formatted for the
     * locale.
     */
    static format(text, count, locale, numbers = {}) {
        if (typeof text === "function") return text(count, numbers);

        const formats = Languages.#formatsFor(locale);
        const form = text && typeof text === "object"
            ? text[formats.plurals.select(count)] ?? text.other ?? ""
            : String(text ?? "");
        return Object.entries({ count, ...numbers })
            .reduce((result, [name, value]) => result.replaceAll(`{${name}}`, formats.numbers.format(value)), form);
    }

    /** Formats a number for a locale. */
    static number(count, locale) {
        return Languages.#formatsFor(locale).numbers.format(count);
    }

    /** The codes of the component's translations ("de", "zh-Hans"). */
    shipped;

    /** Languages registered by the page: code -> texts. */
    registered;

    #load;
    #name;
    #loaded = new Map();   // shipped code -> its texts, once loaded
    #loading = new Map();  // shipped code -> the promise of its texts, while loading
    #failed = new Set();   // shipped codes that couldn't load, which aren't tried again

    /**
     * `shipped` lists the codes of the component's translations, `load(code)` imports one and resolves to its module,
     * `registered` is the object of the page's own languages, and `name` names the component in warnings.
     */
    constructor({ shipped, load, registered = {}, name }) {
        this.shipped = shipped;
        this.registered = registered;
        this.#load = load;
        this.#name = name;
    }

    /**
     * The texts for a language tag, as far as they're known now: the fallback, under a shipped translation once it
     * has loaded, under the page's own. When a shipped translation still has to load, it starts loading and
     * `ready` resolves once it has; otherwise `ready` is null.
     */
    texts(tag, fallback) {
        const candidates = Languages.#candidates(tag);
        const own = candidates.map(code => this.#registered(code)).find(Boolean);
        const code = candidates.map(code => this.#shippedCode(code)).find(Boolean);

        const shipped = code && this.#loaded.get(code);
        const ready = code && !shipped && !this.#failed.has(code) ? this.#loadShipped(code) : null;

        return { texts: { ...fallback, ...shipped, ...own }, ready };
    }

    // "zh-Hant-TW" -> ["zh-hant-tw", "zh-hant", "zh"], in lower case: from the exact tag to its base language.
    static #candidates(tag) {
        const parts = tag.toLowerCase().split(/[-_]/).filter(Boolean);
        return parts.map((_, i) => parts.slice(0, parts.length - i).join("-"));
    }

    #registered(code) {
        const key = Object.keys(this.registered).find(key => key.toLowerCase() === code);
        return key ? this.registered[key] : undefined;
    }

    #shippedCode(code) {
        if (code === "en") return undefined;
        const alias = Languages.#aliases[code];
        if (alias && this.shipped.includes(alias)) return alias;
        return this.shipped.find(shipped => shipped.toLowerCase() === code);
    }

    #loadShipped(code) {
        let promise = this.#loading.get(code);
        if (promise) return promise;

        promise = Promise.resolve()
            .then(() => this.#load(code))
            .then(module => this.#loaded.set(code, module.default))
            .catch(error => {
                this.#failed.add(code);
                console.warn(`${this.#name}: couldn't load the ${code} texts.`, error);
            })
            .finally(() => this.#loading.delete(code));

        this.#loading.set(code, promise);
        return promise;
    }

    static #formatsFor(locale) {
        const key = locale || "";
        let formats = Languages.#formats.get(key);

        if (!formats) {
            const locales = validLocale(locale);
            formats = { plurals: new Intl.PluralRules(locales), numbers: new Intl.NumberFormat(locales) };
            Languages.#formats.set(key, formats);
        }

        return formats;
    }
}