# Burrowkit

The shared core of a family of web components that enhance native form controls while the native element stays the real control. It holds mechanisms, not looks or texts: search (folding, initials, strong matches first), match highlighting, the language engine, the class-plug mechanism, image and icon decorations, the list rendering, the screen-reader status line and the CSS they share; the phone sheet is to follow.

Its users are [Platypicker](https://github.com/peter-petkov/platypicker), for `<select>`, and [Datalynx](https://github.com/peter-petkov/datalynx), for `<input list>`. Nothing in it names either: anything page-wide (CSS highlight names, class and variable prefixes) is named by the component that uses it, so two versions of the core can share a page.

Pages don't load Burrowkit themselves: a component's `dist/` bundles inline it, so a CDN user still loads one script and one stylesheet. It's for the components, and for anyone building one of their own.

## Install

```sh
npm install burrowkit
```

The modules are plain ES modules with no dependencies, imported by path (`burrowkit/<module>.js` is `src/<module>.js`), each with a hand-written `.d.ts` beside it:

```js
import Search from "burrowkit/search.js";
import Highlighter from "burrowkit/highlighter.js";
```

A docs page that loads a component's `src/` straight in the browser maps the name in an import map: `{ "imports": { "burrowkit/": "./node_modules/burrowkit/src/" } }`.

## Modules

| Module | What it does |
|---|---|
| `search.js` | `Search`: case and accents folded by the language's rules, a query matching by its letters in order, the first at a word start (initials: "nyc" finds New York City) or anywhere as a whole; strong matches (every piece at a word start) reported for showing first, as pieces of the original text for highlighting. |
| `locale.js` | `validLocale(tag)`: the tag if it's a valid language tag, otherwise undefined (the browser's own language). |
| `highlighter.js` | `Highlighter`: wraps the CSS Custom Highlight API, under a highlight name the component gives; instances sharing a name share the highlight, and each removes only its own ranges. |
| `languages.js` | `Languages`: a component's texts in the language of its nearest `lang` (across shadow roots), translations loaded on demand from the component's own folder, page-registered languages winning text by text, plural forms by `Intl.PluralRules`. |
| `announcer.js` | `Announcer`: a status line for screen readers (a polite live region) on an element the component makes: `say()` now, emptied first so a repeat is heard, or `sayLater()` once typing pauses, the latest message replacing a pending one. |
| `classes.js` | `createClasses(fixed, classes)`: puts each part's fixed class (in the component's prefix) and its plug (extra classes a skin or the page fills) on the component's elements. |
| `decorations.js` | `createDecorations(classes)`: the image (`data-image`) and icon (`data-icon`) before an entry's label, with the component's classes; a broken image gets a `-broken` class. |
| `filtered-view.js` | `FilteredView`: the entries matching a search, found lazily; strong matches first, groups moving as a whole with their best match, rows never reordered within a tier. `SearchCache` remembers folded and prepared texts. |
| `list.js` | `RowList`: the rows of a `FilteredView`, rendered a batch at a time as the list scrolls, in time slices; keeps rows across changes, renders group headers and dividers, numbers rows for screen readers, moves between rows by keyboard. What a row shows is the component's, through hooks. |

## Shared CSS

Plain CSS can't take a class or variable prefix as a parameter, so the CSS the components share is a template written in placeholder names, `src/styles/popover.css`, which a component copies into its own stylesheet under its own names. It holds what is the same in each: the popover's positioning, the tokens, the layout of the list, its rows and the screen-reader status line, the search highlight, and the shared paint and forced colors. What differs stays in the component's own rules: which row is active (hover, focus or selection, with its forced colors), the rows' inline padding, the reset of the list's items, and everything of its own, the control's `anchor-name` among it.

| Placeholder | Replaced by | With `host: "x-picker"`, `prefix: "xp"`, `name: "xpicker"` |
|---|---|---|
| `burrow-host` | `host`, the element | `x-picker` |
| `.bk-*` | `prefix`, the classes | `.xp-item` |
| `--_bk-*`, `--_bk-skin-*` | `prefix`, the private tokens and the values a skin sets | `--_xp-hover`, `--_xp-skin-hover-bg` |
| `bk-skin` | `prefix`, the class a skin adds to the element to turn paint off | `xp-skin` |
| `--burrowkit-*` | `name`, the variables a page sets | `--xpicker-hover-bg` |
| `--burrowkit`, `--burrowkit-above` | `name`, the anchor and the `@position-try` | `--xpicker`, `--xpicker-above` |
| `burrowkit-highlight`, `burrowkit-pulse` | `name`, the CSS highlight and the keyframes | `xpicker-highlight`, `xpicker-pulse` |

The component's stylesheet carries two marker comments where the shared rules go, each on a line of its own, inside its `@supports` and before its own rules, so that its rules win where the specificity is equal. The component's control sets `anchor-name: --xpicker` there, since only the component knows what its control is.

```css
/* Burrowkit popover.css begin */
/* Burrowkit popover.css end */
```

A thin `tools/sync-css.mjs` fills the region between them:

```js
import { fileURLToPath } from "node:url";
import { syncCss } from "burrowkit/tools/sync-css.mjs";

await syncCss({
    root: fileURLToPath(new URL("..", import.meta.url)),
    css: "xpicker.css",  // In src/.
    host: "x-picker",
    prefix: "xp",
    name: "xpicker",
});
```

with the scripts `"sync:css": "node tools/sync-css.mjs"` and `"check:css": "node tools/sync-css.mjs --check"`. Run `npm run sync:css` after a change to the template or a new Burrowkit version, and commit the result: the stylesheet stays complete plain CSS, with no `@import` and no build step. `npm run check:css` changes nothing and exits non-zero when the region differs from the installed Burrowkit's (the first marker names the version, so another version differs too). Run it in CI before the build, where it also catches a template change that isn't released yet. Edits inside the region are lost on the next sync.

## Tools

Node scripts a component calls from thin `tools/` files of its own (`burrowkit/tools/<tool>.mjs`):

| Tool | What it does |
|---|---|
| `serve.mjs` | `createStaticServer(root)`, or `node node_modules/burrowkit/tools/serve.mjs <root> [port]`: the static server for developing, with `/` leading to the docs page; in an npm workspace, `/node_modules/` paths fall back to the workspace's. |
| `build.mjs` | `build(settings)`: a component's `dist/`, with esbuild (the component's own dev dependency): a plain script and a module for the component and each skin, minified too, and the stylesheet; Burrowkit and the translations bundled in. |
| `browser-check.mjs` | `check(settings)`: opens the docs page headless in the installed Firefox or Chrome, or Playwright's WebKit, and reports what the browser supports and how many elements were enhanced; can run a script and save a screenshot. |
| `sync-css.mjs` | `syncCss(settings)`: writes the shared CSS into a component's stylesheet, or checks it with `--check` (see [Shared CSS](#shared-css)). |

## Docs

What the components' docs pages share (`burrowkit/docs/<file>`): `theme.js` (auto, light or dark, remembered), `page.js` (the header, navigation, examples printed from templates, code panels, the version, an event log and theming controls) and `page.css`.

## License

Burrowkit is released under the [MIT License](LICENSE).