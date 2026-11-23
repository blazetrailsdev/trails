import { codeToHtml } from "shiki";

import * as fs from "fs/promises";
import * as path from "path";

import { GITHUB_REPO, REPO_ROOT, loadParity, percent, shortSha } from "$lib/parity";

const EXAMPLE = "examples/homepage";
const EXAMPLE_ROOT = path.join(REPO_ROOT, EXAMPLE);

const blocks = [
  {
    file: "app/models/post.ts",
    lang: "ts",
    title: "Models are typed classes.",
    body: "One model can draw on most of the stack: associations and validations, an attached image, a rich-text body, an encrypted column, live Turbo broadcasts, and a background job run after commit.",
  },
  {
    file: "app/controllers/posts-controller.ts",
    lang: "ts",
    title: "Controllers turn requests into responses.",
    body: "An action reads params, loads records, and renders a view or redirects. Filters, strong parameters and HTTP caching come with it, under the names Rails uses.",
  },
  {
    file: "config/routes.ts",
    lang: "ts",
    title: "Routes map URLs to actions.",
    body: "The routing DSL keeps Rails' names: `resources` with nested and shallow routes, `member` actions, and named routes.",
  },
  {
    file: "app/views/posts/show.html.tse",
    lang: "erb",
    title: "Views are typed templates.",
    body: "TSE (TypeScript Embedded) is trails' replacement for ERB (Embedded RuBy): the same `<% %>` and `<%= %>` tags, with TypeScript inside. Helpers such as `imageTag` and `turboStreamFrom` keep their Rails names.",
  },
  {
    file: "app/views/post-mailer/published.html.tse",
    lang: "erb",
    title: "Typed templates, even in email.",
    body: "A mailer view is checked like any other: `post` has the type `PostMailer` declares, and `render` checks the partial's locals against its `locals:` signature.",
  },
];

const HERO = path.join(EXAMPLE_ROOT, "hero");

async function heroPane(file: string, source: string, lang: string) {
  const errors: Record<string, string> = JSON.parse(
    await fs.readFile(path.join(HERO, "errors.json"), "utf8"),
  );
  const error = errors[file];
  const [, line, col] = /\((\d+),(\d+)\): /.exec(error)!;
  const [, name] = /'([^']+)' does not exist/.exec(error)!;
  const code = (await fs.readFile(path.join(HERO, source), "utf8")).trimEnd();
  const from = Number(col) - 1;
  return withError(code, lang, Number(line), from, from + name.length, error);
}

function withError(
  code: string,
  lang: string,
  line: number,
  from: number,
  to: number,
  message: string,
) {
  return codeToHtml(code, {
    lang,
    theme: "github-dark",
    decorations: [
      {
        start: { line: line - 1, character: from },
        end: { line: line - 1, character: to },
        properties: { class: "squiggle" },
      },
    ],
    transformers: [
      {
        line(node, n) {
          if (n === line) {
            node.children.push({
              type: "element",
              tagName: "span",
              properties: { class: "tip" },
              children: [{ type: "text", value: message }],
            });
          }
        },
      },
    ],
  });
}

export async function load() {
  const parity = await loadParity();
  return {
    measuredAt: shortSha(parity.measuredAt),
    buildRef: parity.buildRef,
    coverage: Object.fromEntries(parity.packages.map((p) => [p.name, percent(p.api)])),
    hero: {
      check: await heroPane("app/controllers/posts-controller.ts", "posts-controller.ts", "ts"),
      view: await heroPane("app/views/post-mailer/published.html.tse", "published.html.tse", "erb"),
    },
    blocks: await Promise.all(
      blocks.map(async ({ lang, ...rest }) => ({
        ...rest,
        body: rest.body.split("`"),
        href: `${GITHUB_REPO}/blob/${parity.buildRef}/${EXAMPLE}/${rest.file}`,
        html: await codeToHtml(
          (await fs.readFile(path.join(EXAMPLE_ROOT, rest.file), "utf8"))
            .replace(/^(import [^;]*;\n)+\n?/, "")
            .trimEnd(),
          { lang, theme: "github-dark" },
        ),
      })),
    ),
  };
}
