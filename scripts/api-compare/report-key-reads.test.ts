import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { SkeletonRow } from "./report-arms.js";
import {
  bodyKey,
  keyReadRows,
  rubyBodyOf,
  tsBodyOf,
  tsKeyReads,
  type RubyBody,
  type RubyKeyReads,
} from "./report-key-reads.js";

const ROW: SkeletonRow = {
  package: "actionpack",
  rubyFile: "url_for.rb",
  rubyName: "url_for",
  tsFile: "url-for.ts",
  tsName: "urlFor",
  ruby: [],
  ts: [],
};

const buckets = (body: string, reads: [string, string | null][], params = "options, k") =>
  keyReadRows(
    ROW,
    { params: ["options", "k"], reads },
    tsKeyReads(`function urlFor(${params}) { ${body} }`).get("urlFor")![0],
  ).map((r) => `${r.receiver}[:${r.key}] ${r.bucket}`);

const extract = async (source: string[]) => {
  const dir = await mkdtemp(path.join(tmpdir(), "key-reads-"));
  try {
    await writeFile(path.join(dir, "url_for.rb"), source.join("\n"));
    const out = execFileSync("ruby", [
      path.join(import.meta.dirname, "extract-key-reads.rb"),
      JSON.stringify({ actionpack: dir }),
    ]);
    return (JSON.parse(out.toString()) as Record<string, RubyKeyReads>).actionpack;
  } finally {
    await rm(dir, { recursive: true });
  }
};

const RUBY_SUBPROCESS_TIMEOUT_MS = 30_000;

