import { codeToHtml } from "shiki";

import * as fs from "fs/promises";
import * as path from "path";

import { check, checkError, squiggle, view, viewError } from "$lib/landing-samples";
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
    file: "app/views/posts/show.html.tse",
    lang: "erb",
    title: "Views are typed templates.",
    body: "TSE (TypeScript Embedded) is trails' replacement for ERB (Embedded RuBy): the same `<% %>` and `<%= %>` tags, with TypeScript inside. Helpers such as `imageTag` and `turboStreamFrom` keep their Rails names.",
  },
  {
    file: "app/jobs/notify-followers-job.ts",
    lang: "ts",
    title: "Jobs and mail run in the background.",
    body: "Active Job queues work to run after the request, here a mailer that emails the post's followers. Jobs and messages can also be exchanged with a Ruby Rails app.",
  },
];

function withError(code: string, lang: string, message: string) {
  const { line, from, to } = squiggle(message);
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
      check: await withError(check, "ts", checkError),
      view: await withError(view, "erb", viewError),
    },
    blocks: await Promise.all(
      blocks.map(async ({ lang, ...rest }) => ({
        ...rest,
        body: rest.body.split("`"),
        href: `${GITHUB_REPO}/blob/${parity.buildRef}/${EXAMPLE}/${rest.file}`,
        html: await codeToHtml(
          (await fs.readFile(path.join(EXAMPLE_ROOT, rest.file), "utf8")).trimEnd(),
          { lang, theme: "github-dark" },
        ),
      })),
    ),
  };
}
