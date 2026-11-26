// Writes a component's dist/: the component bundled into single files, each with a source map into src/, for pages
// that load it from a CDN or a file, with no build of their own. A component's tools/build.mjs calls build() with its
// settings, and says which files it writes.
//
// For each of the component and its skins: a plain script, which needs no module support, defines the element and
// sets the global; and a module, which defines the element as it's imported and exports the class. Each also
// minified (.min.js). A skin has to set its classes before any element is created, so each skin gets builds of its
// own (name.skin.js) rather than a file to load in the right order. Then the stylesheet, as it is (it keeps its
// nesting, which every supported browser has) and minified. Burrowkit and the component's translations are bundled
// in: they load on demand from src/, but a single file has nothing beside it to load them from.
//
// esbuild is the component's own dev dependency, loaded from its folder.
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

/**
 * Builds `root`/dist from `root`/src: `name` names the files (name.js, name.esm.js, name.skin.js, name.css),
 * `global` is what the plain scripts set on window, `entry` the element's module in src/, `skins` the skins in
 * src/skins/ by name, and `css` the stylesheet in src/.
 */
export async function build({ root, name, global, entry, skins = [], css }) {
    const { build: esbuild } = createRequire(join(root, "package.json"))("esbuild");
    const src = join(root, "src");
    const dist = join(root, "dist");

    const options = {
        sourcemap: true,
        sourcesContent: false,  // The maps point to the files in src/, which the package has too.
        legalComments: "none",
        target: "esnext",
        logLevel: "warning",
    };

    // A module script keeps its top-level names to itself, so the plain script sets the global on globalThis. A module
    // is always read as UTF-8, so it can keep the translations' letters rather than \u escapes.
    const bundle = (skin, esm, minify) => {
        const file = [name, skin, esm && "esm", minify && "min", "js"].filter(Boolean).join(".");
        return {
            ...options,
            minify,
            stdin: {
                contents: (skin ? `import "./skins/${skin}.js";\n` : "") +
                    `import ${global} from "./${entry}";\n` +
                    (esm ? `export default ${global};\n` : `globalThis.${global} = ${global};\n`),
                resolveDir: src,
                sourcefile: file.replace(".min", "").replace(/js$/, "entry.js"),  // Not the entry module itself.
            },
            bundle: true,
            format: esm ? "esm" : "iife",
            charset: esm ? "utf8" : "ascii",
            outfile: join(dist, file),
        };
    };

    const builds = [];
    for (const skin of [null, ...skins]) {
        for (const esm of [false, true]) {
            for (const minify of [false, true]) builds.push(bundle(skin, esm, minify));
        }
    }
    for (const minify of [false, true]) {
        builds.push({
            ...options,
            minify,
            entryPoints: [join(src, css)],
            outfile: join(dist, minify ? css.replace(/\.css$/, ".min.css") : css),
        });
    }

    await rm(dist, { recursive: true, force: true });
    await Promise.all(builds.map(options => esbuild(options)));

    console.log(`Built ${builds.length} files into ${relative(root, dist)}/`);
}