describe("report-key-reads", { timeout: RUBY_SUBPROCESS_TIMEOUT_MS }, () => {
  it("extract-key-reads.rb records a named-receiver [] per def, and no []= write", async () => {
    const { defs } = await extract([
      "def url_for(options, x = 1, **kw)",
      "  options[:only_path]",
      "  @config[:adapter]",
      '  html_options["class"]',
      "  options[:host] = 1",
      "  foo.bar[:baz]",
      "end",
    ]);
    expect(defs["url_for.rb"].url_for).toEqual([
      {
        owner: "",
        seat: "instance",
        params: ["options", "x", "kw"],
        reads: [
          ["options", "only_path"],
          ["@config", "adapter"],
          ["html_options", null],
        ],
      },
    ]);
  });

  it("extract-key-reads.rb keys a def by its owner and seat", async () => {
    const { defs, includes } = await extract([
      "module A",
      "  class B; def call; o[:b]; end; def self.call; o[:s]; end; end",
      "  class C; class << self; def call; o[:c]; end; end; end",
      "  module ClassMethods; def call; o[:m]; end; end",
      "  D = Struct.new(:x) do; def call; o[:d]; end; end",
      "  class A::E; def call; o[:e]; end; end",
      "  class ::F; def call; def inner; o[:i]; end; o[:f]; end; end",
      "  class ::G::H; include M, N::O; def call; o[:h]; end; end",
      "end",
    ]);
    expect(includes).toEqual({
      "G::H": [
        { kind: "include", module: "M" },
        { kind: "include", module: "N::O" },
      ],
    });
    expect(defs["url_for.rb"].call.map((b) => `${b.owner} ${b.seat} ${b.reads[0][1]}`)).toEqual([
      "A::B instance b",
      "A::B class s",
      "A::C class c",
      "A::ClassMethods instance m",
      "A::D instance d",
      "A::E instance e",
      "F instance f",
      "G::H instance h",
    ]);
  });

  it("a pair reads the body its owners name on both sides", () => {
    const ts = tsKeyReads(
      "class B { call(o) { return o.b; } static call(o) { return o.s; } }" +
        " class C { call(o) { return o.c; } }",
    ).get("call")!;
    const row = { ...ROW, tsOwner: "B", rubyOwner: "A::B", rubySeat: "class" as const };
    expect([...tsBodyOf(row, ts)!.reads.get("o")!]).toEqual(["s"]);
    expect(
      rubyBodyOf(row, [
        { owner: "A::B", seat: "instance", params: [], reads: [["o", "b"]] },
        { owner: "A::B", seat: "class", params: [], reads: [["o", "s"]] },
      ])!.reads,
    ).toEqual([["o", "s"]]);
  });

  it("a ClassMethods module's def is its parent's class seat, and an unknown owner of several bodies joins nothing", () => {
    const bodies: RubyBody[] = [
      { owner: "A::ClassMethods", seat: "instance", params: [], reads: [["o", "m"]] },
      { owner: "A", seat: "instance", params: [], reads: [["o", "i"]] },
    ];
    expect(rubyBodyOf({ ...ROW, rubyOwner: "A", rubySeat: "class" }, bodies)!.reads).toEqual([
      ["o", "m"],
    ]);
    expect(rubyBodyOf({ ...ROW, rubyOwner: "Z", rubySeat: "instance" }, bodies)).toBeUndefined();
    const ts = tsKeyReads(
      "class B { call(o) { return o.b; } } class C { call(o) { return o.c; } }",
    );
    expect(tsBodyOf({ ...ROW, tsOwner: "Z" }, ts.get("call")!)).toBeUndefined();
  });

  it("a lone body of another owner joins only through a mixin", () => {
    const env: RubyBody[] = [
      { owner: "R::Env", seat: "instance", params: [], reads: [["o", "e"]] },
    ];
    const row = { ...ROW, rubyOwner: "R", rubySeat: "instance" as const };
    expect(rubyBodyOf(row, env)).toBeUndefined();
    expect(rubyBodyOf(row, env, { R: [{ kind: "include", module: "Env" }] })).toBe(env[0]);
    expect(rubyBodyOf(row, env, { R: [{ kind: "extend", module: "Env" }] })).toBeUndefined();
    expect(rubyBodyOf(row, env, { R: [{ kind: "include", module: "X::Env" }] })).toBeUndefined();
    const other = tsKeyReads("class B { call(o) { return o.b; } }").get("call")!;
    expect(tsBodyOf({ ...ROW, tsOwner: "C" }, other)).toBeUndefined();
    const mixin = tsKeyReads("function call(this: C, o) { return o.c; }").get("call")!;
    expect(tsBodyOf({ ...ROW, tsOwner: "C" }, mixin)).toBe(mixin[0]);
    const bare = tsKeyReads("function call(o) { return o.c; }").get("call")!;
    expect(tsBodyOf({ ...ROW, tsOwner: "C" }, bare)).toBeUndefined();
    expect(tsBodyOf({ ...ROW, tsOwner: "C", rubyOwner: "A::C" }, bare)).toBe(bare[0]);
  });

  it("a nested function that is itself a compared pair reads for itself", () => {
    const text = "function urlFor(options) { function host(options) { return options.host; } }";
    expect(tsKeyReads(text).get("urlFor")![0].reads.get("options")).toEqual(new Set(["host"]));
    const paired = new Set([bodyKey("", "host")]);
    expect(tsKeyReads(text, "f.ts", paired).get("urlFor")![0].reads.size).toBe(0);
    const otherOwner = new Set([bodyKey("Url", "host")]);
    expect(tsKeyReads(text, "f.ts", otherOwner).get("urlFor")![0].reads.size).toBe(1);
  });

  it("a parameter the port destructures is read by its destructured names", () => {
    expect(
      buckets(
        "return onlyPath;",
        [
          ["options", "only_path"],
          ["options", "host"],
        ],
        "{ onlyPath }, k",
      ),
    ).toEqual(["options[:only_path] matched", "options[:host] key-unread"]);
    expect(buckets("return rest;", [["options", "host"]], "{ ...rest }, k")).toEqual([
      "options[:host] key-unread",
    ]);
    expect(
      buckets("return onlyPath;", [["options", "only_path"]], "{ only_path: onlyPath }, k"),
    ).toEqual(["options[:only_path] matched"]);
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
