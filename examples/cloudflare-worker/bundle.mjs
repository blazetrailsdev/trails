import { build } from "esbuild";

// workerd refuses to compile WebAssembly at run time. libxml2-wasm compiles its inline binary when
// `libxml2.mjs` is evaluated, and Emscripten's `addFunction` compiles a wrapper module per JS callback,
// so Nokogiri's native extension cannot load. Nothing in this app parses HTML; the extension module is
// bundled empty and `Nokogiri.LibXml2` stays unset.
const withoutLibxml2 = {
  name: "without-libxml2",
  setup(b) {
    b.onLoad({ filter: /packages\/nokogiri\/dist\/extension\.js$/ }, () => ({
      contents: "",
      loader: "js",
    }));
  },
};

const result = await build({
  entryPoints: ["worker/index.ts"],
  bundle: true,
  platform: "node",
  conditions: ["workerd", "worker"],
  format: "esm",
  target: "es2023",
  outfile: "dist/worker.js",
  external: ["node:*", "cloudflare:*"],
  minify: false,
  // workerd leaves `import.meta.url` undefined, and trails resolves module-relative paths from it.
  define: { "import.meta.url": JSON.stringify("file:///bundle/dist/worker.js") },
  // CommonJS dependencies (pg) `require` Node built-ins, which esbuild's ESM output cannot do itself.
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(\"file:///bundle/dist/worker.js\");",
  },
  plugins: [withoutLibxml2],
  logLimit: 0,
});
for (const w of result.warnings) console.warn(w.text);
