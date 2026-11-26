// What the family's docs pages share: the theme switch, examples printed from the same <template> that runs them, code
// panels (tabs, Copy, light highlighting), the side navigation and its narrow-screen picker, the version badge, the
// browser support notice, event logs, and theming controls. Each page's own script imports it and calls what it uses;
// page.css styles the parts. Like the rest of the core it names no component: the page passes its element's name
// where one is needed.

// ---------------------------------------------------------------------------
// Theme. theme.js applied the saved choice in <head>; this wires the switch (radios named "theme") to the same key.
// ---------------------------------------------------------------------------

const darkMedia = matchMedia("(prefers-color-scheme: dark)");

/** "light" or "dark", as the page shows now. */
export function currentTheme() {
    return document.documentElement.dataset.theme ?? (darkMedia.matches ? "dark" : "light");
}

/** Calls back whenever the page's theme may have changed: the switch, or the system's setting under Auto. */
export function onThemeChange(callback) {
    new MutationObserver(callback).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    darkMedia.addEventListener("change", callback);
}

export function setupTheme(key) {
    let preference = document.documentElement.dataset.theme ?? "auto";

    document.querySelector(`input[name=theme][value=${preference}]`).checked = true;

    for (const radio of document.querySelectorAll("input[name=theme]")) {
        radio.addEventListener("change", () => {
            preference = radio.value;

            try {
                localStorage.setItem(key, preference);
            } catch {
            }

            if (preference === "auto") delete document.documentElement.dataset.theme;
            else document.documentElement.dataset.theme = preference;
        });
    }
}

// ---------------------------------------------------------------------------
// Examples. An .example holds a <template> with the live markup, and optionally <script type="text/plain"
// data-code="CSS"> blocks for more tabs. The template is copied onto a stage and printed as the HTML tab, so the
// example and its code can't drift apart. Page controls for the example (marked .stage-extra) go on the stage under it,
// and aren't printed. A <template data-code> or <script type="text/plain" data-code> outside an example is just a code
// block.
//
// prepare(content) may change a template's content before it's printed and copied (to fill demo data, say).
// mount(stage, content) may put the example on its stage itself, and return (a promise of) the element holding it, as a
// skin's shadow root does. example.stageReady resolves to that element.
// ---------------------------------------------------------------------------

export function setupExamples({ prepare, mount } = {}) {
    for (const example of document.querySelectorAll(".example")) {
        const template = example.querySelector(":scope > template:not([data-code])");
        const stage = document.createElement("div");
        const extras = [...example.querySelectorAll(":scope > .stage-extra")];
        const tabs = [];

        stage.className = "stage";

        if (template) {
            prepare?.(template.content);
            tabs.push({ label: "HTML", text: printHTML(template.content.childNodes), html: true });
        }

        if (template && mount) {
            example.stageReady = Promise.resolve(mount(stage, template.content));
        } else {
            if (template) stage.append(template.content.cloneNode(true));
            example.stageReady = Promise.resolve(stage);
        }
        stage.append(...extras);

        const blocks = [...example.querySelectorAll(":scope > [data-code]")];
        tabs.push(...blocks.map(codeTab));

        const panel = codePanel(tabs);
        example.replaceChildren(stage, panel);
        blocks.forEach(block => loadCode(block, panel));
    }
}

export function setupCodeBlocks() {
    for (const block of document.querySelectorAll("template[data-code], script[type='text/plain'][data-code]")) {
        const panel = codePanel([codeTab(block)]);
        block.replaceWith(panel);
        loadCode(block, panel);
    }
}

// A block with data-src shows that file, so the code shown is the code that runs.
function loadCode(block, panel) {
    if (!block.dataset.src) return;

    fetch(block.dataset.src)
        .then(response => response.text())
        .then(text => panel.setCode(block.dataset.code, text.replace(/\r\n/g, "\n").trim()))
        .catch(() => {
        });
}

function codeTab(block) {
    return block.localName === "template"
        ? { label: block.dataset.code, text: printHTML(block.content.childNodes), html: true }
        : { label: block.dataset.code, text: dedent(block.textContent), html: false };
}

/**
 * A code box with tabs (or a single label), a Copy button, and the highlighted code. A tab is { label, text, html }.
 * panel.setCode(label, text) changes a tab's code, as for the CSS that theming controls write.
 */
