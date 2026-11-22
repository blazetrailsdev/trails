import { codeToHtml } from "shiki";

import { PACKAGE_GROUPS } from "$lib/package-groups";
import { RAILS_FRAMEWORKS, loadParity, percent, shortSha, type PackageFigures } from "$lib/parity";
import {
  LANDING_BLOCKS,
  LANDING_STEPS,
  landingHero,
  quickstartBlock,
  quickstartBlocks,
} from "$lib/quickstart";

type Ratio = NonNullable<PackageFigures["api"]>;

function total(ratios: (Ratio | null)[]): Ratio | null {
  const r = { matched: 0, total: 0 };
  for (const x of ratios) {
    if (x === null) continue;
    r.matched += x.matched;
    r.total += x.total;
  }
  return r.total === 0 ? null : r;
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
  const qs = await quickstartBlocks();
  const hero = landingHero(qs);
  const byName = new Map(parity.packages.map((p) => [p.name, p]));
  const html = (code: string, lang: string) =>
    codeToHtml(code, {
      lang: code.startsWith("<!DOCTYPE") ? "html" : lang || "text",
      theme: "github-dark",
    });
  return {
    measuredAt: shortSha(parity.measuredAt),
    buildRef: parity.buildRef,
    headline: percent(
      total(
        parity.packages
          .filter((p) => p.railsCounterpart !== null && RAILS_FRAMEWORKS.has(p.railsCounterpart))
          .map((p) => p.api),
      ),
    ),
    groups: PACKAGE_GROUPS.map((g) => ({
      title: g.title,
      packages: g.packages.map((name) => {
        const p = byName.get(name);
        return {
          name,
          railsCounterpart: p?.railsCounterpart ?? null,
          api: percent(p?.api ?? null),
          tests: percent(p?.tests ?? null),
        };
      }),
    })),
    hero: {
      file: hero.file.code.split("\n")[0].replace(/^\/\/ /, ""),
      html: await withError(
        hero.file.code,
        "ts",
        hero.line,
        hero.column - 1,
        hero.column,
        hero.error.code,
      ),
    },
    blocks: await Promise.all(
      LANDING_BLOCKS.map(async ({ region, prefix, title, body }) => {
        const b = quickstartBlock(qs, region, prefix);
        return { title, body: body.split("`"), html: await html(b.code, b.lang) };
      }),
    ),
    steps: await Promise.all(
      LANDING_STEPS.map(async ({ region, prefix, tag, title }) => {
        const b = quickstartBlock(qs, region, prefix);
        return { tag, title, html: await html(b.code, b.lang) };
      }),
    ),
  };
}
