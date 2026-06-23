import { describe, expect, it } from "vitest";

import {
  codeSpanRanges,
  escapeForVue,
  fixDeadLinks,
  isDeadLink,
  isMediaCopy,
  resolveGeneratedLink,
  resolveTarget,
  rewriteDeadLink,
  treatAsHtml,
} from "./escape-typedoc.mjs";

const GH = "https://github.com/blazetrailsdev/trails";

// Pages that survive in the generated `api/` tree: package index pages + the
// markdown typedoc copied into `_media`. Cross-tree targets are absent —
// exactly the links VitePress flags as dead.
const PAGES = new Set([
  "api/@blazetrails/activerecord/README",
  "api/_media/README",
  "api/_media/arel-rails-deviations",
]);
const pageExists = (p: string) => PAGES.has(p);

describe("treatAsHtml", () => {
  it("treats extensionless and .md/.html targets as pages", () => {
    expect(treatAsHtml("index")).toBe(true);
    expect(treatAsHtml("foo.md")).toBe(true);
    expect(treatAsHtml("foo.html")).toBe(true);
  });

  it("leaves known asset/source extensions alone", () => {
    for (const t of ["a.ts", "a.png", "a.json", "a.svg", "a.css", "a.js"]) {
      expect(treatAsHtml(t)).toBe(false);
    }
  });
});

describe("resolveTarget", () => {
  it("resolves a relative link to a srcDir-relative page path", () => {
    expect(resolveTarget("./index.md", "api/_media")).toBe("api/_media/index");
    expect(resolveTarget("../../_media/README.md", "api/@blazetrails/activerecord")).toBe(
      "api/_media/README",
    );
  });

  it("returns null for external, anchor, and asset links", () => {
    expect(resolveTarget("https://x.dev", "api/_media")).toBeNull();
    expect(resolveTarget("#section", "api/_media")).toBeNull();
    expect(resolveTarget("./logo.png", "api/_media")).toBeNull();
    expect(resolveTarget("./associations.ts", "api/_media")).toBeNull();
  });

  it("strips query/hash and maps a trailing slash to index", () => {
    expect(resolveTarget("./README.md#frag", "api/_media")).toBe("api/_media/README");
    expect(resolveTarget("./sub/", "api/_media")).toBe("api/_media/sub/index");
  });
});

describe("isDeadLink", () => {
  const dir = "api/_media";

  it("flags relative links that resolve to no page", () => {
    expect(isDeadLink("./index.md", dir, pageExists)).toBe(true);
    expect(isDeadLink("../../README.md", dir, pageExists)).toBe(true);
  });

  it("keeps links that resolve to a real generated page", () => {
    expect(isDeadLink("./README.md", dir, pageExists)).toBe(false);
    expect(isDeadLink("./arel-rails-deviations.md", dir, pageExists)).toBe(false);
  });

  it("never flags anchors, external, or asset links", () => {
    expect(isDeadLink("#section", dir, pageExists)).toBe(false);
    expect(isDeadLink("https://github.com/x", dir, pageExists)).toBe(false);
    expect(isDeadLink("./declare-patterns.test-d.ts", dir, pageExists)).toBe(false);
  });
});

describe("rewriteDeadLink", () => {
  // A media copy of a guides page: relative links resolve against the guide's
  // source dir.
  const guideCtx = {
    originDir: "packages/website/docs/guides",
    mediaEntryToRepo: () => null,
    repoKind: (p: string) =>
      p === "packages/website/docs/guides/index.md"
        ? ("file" as const)
        : p === "packages/activerecord"
          ? ("dir" as const)
          : null,
  };

  it("repoints a verbatim relative link at a GitHub blob URL", () => {
    expect(rewriteDeadLink("./index.md", "api/_media", guideCtx)).toBe(
      `${GH}/blob/main/packages/website/docs/guides/index.md`,
    );
  });

  it("preserves a fragment", () => {
    expect(rewriteDeadLink("./index.md#adapters", "api/_media", guideCtx)).toBe(
      `${GH}/blob/main/packages/website/docs/guides/index.md#adapters`,
    );
  });

  it("uses a tree URL for directory targets", () => {
    const ctx = {
      originDir: "examples/twitter-clone",
      mediaEntryToRepo: () => null,
      repoKind: (p: string) => (p === "packages/activerecord" ? ("dir" as const) : null),
    };
    expect(rewriteDeadLink("../../packages/activerecord", "api/_media", ctx)).toBe(
      `${GH}/tree/main/packages/activerecord`,
    );
  });

  it("maps a link into another copied media entry back to its origin", () => {
    const ctx = {
      originDir: null,
      mediaEntryToRepo: (e: string) =>
        e === "twitter-clone" ? "examples/twitter-clone" : e === "LICENSE" ? "LICENSE" : null,
      repoKind: (p: string) =>
        p === "examples/twitter-clone"
          ? ("dir" as const)
          : p === "LICENSE"
            ? ("file" as const)
            : null,
    };
    const idx = "api/@blazetrails/activerecord";
    expect(rewriteDeadLink("../../_media/twitter-clone", idx, ctx)).toBe(
      `${GH}/tree/main/examples/twitter-clone`,
    );
    expect(rewriteDeadLink("../../_media/LICENSE", idx, ctx)).toBe(`${GH}/blob/main/LICENSE`);
  });

  it("returns null when origin is unknown or the target does not exist", () => {
    const unknown = { originDir: null, mediaEntryToRepo: () => null, repoKind: () => null };
    expect(rewriteDeadLink("./index.md", "api/_media", unknown)).toBeNull();
    const missing = {
      originDir: "packages/website/docs/guides",
      mediaEntryToRepo: () => null,
      repoKind: () => null,
    };
    expect(rewriteDeadLink("./gone.md", "api/_media", missing)).toBeNull();
  });

  it("returns null when a verbatim link escapes the repo root", () => {
    const ctx = { originDir: "", mediaEntryToRepo: () => null, repoKind: () => "file" as const };
    expect(rewriteDeadLink("../../../etc/passwd", "api/_media", ctx)).toBeNull();
  });
});