export function codePanel(tabs) {
    const panel = document.createElement("div");
    const bar = document.createElement("div");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const copy = document.createElement("button");
    let current = tabs[0];

    panel.setCode = (label, text) => {
        const tab = tabs.find(tab => tab.label === label);
        tab.text = text;
        if (tab === current) show(tab);
    };

    const show = tab => {
        current = tab;
        code.innerHTML = tab.html ? highlightHTML(tab.text) : highlightCode(tab.text);
        for (const button of bar.querySelectorAll("[role=tab]")) {
            button.setAttribute("aria-selected", button.textContent === tab.label);
        }
    };

    panel.className = "code";
    bar.className = "code-bar";

    if (tabs.length > 1) {
        bar.setAttribute("role", "tablist");
        for (const tab of tabs) {
            const button = document.createElement("button");
            button.type = "button";
            button.setAttribute("role", "tab");
            button.textContent = tab.label;
            button.addEventListener("click", () => show(tab));
            bar.append(button);
        }
    } else {
        const label = document.createElement("span");
        label.className = "code-label";
        label.textContent = tabs[0].label;
        bar.append(label);
    }

    copy.type = "button";
    copy.className = "button copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(current.text);
            copy.textContent = "Copied";
        } catch {
            copy.textContent = "Can't copy";
        }
        setTimeout(() => copy.textContent = "Copy", 1500);
    });
    bar.append(copy);

    pre.append(code);
    panel.append(bar, pre);
    show(current);
    return panel;
}

/** Removes the blank lines around a block and the indentation its lines share. */
export function dedent(text) {
    const lines = text.replace(/^\s*\n|\n\s*$/g, "").split("\n");
    const indent = Math.min(...lines.filter(line => line.trim()).map(line => line.match(/^\s*/)[0].length));
    return lines.map(line => line.slice(indent)).join("\n");
}

// ---------------------------------------------------------------------------
// Printing and highlighting
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set(["br", "hr", "img", "input", "link", "meta"]);
const LONG_LIST = 7;
const SHORT_LIST = 5;

export const escapeHTML = text => text.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);

/**
 * Prints nodes as indented HTML, one element per line. Lists of more than LONG_LIST options (a select's, a datalist's)
 * are cut short after SHORT_LIST of them, with a comment saying how many more there are.
 */
export function printHTML(nodes, depth = 0) {
    const pad = "  ".repeat(depth);
    const lines = [];

    for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.data.trim()) lines.push(pad + escapeHTML(node.data.trim()));
        } else if (node.nodeType === Node.COMMENT_NODE) {
            lines.push(`${pad}<!--${node.data}-->`);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const name = node.localName;
            const attributes = [...node.attributes]
                .map(({ name, value }) => value === "" ? ` ${name}` : ` ${name}="${escapeHTML(value)}"`).join("");
            const children = [...node.childNodes];

            if (VOID_ELEMENTS.has(name)) {
                lines.push(`${pad}<${name}${attributes}>`);
            } else if (children.every(child => child.nodeType === Node.TEXT_NODE)) {
                const text = node.textContent.trim();

                // A script written over several lines keeps its lines, indented one step inside the tag, even a single
                // statement, as a long import.
                if (name === "script" && node.textContent.includes("\n")) {
                    const body = dedent(node.textContent).split("\n").map(line => line && `${pad}  ${line}`).join("\n");
                    lines.push(`${pad}<${name}${attributes}>`, body, `${pad}</${name}>`);
                } else {
                    lines.push(`${pad}<${name}${attributes}>${name === "script" ? text : escapeHTML(text)}</${name}>`);
                }
            } else {
                const options = children.filter(child => child.localName === "option");
                let shown = children;

                if (options.length > LONG_LIST) {
                    shown = children.filter(child => child.localName !== "option" || options.indexOf(child) < SHORT_LIST);
                    shown.splice(shown.indexOf(options[SHORT_LIST - 1]) + 1, 0,
                        document.createComment(` ${options.length - SHORT_LIST} more options `));
                }

                lines.push(`${pad}<${name}${attributes}>`, printHTML(shown, depth + 1), `${pad}</${name}>`);
            }
        }
    }

    return lines.filter(Boolean).join("\n");
}

const token = (kind, text) => `<span class="tok-${kind}">${escapeHTML(text)}</span>`;

export function highlightHTML(text) {
    return text.replace(/(<!--[\s\S]*?-->)|(<\/?[\w-]+)([^>]*?)(\/?>)|[^<]+|</g, (match, comment, open, attributes, close) => {
        if (comment) return token("comment", comment);
        if (!open) return escapeHTML(match);

        const highlighted = attributes.replace(/([^\s=]+)(?:=("[^"]*"))?/g, (_, name, value) =>
            token("attr", name) + (value ? "=" + token("value", value) : ""));
        return token("tag", open) + highlighted + token("tag", close);
    });
}

/** Comments and strings, which is enough for the short JS, CSS and shell snippets on a docs page. */
export function highlightCode(text) {
    return text.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("[^"\n]*"|'[^'\n]*')|[^/"']+|[\s\S]/g, (match, comment, string) =>
        comment ? token("comment", comment) : string ? token("value", string) : escapeHTML(match));
}

// ---------------------------------------------------------------------------
// Header and navigation
// ---------------------------------------------------------------------------

