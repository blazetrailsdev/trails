import { codeToHtml } from "shiki";

import * as fs from "fs/promises";
import * as path from "path";

import { GITHUB_REPO, loadParity, percent, shortSha } from "$lib/parity";

const EXAMPLE = "examples/cloudflare-worker";
const EXAMPLE_ROOT = `../../${EXAMPLE}`;

const blocks = [
  {
    file: "app/models/post.ts",
    lang: "ts",
    title: "Models are typed classes.",
    body: "A model class maps a table to typed attributes. Associations, validations, callbacks and scopes are declared the way Rails declares them, and queries chain into SQL.",
  },
  {
    file: "app/controllers/posts-controller.ts",
    lang: "ts",
    title: "Controllers turn requests into responses.",
    body: "An action reads params, loads records, and renders a view or redirects. Strong parameters, filters and HTTP caching come with it, under the names Rails uses.",
  },
  {
    file: "app/views/posts/index.html.tse",
    lang: "erb",
    title: "Views are typed templates.",
    body: "TSE (TypeScript Embedded) is trails' replacement for ERB (Embedded RuBy): the same <% %> and <%= %> tags, with TypeScript inside. Form builders and helpers keep their Rails names.",
  },
  {
    file: "config/routes.ts",
    lang: "ts",
    title: "Routes map URLs to actions.",
    body: "Draw routes with the familiar DSL. A resources line maps a model's RESTful actions, narrowed here with only: to the two this app serves, plus a plain get for a health check.",
  },
];

// Captured on 2026-11-21 by adding this action to a scratch copy of
// examples/cloudflare-worker and running `tsc --noEmit -p tsconfig.json`.
const check = `import { ApplicationController } from "./application-controller.ts";
import { Post } from "../models/post.ts";

export class PostsController extends ApplicationController {
  async show(): Promise<void> {
    const post = await Post.find(this.params.expect("id"));
    await this.render({ plain: post.titel });
  }
}`;

const checkError =
  "app/controllers/posts-controller.ts(7,37): error TS2551: Property 'titel' does not exist on type 'Post'. Did you mean 'title'?";

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
    coverage: Object.fromEntries(parity.packages.map((p) => [p.name, percent(p.api)])),
    hero: {
      check: await withError(check, "ts", 7, 36, 41, checkError),
    },
    blocks: await Promise.all(
      blocks.map(async ({ lang, ...rest }) => ({
        ...rest,
        href: `${GITHUB_REPO}/blob/main/${EXAMPLE}/${rest.file}`,
        html: await codeToHtml(
          (await fs.readFile(path.join(EXAMPLE_ROOT, rest.file), "utf8")).trimEnd(),
          { lang, theme: "github-dark" },
        ),
      })),
    ),
  };
}
