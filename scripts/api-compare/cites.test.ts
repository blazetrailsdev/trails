import { describe, expect, it } from "vitest";
import {
  checkReceipt,
  collectReceipts,
  namedMethods,
  parseCites,
  resolveCite,
  rubyMethodSpans,
  type RubyCorpus,
} from "./cites.js";

const corpus: RubyCorpus = {
  files: [
    "vendor/rails/activerecord/lib/active_record/reflection.rb",
    "vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/quoting.rb",
    "vendor/rails/activerecord/lib/active_record/connection_adapters/mysql/quoting.rb",
  ],
  vendorDir: "/repo/vendor",
};

const REFLECTION = [
  "module ActiveRecord",
  "  class AssociationReflection",
  "    def klass",
  "      @klass ||= compute_class(class_name)",
  "    end",
  "",
  "    def compute_class(name)",
  "      if polymorphic?",
  "        raise ArgumentError, name",
  "      end",
  "      name.constantize",
  "    end",
  "",
  "    def ==(other)",
  "      super",
  "    end",
  "",
  "    def name; @name; end",
  "  end",
  "end",
].join("\n");

const read = async (): Promise<string> => REFLECTION;

describe("cites", () => {
  it("parses a citation, a range, and a use-site marker", () => {
    expect(parseCites("see `reflection.rb:507` and use-site:quoting.rb:12-30")).toEqual([
      {
        raw: "reflection.rb:507",
        file: "reflection.rb",
        startLine: 507,
        endLine: 507,
        useSite: false,
      },
      {
        raw: "use-site:quoting.rb:12-30",
        file: "quoting.rb",
        startLine: 12,
        endLine: 30,
        useSite: true,
      },
    ]);
  });

  it("reads the Ruby method a reason names, operators included", () => {
    expect(namedMethods("`AssociationReflection#klass` and `Arel::Nodes::Node#==`")).toEqual([
      "klass",
      "==",
    ]);
  });

  it("spans an operator def, a one-line def, and a nested def", () => {
    const spans = rubyMethodSpans(REFLECTION);
    expect(spans.find((s) => s.name === "==")).toEqual({ name: "==", startLine: 14, endLine: 16 });
    expect(spans.find((s) => s.name === "name")).toEqual({
      name: "name",
      startLine: 18,
      endLine: 18,
    });
    expect(spans.find((s) => s.name === "klass")).toEqual({
      name: "klass",
      startLine: 3,
      endLine: 5,
    });
  });

  it("resolves a qualified path and refuses an ambiguous basename", () => {
    expect(resolveCite(corpus, "abstract/quoting.rb")).toEqual([
      "vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/quoting.rb",
    ]);
    expect(resolveCite(corpus, "quoting.rb")).toHaveLength(2);
    expect(resolveCite(corpus, "nowhere.rb")).toEqual([]);
  });

  it("flags a line that is inside a different method than the reason names", async () => {
    const findings = await checkReceipt(
      corpus,
      {
        tsFile: "packages/activerecord/src/reflection.ts",
        line: 1,
        tag: "@noRailsEquivalent",
        reason: "PERMANENT — `AssociationReflection#klass` (reflection.rb:9)",
      },
      read,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].problem).toBe("not-in-method");
    expect(findings[0].detail).toContain("compute_class");
  });

  it("accepts a citation inside the method the reason names", async () => {
    expect(
      await checkReceipt(
        corpus,
        {
          tsFile: "x.ts",
          line: 1,
          tag: "@noRailsEquivalent",
          reason: "PERMANENT — `AssociationReflection#klass` (reflection.rb:4)",
        },
        read,
      ),
    ).toEqual([]);
  });

  it("skips membership for a citation marked as a use site", async () => {
    expect(
      await checkReceipt(
        corpus,
        {
          tsFile: "x.ts",
          line: 1,
          tag: "@noRailsEquivalent",
          reason:
            "PERMANENT — Rails reads `AssociationReflection#klass` at use-site:reflection.rb:9",
        },
        read,
      ),
    ).toEqual([]);
  });

  it("flags a line past the end of the cited file", async () => {
    const findings = await checkReceipt(
      corpus,
      { tsFile: "x.ts", line: 1, tag: "@missingRailsCall", reason: "reflection.rb:9000" },
      read,
    );
    expect(findings[0].problem).toBe("out-of-range");
  });

  it("collects a multi-line reason and stops at the next tag", () => {
    const text = [
      "/**",
      " * @noRailsEquivalent PERMANENT — the reason runs on",
      " *   to reflection.rb:4 here.",
      " * @internal",
      " */",
      "export const x = 1;",
    ].join("\n");
    const receipts = collectReceipts("x.ts", text);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].line).toBe(2);
    expect(receipts[0].reason).toContain("reflection.rb:4");
    expect(receipts[0].reason).not.toContain("@internal");
  });
});