/** The version badge (#version) from the component's package.json; "preview" before the first release (0.0.0). */
export function setupVersion() {
    const badge = document.getElementById("version");

    fetch("../package.json")
        .then(response => response.json())
        .then(({ version }) => {
            badge.textContent = version === "0.0.0" ? "preview" : version;
            badge.hidden = false;
        })
        .catch(() => {
        });
}

/**
 * The side navigation (.sidenav nav: <p> group labels and links) marks the current section: the last one whose top has
 * scrolled past the line just under the header, or the last one on the page once it's scrolled to the bottom.
 *
 * On narrow screens it becomes a select at the top of <main>, built from the same links. `wrap` names an element to
 * wrap that select in (a component that enhances selects), and `sync(wrapper, id)` tells it the select's value changed
 * from script, which fires no change event.
 */
export function setupNavigation({ wrap, sync } = {}) {
    const links = [...document.querySelectorAll(".sidenav a")];
    const sections = links.map(link => document.getElementById(link.hash.slice(1)));
    const bar = document.createElement("div");
    const select = document.createElement("select");
    const wrapper = wrap ? document.createElement(wrap) : select;
    let group;
    let shown;

    for (const child of document.querySelector(".sidenav nav").children) {
        if (child.localName === "p") {
            group = document.createElement("optgroup");
            group.label = child.textContent;
            select.append(group);
        } else {
            (group ?? select).append(new Option(child.textContent, child.hash.slice(1)));
        }
    }

    select.setAttribute("aria-label", "Go to section");
    select.addEventListener("change", () => document.getElementById(select.value).scrollIntoView());

    bar.className = "phone-nav";
    if (wrapper !== select) wrapper.append(select);
    bar.append(wrapper);
    document.querySelector("main").prepend(bar);

    const update = () => {
        // Under whichever bar is lower: the header, or on phones the section bar, which stays once the header has
        // scrolled away.
        const bars = [document.querySelector(".topbar"), bar];
        const line = Math.max(...bars.map(bar => bar.getBoundingClientRect().bottom)) + 24;
        const bottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
        const current = bottom ? sections.at(-1) : sections.findLast(section => section.getBoundingClientRect().top <= line) ?? sections[0];

        if (current === shown) return;
        shown = current;

        links.forEach((link, index) => {
            if (sections[index] === current) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
        });

        select.value = current.id;
        if (wrapper !== select) sync?.(wrapper, current.id);
    };

    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
}

/**
 * Shows #no-support where the browser lacks what the component needs, and says which in [data-support] (the Browser
 * support section), with the page's own texts.
 */
export function setupSupportNotice({ supported, yes, no }) {
    document.getElementById("no-support").hidden = supported;
    const check = document.querySelector("[data-support]");
    if (check) check.textContent = supported ? yes : no;
}

// ---------------------------------------------------------------------------
// Small parts of examples
// ---------------------------------------------------------------------------

/** A writer for an event log (an <ol class="log">): the newest entry goes first, and only the last `size` are kept. */
export function eventLog(list, size = 5) {
    return text => {
        list.insertAdjacentHTML("afterbegin", "<li></li>");
        list.firstElementChild.textContent = text;
        list.children[size]?.remove();
    };
}

/**
 * Theming controls: inputs with data-var (and data-unit, and data-dark for the dark theme's default) set CSS variables
 * on the example's stage, and its CSS tab shows the ones that changed, as a rule for `selector`. A [data-reset] button
 * puts them back.
 */
export async function setupTheming(example, selector) {
    const stage = await example.stageReady;
    const panel = example.querySelector(".code");
    const inputs = [...example.querySelectorAll("[data-var]")];
    const changed = new Set();
    const cssValue = input => input.value + (input.dataset.unit ?? "");

    // The controls nobody has moved show the default for the current theme.
    const showDefaults = () => {
        const dark = currentTheme() === "dark";
        for (const input of inputs) {
            if (!changed.has(input)) input.value = dark && input.dataset.dark ? input.dataset.dark : input.defaultValue;
        }
    };

    const update = () => {
        for (const input of inputs) {
            if (changed.has(input)) stage.style.setProperty(input.dataset.var, cssValue(input));
            else stage.style.removeProperty(input.dataset.var);
        }

        panel.setCode("CSS", changed.size
            ? `${selector} {\n${[...changed].map(input => `  ${input.dataset.var}: ${cssValue(input)};`).join("\n")}\n}`
            : "/* Move a control to see the CSS. */");
    };

    for (const input of inputs) input.addEventListener("input", () => {
        changed.add(input);
        update();
    });

    example.querySelector("[data-reset]").addEventListener("click", () => {
        changed.clear();
        showDefaults();
        update();
    });

    onThemeChange(showDefaults);
    showDefaults();
    update();
}