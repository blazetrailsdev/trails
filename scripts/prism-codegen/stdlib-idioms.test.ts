import { describe, it, expect } from "vitest";
import { generateFromSource } from "./index.js";

async function gen(ruby: string): Promise<{ code: string; parseErrorCount: number }> {
  const { code, parseErrorCount } = await generateFromSource(ruby);
  return { code, parseErrorCount };
}

describe("prism-codegen stdlib idiom mapping", () => {
  it("maps is_a?(Array) and kind_of?(Array) to Array.isArray", async () => {
    const { code, parseErrorCount } = await gen(`
      def wrap(values)
        return values if values.is_a?(Array)
        [values] if values.kind_of?(Array)
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code.match(/Array\.isArray\(values\)/g)).toHaveLength(2);
  });

  it("maps is_a? on typeof-imaged Ruby core classes to typeof checks", async () => {
    const { code } = await gen(`
      def classify(v)
        return 1 if v.is_a?(String)
        return 2 if v.is_a?(Symbol)
        return 3 if v.is_a?(Integer)
        4 if v.is_a?(Proc)
      end
    `);
    expect(code.match(/typeof v === "string"/g)).toHaveLength(2);
    expect(code).toContain('typeof v === "number"');
    expect(code).toContain('typeof v === "function"');
  });

  it("maps is_a? on any other constant to instanceof", async () => {
    const { code } = await gen(`
      def relation?(v)
        v.is_a?(Relation)
      end
    `);
    expect(code).toContain("v instanceof Relation");
  });

  it("maps .class to .constructor", async () => {
    const { code } = await gen(`
      def type_of(record)
        record.class
      end
    `);
    expect(code).toContain("record.constructor");
  });

  it("maps to_s to String() and nil? to a null check", async () => {
    const { code } = await gen(`
      def label(v)
        return "" if v.nil?
        v.to_s
      end
    `);
    expect(code).toContain("v == null");
    expect(code).toContain("String(v)");
  });

  it("maps empty? to a length check", async () => {
    const { code } = await gen(`
      def none_given(list)
        list.empty?
      end
    `);
    expect(code).toContain("list.length === 0");
  });

  it("maps Kernel#Array to the wrap ternary", async () => {
    const { code, parseErrorCount } = await gen(`
      def coerce(v)
        Array(v)
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("v == null ? [] : Array.isArray(v) ? v : [v]");
  });

  it("keeps Kernel#Array of a side-effectful argument off the multi-read ternary", async () => {
    const { code } = await gen(`
      def coerce
        Array(build_list)
      end
    `);
    expect(code).not.toContain("Array.isArray");
  });

  it("renames enumerable methods to their JS array images", async () => {
    const { code } = await gen(`
      def pipeline(rows)
        rows.collect { |r| r }
        rows.detect { |r| r }
        rows.inject { |a, b| a }
        rows.flat_map { |r| r }
        rows.include?(1)
        rows.to_a
      end
    `);
    expect(code).toContain("rows.map(");
    expect(code).toContain("rows.find(");
    expect(code).toContain("rows.reduce(");
    expect(code).toContain("rows.flatMap(");
    expect(code).toContain("rows.includes(1)");
    expect(code).toContain("rows.toArray()");
  });

  it("renames any?/all? to some/every only when a block is present", async () => {
    const { code } = await gen(`
      def check(rows)
        rows.any? { |r| r }
        rows.all? { |r| r }
        rows.any?
      end
    `);
    expect(code).toContain("rows.some(");
    expect(code).toContain("rows.every(");
    expect(code).toContain("rows.isAny()");
  });

  it("emits statement-position each blocks as for-of loops", async () => {
    const { code, parseErrorCount } = await gen(`
      def visit(rows)
        rows.each do |row|
          handle(row)
        end
        nil
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("for (const row of rows)");
    expect(code).toContain("this.handle(row)");
    expect(code).not.toContain("let row");
  });

  it("destructures two-parameter each blocks in the for-of binding", async () => {
    const { code } = await gen(`
      def visit_pairs(pairs)
        pairs.each do |k, v|
          handle(k, v)
        end
        nil
      end
    `);
    expect(code).toContain("for (const [k, v] of pairs)");
  });

  it("supports next as continue inside an each-derived for-of", async () => {
    const { code, parseErrorCount } = await gen(`
      def visit(rows)
        rows.each do |row|
          next if row.nil?
          handle(row)
        end
        nil
      end
    `);
    expect(parseErrorCount).toBe(0);
    expect(code).toContain("continue;");
  });

  it("leaves expression-position each as a forEach call", async () => {
    const { code } = await gen(`
      def tally(rows)
        result = rows.each { |r| handle(r) }
        result
      end
    `);
    expect(code).toContain("rows.forEach(");
  });
});
