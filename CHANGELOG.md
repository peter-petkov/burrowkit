# Changelog

## 0.2

- `announcer.js`: `Announcer`, the status line for screen readers that Platypicker and Datalynx each kept, as a polite live region on an element the component makes. `say()` speaks now (emptied first, so a repeat is heard), `sayLater()` once typing pauses; one message is pending at a time and the latest wins. With its `.d.ts`.

## 0.1

The first release: the modules [Platypicker](https://github.com/peter-petkov/platypicker) and [Datalynx](https://github.com/peter-petkov/datalynx) share, moved in from Platypicker. See the [README](README.md) for what each one does.

- Modules: `search.js` (folding, initials matching, strong matches first) with `locale.js`, `highlighter.js` (the CSS Custom Highlight API), `languages.js` (texts, plural forms, a loader the component points at its own translations), `classes.js` (fixed classes and plugs), `decorations.js` (images and icons), `filtered-view.js` (the entries matching a search, found lazily) and `list.js` (`RowList`: rows shown in batches, moving between them by keyboard), each with its hand-written `.d.ts`.
- Tools: `serve.mjs` (the static server for development), `build.mjs` (a component's `dist/` bundles, with esbuild) and `browser-check.mjs` (Firefox, Chrome or WebKit, headless, from the command line).
- Docs: `theme.js`, `page.js` and `page.css`, what the components' docs pages share.