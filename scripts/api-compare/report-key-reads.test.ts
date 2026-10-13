import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { SkeletonRow } from "./report-arms.js";
import { keyReadRows, tsKeyReads, type RubyKeyReads } from "./report-key-reads.js";

const ROW: SkeletonRow = {
  package: "actionpack",
  rubyFile: "url_for.rb",
  rubyName: "url_for",
  tsFile: "url-for.ts",
  tsName: "urlFor",
  ruby: [],
  ts: [],
};

const buckets = (body: string, ruby: [string, string | null][]) =>
  keyReadRows(ROW, ruby, tsKeyReads(`function urlFor(options, k) { ${body} }`).get("urlFor")!).map(
    (r) => `${r.receiver}[:${r.key}] ${r.bucket}`,
  );

describe("report-key-reads", () => {
  it("extract-key-reads.rb records a named-receiver [] per def, and no []= write", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "key-reads-"));
    try {
      await writeFile(
        path.join(dir, "url_for.rb"),
        [
          "def url_for(options)",
          "  options[:only_path]",
          "  @config[:adapter]",
          '  html_options["class"]',
          "  options[:host] = 1",
          "  foo.bar[:baz]",
          "end",
        ].join("\n"),
      );
      const out = execFileSync("ruby", [
        path.join(import.meta.dirname, "extract-key-reads.rb"),
        JSON.stringify({ actionpack: dir }),
      ]);
      const reads = JSON.parse(out.toString()) as Record<string, RubyKeyReads>;
      expect(reads.actionpack["url_for.rb"].url_for).toEqual([
        ["options", "only_path"],
        ["@config", "adapter"],
        ["html_options", null],
      ]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it.each([
    ["h.k", "return options.onlyPath;"],
    ['h["k"]', 'return options["only_path"];'],
    ["h[k]", "return options[k];"],
    ["hashAref(h, k)", 'return hashAref(options, "onlyPath");'],
    ["a destructuring", "const { onlyPath } = options; return onlyPath;"],
    ["a ported [] member", 'return this._options.get(":only_path");'],
  ])("%s is the read", (_form, body) => {
    expect(buckets(body, [["options", "only_path"]])).toEqual(["options[:only_path] matched"]);
  });

  it("a key the port never reads off the receiver is key-unread, and a write is no read", () => {
    expect(
      buckets("options.onlyPath = true; return options.host;", [
        ["options", "only_path"],
        ["options", "only_path"],
        ["options", null],
      ]),
    ).toEqual(["options[:only_path] key-unread"]);
  });

  it("a receiver the port reads nothing off is receiver-unread", () => {
    expect(buckets("return k;", [["@scope", "defaults"]])).toEqual([
      "@scope[:defaults] receiver-unread",
    ]);
  });

  it("a predicate key is read by its is-spelling, and a named capture off match.groups", () => {
    expect(
      buckets("return options.isFrozen && options.groups.host;", [
        ["options", "frozen?"],
        ["options", "host"],
      ]),
    ).toEqual(["options[:frozen?] matched", "options[:host] matched"]);
  });
});
