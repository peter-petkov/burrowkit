// Uses every public member the way a component does, so that npm run check:types fails when the definitions drift
// from the code. Lines marked @ts-expect-error must stay errors. Nothing here runs.
import createClasses, { type ClassHelpers } from "burrowkit/classes.js";
import FilteredView, { SearchCache, type ViewEntry, type ViewGroup } from "burrowkit/filtered-view.js";
import Highlighter, { type MatchPart } from "burrowkit/highlighter.js";
import Languages, { type CountedText, type PluralForms } from "burrowkit/languages.js";
import validLocale from "burrowkit/locale.js";
import Search, { type Match, type PreparedText } from "burrowkit/search.js";

const element = document.createElement("li");

// Highlighter: one per component, named by it.
const highlighter = new Highlighter("example-highlight");
const parts: MatchPart[] = [{ start: 0, end: 1 }];
highlighter.apply(element, "label", element.firstChild as Text | null, parts);
highlighter.apply(element, "label", null, null);
highlighter.drop(element, "label");
highlighter.clear();
// @ts-expect-error the highlight needs a name
new Highlighter();

// Search.
const query: string = Search.fold("NYC", "en");
const prepared: PreparedText = Search.prepare("New York City", "en");
const match: Match | null = Search.match(prepared, query);
const strong: boolean | undefined = match?.strong;
const first: number | undefined = match?.parts[0]?.end;
const may: boolean = Search.mayMatch(prepared.folded, query);
const plain: string = Search.fold("Zürich");
// @ts-expect-error match takes a prepared text
Search.match("New York City", query);

// Filtered view: a component's own entries, matched by the texts it names.
interface Entry extends ViewEntry {
    label: string;
    value: string;
}
const group: ViewGroup = { label: "Fruit" };
const entries: Entry[] = [{ label: "Apple", value: "a", group, dividerBefore: false }];
const cache = new SearchCache(() => 4 * entries.length + 100);
const view = new FilteredView(entries, Search.fold("ap", "en"), {
    fold: text => cache.fold(text, "en"),
    prepare: text => cache.prepare(text, "en"),
    texts: entry => [entry.label, entry.value],
});
const pulled: Entry[] = view.pull(50, 8);
const size: number = view.size + view.count();
const more: boolean = view.hasMore && view.includes(entries[0]) && view.textMatches(entries[0]);
const located: MatchPart[] | null = view.locate("Apple");
const grouped: boolean = view.groupMatches(group) && view.hasDividerBefore(entries[0]);
new FilteredView(entries, "", { fold: text => text, prepare: text => Search.prepare(text), texts: () => [], tiered: false });
// @ts-expect-error an entry needs a group and dividerBefore
new FilteredView([{ label: "x" }], "", { fold: t => t, prepare: Search.prepare, texts: () => [] });

// Locale.
const locale: string | undefined = validLocale("de-AT");
validLocale(undefined);

// Languages: a component's own instance, with its texts.
interface Texts {
    searchLabel: string;
    matchesLabel: CountedText;
    filteredLabel: CountedText<{ total: number }>;
}
const english: Texts = {
    searchLabel: "Search",
    matchesLabel: { one: "{count} match", other: "{count} matches" },
    filteredLabel: (count, { total }) => `${count} of ${total}`,
};
const registered: Record<string, Partial<Texts>> = {};
const translations = new Languages<Texts>({
    shipped: ["de", "zh-Hans"],
    load: code => import(`./languages/${code}.js`) as Promise<{ default: Partial<Texts> }>,
    registered,
    name: "Example",
});
translations.registered.de = { searchLabel: "Suche" };
const shipped: string[] = translations.shipped;
const { texts, ready } = translations.texts(Languages.of(element), english);
const label: string = texts.searchLabel;
ready?.then(() => {});
const counted: string = Languages.format(texts.matchesLabel, 3, "en");
const filtered: string = Languages.format(texts.filteredLabel, 3, "en", { total: 10 });
const number: string = Languages.number(1234.5, "de");
const forms: PluralForms = { one: "{count} wynik", few: "{count} wyniki", other: "{count} wyniku" };
// @ts-expect-error plural forms need other
const noOther: PluralForms = { one: "{count} hit" };
// @ts-expect-error not one of the component's texts
translations.registered.de = { nope: "x" };
// @ts-expect-error the fallback must have every text
translations.texts("de", { searchLabel: "Search" });

// Class plugs: a component's fixed classes and plugs.
type Part = "menu" | "item" | "itemSelected";
const fixed: Partial<Record<Part, string>> = { menu: "ex-menu", item: "ex-item" };
const classes: Record<Part, string> = { menu: "", item: "", itemSelected: "" };
const helpers: ClassHelpers<Part> = createClasses<Part>(fixed, classes);
const { fixedClass, addClasses, removeClasses, toggleClasses } = createClasses(fixed, classes);
addClasses(element, "item");
removeClasses(element, "item");
toggleClasses(element, "itemSelected", true);
toggleClasses(element, "itemSelected");
const menuClass: string | undefined = fixedClass("menu");
// @ts-expect-error not a part
helpers.addClasses(element, "nope");

export {};