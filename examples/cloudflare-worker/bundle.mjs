import { build } from "esbuild";

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
  minify: true,
  define: { "import.meta.url": JSON.stringify("file:///bundle/dist/worker.js") },
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(\"file:///bundle/dist/worker.js\");",
  },
  plugins: [withoutLibxml2],
  logLimit: 0,
});
for (const w of result.warnings) console.warn(w.text);
