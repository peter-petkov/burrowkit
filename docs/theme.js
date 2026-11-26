// The docs page's Light / Dark / Auto choice, applied before the page is drawn. A classic script in <head>, so the page
// never flashes the wrong theme. The page names the storage key, as page-wide names are its own:
//
//   <script src="../node_modules/burrowkit/docs/theme.js" data-key="pp-theme"></script>
//
// Auto leaves data-theme off, so the page's "color-scheme: light dark" follows the system. page.js's setupTheme()
// wires the switch to the same key.
(() => {
    let theme = "auto";

    try {
        theme = localStorage.getItem(document.currentScript.dataset.key) || "auto";
    } catch {
    }

    if (theme !== "auto") document.documentElement.dataset.theme = theme;
})();