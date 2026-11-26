# Burrowkit

The shared core of a family of web components that enhance native form controls while the native element stays the real control. It holds mechanisms, not looks or texts: search (folding, initials, strong matches first), match highlighting, the language engine, the class-plug mechanism, image and icon decorations, and, later, the list rendering and the phone sheet.

Its users are [Platypicker](https://github.com/peter-petkov/platypicker), for `<select>`, and [Datalynx](https://github.com/peter-petkov/datalynx), for `<input list>`. Nothing in it names either: anything page-wide (CSS highlight names, class and variable prefixes) is named by the component that uses it, so two versions of the core can share a page.

Besides `src/`, it holds the tools the components build and check with (`tools/`: esbuild build, browser check, static server) and what their docs pages share (`docs/`: `theme.js`, `page.js` and `page.css`, for the header, navigation, examples printed from templates, code panels and theming controls).

Work in progress: nothing to install yet.

## License

Burrowkit is released under the [MIT License](LICENSE).