describe("isMediaCopy", () => {
  it("recognizes _media and its nested copies, not index pages", () => {
    expect(isMediaCopy("api/_media")).toBe(true);
    expect(isMediaCopy("api/_media/twitter-clone")).toBe(true);
    expect(isMediaCopy("api/@blazetrails/activerecord")).toBe(false);
  });
});

describe("resolveGeneratedLink", () => {
  // twitter-clone/README.md copied to api/_media/twitter-clone/README.md: its
  // verbatim `../../README.md` resolves to api/README (an existing generated
  // page), so VitePress does not flag it — yet it points at the wrong doc.
  const twitterCtx = {
    originDir: "examples/twitter-clone",
    mediaEntryToRepo: () => null,
    repoKind: (p: string) => (p === "README.md" ? ("file" as const) : null),
  };

  it("repoints a wrong-but-existing nested _media link even when not dead", () => {
    expect(
      resolveGeneratedLink(
        "../../README.md#zero-declare-models--trails-tsc",
        "api/_media/twitter-clone",
        twitterCtx,
        false,
      ),
    ).toBe(`${GH}/blob/main/README.md#zero-declare-models--trails-tsc`);
  });

  it("keeps an unmappable live link in a _media copy", () => {
    const ctx = { originDir: "examples/twitter-clone", mediaEntryToRepo: () => null, repoKind: () => null };
    expect(resolveGeneratedLink("./foo.md", "api/_media/twitter-clone", ctx, false)).toBeUndefined();
  });

  it("strips an unmappable dead link in a _media copy", () => {
    const ctx = { originDir: "examples/twitter-clone", mediaEntryToRepo: () => null, repoKind: () => null };
    expect(resolveGeneratedLink("./gone.md", "api/_media/twitter-clone", ctx, true)).toBeNull();
  });

  it("leaves a live index-page link untouched (dead-only gate outside _media)", () => {
    expect(
      resolveGeneratedLink("../_media/README.md", "api/@blazetrails/activerecord", twitterCtx, false),
    ).toBeUndefined();
  });
});

describe("fixDeadLinks", () => {
  // resolveLink contract: undefined = keep, string = repoint, null = strip.
  const resolveLink = (url: string) => {
    if (url === "./index.md") return `${GH}/blob/main/guides/index.md`;
    if (url === "./arel.md") return undefined; // live
    if (url === "./gone.md") return null; // dead, unmappable
    return undefined;
  };

  it("repoints, keeps, and strips per the resolver", () => {
    expect(fixDeadLinks("[idx](./index.md)", resolveLink)).toBe(
      `[idx](${GH}/blob/main/guides/index.md)`,
    );
    expect(fixDeadLinks("[arel](./arel.md)", resolveLink)).toBe("[arel](./arel.md)");
    expect(fixDeadLinks("[gone](./gone.md)", resolveLink)).toBe("gone");
  });

  it("never touches images or fenced code", () => {
    expect(fixDeadLinks("![logo](./index.md)", resolveLink)).toBe("![logo](./index.md)");
    const fenced = ["```md", "[idx](./index.md)", "```"].join("\n");
    expect(fixDeadLinks(fenced, resolveLink)).toBe(fenced);
  });

  it("leaves link-like text inside inline code spans untouched", () => {
    // typedoc renders `this.controller[name](...args)` as one code span — the
    // `[name](...args)` inside is NOT a link, so VitePress never flags it.
    expect(fixDeadLinks("does `this.controller[name](...args)` now", resolveLink)).toBe(
      "does `this.controller[name](...args)` now",
    );
  });

  it("still fixes a link whose own label contains inline code", () => {
    // `[`code`](url)` IS a link (label may contain code) — must be repointed.
    expect(fixDeadLinks("[`pkg`](./index.md)", resolveLink)).toBe(
      `[\`pkg\`](${GH}/blob/main/guides/index.md)`,
    );
  });
});

describe("codeSpanRanges", () => {
  it("returns ranges covering backtick spans", () => {
    expect(codeSpanRanges("a `b` c")).toEqual([[2, 5]]);
    expect(codeSpanRanges("no code here")).toEqual([]);
  });

  it("pairs equal-length fences and ignores unterminated runs", () => {
    expect(codeSpanRanges("x ``a `b` c`` y")).toEqual([[2, 13]]);
    expect(codeSpanRanges("a ` b")).toEqual([]);
  });

  it("marks a fully-wrapped bracket as inside code, a bare label as outside", () => {
    const wrapped = "`ctrl[name](x)`";
    const [[s, e]] = codeSpanRanges(wrapped);
    expect(wrapped.indexOf("[") >= s && wrapped.indexOf("[") < e).toBe(true);
    expect(codeSpanRanges("[`pkg`](url)").some(([s2, e2]) => 0 >= s2 && 0 < e2)).toBe(false);
  });
});

describe("escapeForVue", () => {
  it("escapes angle brackets outside fenced code", () => {
    expect(escapeForVue("Array<T>")).toBe("Array&lt;T>");
  });

  it("leaves fenced code blocks untouched", () => {
    const src = ["```ts", "const x: Array<T> = [];", "```"].join("\n");
    expect(escapeForVue(src)).toBe(src);
  });
});
