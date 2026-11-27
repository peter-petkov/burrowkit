// Uses every public member the way a component does, so that npm run check:types fails when the definitions drift
// from the code. Lines marked @ts-expect-error must stay errors. Nothing here runs.
import Announcer, { type Message } from "burrowkit/announcer.js";
import createClasses, { type ClassHelpers } from "burrowkit/classes.js";
import createDecorations, { type Decorations } from "burrowkit/decorations.js";
import FilteredView, { SearchCache, type ViewEntry, type ViewGroup } from "burrowkit/filtered-view.js";
import Highlighter, { type MatchPart } from "burrowkit/highlighter.js";
import Languages, { type CountedText, type PluralForms } from "burrowkit/languages.js";
import RowList, { type ListPart, type RowRecord } from "burrowkit/list.js";
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

// Announcer: a status line the component made.
const announcer = new Announcer(document.createElement("div"));
const message: Message = () => "3 matches";
announcer.sayLater(message, 500);
announcer.say("Zürich");
announcer.clear();
announcer.cancel();
const said: string = announcer.text;
const region: HTMLElement = announcer.element;
// @ts-expect-error sayLater needs a delay
announcer.sayLater("x");

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

// Row list: rows of the component's own, from a filtered view.
const listClasses = createClasses<ListPart>({ list: "ex-list", group: "ex-group" }, {});
const popover = document.createElement("div");
const rowList = new RowList<Entry, { text: Text }>({
    container: popover,
    classes: listClasses,
    highlighter,
    signal: new AbortController().signal,
    hooks: {
        createRow: entry => {
            const element = document.createElement("li");
            const text = document.createTextNode(entry.label);
            element.append(text);
            return { element, text };
        },
        updateRow: record => { record.text.data = record.entry.label; },
        highlightRow: (record, view) => rowList.highlightText(view, record.element, "text", record.text),
        scroller: () => popover,
        loadMore: ({ batchSize }) => batchSize.toFixed(),
    },
});
rowList.configure({ batchSize: 50, placeholders: 3, loading: true });
rowList.show(view);
rowList.renderMore(rowList.stepSize, Infinity);
rowList.reconcile(view);
const record: RowRecord<Entry, { text: Text }> | undefined = rowList.recordOf(entries[0]);
const rowText: string | undefined = record?.text.data;
const rendered: boolean = rowList.ensureRendered(entries[0]) && rowList.hasMore && rowList.isBatched;
const shownCount: number = rowList.shownCount + rowList.rows.length;
rowList.reveal(rowList.element, true);
const next: RowRecord<Entry, { text: Text }> | undefined = rowList.move(record, 1) ?? rowList.move(null, -1);
rowList.jump(next, Infinity)?.element.focus();
rowList.renderHeader(group);
rowList.destroy();
new RowList<Entry, {}>({ container: popover, classes: listClasses, highlighter, signal: new AbortController().signal,
    // @ts-expect-error createRow must return an element
    hooks: { createRow: () => ({}), updateRow: () => {}, highlightRow: () => {}, scroller: () => popover } });

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

// Decorations: images and icons with the component's classes.
type DecoratedPart = "image" | "icon" | "label";
const decorated = createClasses<DecoratedPart>({ image: "ex-image", icon: "ex-icon", label: "ex-label" }, {});
const decorations: Decorations<DecoratedPart> = createDecorations(decorated);
const { syncImage, syncIcon, hideBrokenImages, brokenClass } = createDecorations(decorated);
const labelElement = document.createElement("span");
let icon: HTMLElement | null = syncIcon(null, "🧀", "icon", labelElement);
const image: HTMLImageElement | null = syncImage(null, "flags/de.svg", "image", icon ?? labelElement);
icon = decorations.syncIcon(icon, "", "icon", labelElement);
hideBrokenImages(element, ["image"], new AbortController().signal);
const broken: string = brokenClass("image");
// @ts-expect-error not a part
syncIcon(null, "x", "nope", labelElement);

export {};