"use strict";

const validity = new Map(); // locale -> whether it's a valid tag

/** The locale if it's a valid language tag, otherwise undefined, which Intl reads as the browser's own language. */
export default function validLocale(locale) {
    if (!locale) return undefined;
    if (!validity.has(locale)) {
        let valid = true;
        try {
            Intl.getCanonicalLocales(locale);
        } catch {
            valid = false;
        }
        validity.set(locale, valid);
    }
    return validity.get(locale) ? locale : undefined;
}
