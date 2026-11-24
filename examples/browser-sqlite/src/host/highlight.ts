import { createHighlighterCore, type HighlighterCore, type LanguageRegistration } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

const tse: LanguageRegistration = {
  name: "tse",
  scopeName: "text.html.tse",
  embeddedLangs: ["html", "typescript"],
  patterns: [{ include: "#tag" }, { include: "text.html.basic" }],
  injections: {
    "L:text.html.tse - source.ts.embedded.tse": { patterns: [{ include: "#tag" }] },
  },
  repository: {
    tag: {
      begin: "<%[=-]?",
      end: "-?%>",
      beginCaptures: { 0: { name: "punctuation.section.embedded.begin.tse" } },
      endCaptures: { 0: { name: "punctuation.section.embedded.end.tse" } },
      contentName: "source.ts.embedded.tse",
      patterns: [{ include: "source.ts" }],
    },
  },
};

let highlighter: Promise<HighlighterCore> | undefined;

function load(): Promise<HighlighterCore> {
  return (highlighter ??= createHighlighterCore({
    themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
    langs: [
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/html.mjs"),
      import("shiki/langs/json.mjs"),
      tse,
    ],
    engine: createOnigurumaEngine(import("shiki/wasm")),
  }));
}

function language(path: string): string {
  if (path.endsWith(".tse")) return "tse";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".html")) return "html";
  return "text";
}

/** The source as highlighted HTML for the editor's backdrop, in `github-light`, with `github-dark` as `--shiki-dark`. */
export async function highlight(source: string, path: string): Promise<string> {
  const shiki = await load();
  return shiki.codeToHtml(source, {
    lang: language(path),
    themes: { light: "github-light", dark: "github-dark" },
  });
}
