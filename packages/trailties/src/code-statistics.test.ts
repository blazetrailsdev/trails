import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { CodeStatistics, DEFAULT_DIRECTORIES, DEFAULT_TEST_TYPES } from "./code-statistics.js";
import { CodeStatisticsCalculator } from "./code-statistics-calculator.js";

describe("CodeStatisticsCalculatorTest", () => {
  let calc: CodeStatisticsCalculator;
  let tmpDir: string;
  beforeEach(() => {
    calc = new CodeStatisticsCalculator();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-cs-"));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const read = (p: string) => Promise.resolve(fs.readFileSync(p, "utf-8"));

  it("calculate statistics using #add_by_file_path", async () => {
    const p = path.join(tmpDir, "stats.rb");
    fs.writeFileSync(p, "      def foo\n        puts 'foo'\n        # bar\n      end\n");
    await calc.addByFilePath(p, read);
    expect([calc.lines, calc.codeLines, calc.classes, calc.methods]).toEqual([4, 3, 0, 1]);
  });

  it("count number of methods in minitest file", async () => {
    const p = path.join(tmpDir, "foo_test.rb");
    fs.writeFileSync(
      p,
      "      class FooTest < ActionController::TestCase\n        test 'expectation' do\n          assert true\n        end\n\n        def test_expectation\n          assert true\n        end\n      end\n",
    );
    await calc.addByFilePath(p, read);
    expect(calc.methods).toBe(2);
  });

  it("add statistics to another using #add", () => {
    calc.add(new CodeStatisticsCalculator(1, 2, 3, 4));
    expect([calc.lines, calc.codeLines, calc.classes, calc.methods]).toEqual([1, 2, 3, 4]);
    calc.add(new CodeStatisticsCalculator(2, 3, 4, 5));
    expect([calc.lines, calc.codeLines, calc.classes, calc.methods]).toEqual([3, 5, 7, 9]);
  });

  it("accumulate statistics using #add_by_io", () => {
    calc.add(new CodeStatisticsCalculator(1, 2, 3, 4));
    calc.addByString(
      "      def foo\n        puts 'foo'\n      end\n\n      def bar; end\n      class A; end\n",
      "rb",
    );
    expect([calc.lines, calc.codeLines, calc.classes, calc.methods]).toEqual([7, 7, 4, 6]);
  });

  it("calculate number of Ruby methods", () => {
    calc.addByString(
      "      def foo\n        puts 'foo'\n      end\n\n      def bar; end\n\n      class Foo\n        def bar(abc)\n        end\n      end\n",
      "rb",
    );
    expect(calc.methods).toBe(3);
  });

  it("calculate Ruby LOCs", () => {
    calc.addByString(
      "      def foo\n        puts 'foo'\n      end\n\n      # def bar; end\n\n      class A < B\n      end\n",
      "rb",
    );
    expect([calc.lines, calc.codeLines]).toEqual([8, 5]);
  });

  it("calculate number of Ruby classes", () => {
    calc.addByString(
      "      class Foo < Bar\n        def foo\n          puts 'foo'\n        end\n      end\n\n      class Z; end\n\n      # class A\n      # end\n",
      "rb",
    );
    expect(calc.classes).toBe(2);
  });

  it("skip Ruby comments", () => {
    calc.addByString(
      "=begin\n      class Foo\n        def foo\n          puts 'foo'\n        end\n      end\n=end\n\n      # class A\n      # end\n",
      "rb",
    );
    expect([calc.lines, calc.codeLines, calc.classes, calc.methods]).toEqual([10, 0, 0, 0]);
  });

  it("calculate number of JS methods", () => {
    calc.addByString(
      "      function foo(x, y, z) {\n        doX();\n      }\n\n      $(function () {\n        bar();\n      })\n\n      var baz = function ( x ) {\n      }\n",
      "js",
    );
    expect(calc.methods).toBe(3);
  });

  it("calculate JS LOCs", () => {
    calc.addByString(
      "      function foo()\n        alert('foo');\n      end\n\n      // var b = 2;\n\n      var a = 1;\n",
      "js",
    );
    expect([calc.lines, calc.codeLines]).toEqual([7, 4]);
  });

  it("skip JS comments", () => {
    calc.addByString(
      "      /*\n       * var f = function () {\n       1 / 2;\n      }\n      */\n\n      // call();\n      //\n",
      "js",
    );
    expect([calc.lines, calc.codeLines, calc.classes, calc.methods]).toEqual([8, 0, 0, 0]);
  });

  it("skip ERB comments", () => {
    calc.addByString(
      "      <!-- This is an HTML comment -->\n      <%# This is a great comment! %>\n      <div>\n        <%= hello %>\n\n      </div>\n",
      "erb",
    );
    expect([calc.lines, calc.codeLines]).toEqual([6, 3]);
  });

  it("skip CSS comments", () => {
    calc.addByString(
      "      /* My cool CSS */\n      .selector {\n        background-color: blue;\n\n      }\n",
      "css",
    );
    expect([calc.lines, calc.codeLines]).toEqual([5, 3]);
  });

  it("skip SCSS comments", () => {
    calc.addByString(
      "      // My cool SCSS\n      /* My cool SCSS */\n      .selector {\n        background-color: blue;\n\n      }\n",
      "scss",
    );
    expect([calc.lines, calc.codeLines]).toEqual([6, 3]);
  });

  it("calculate number of CoffeeScript methods", () => {
    calc.addByString(
      "      square = (x) -> x * x\n\n      math =\n        cube: (x) -> x * square x\n\n      fill = (container, liquid = \"coffee\") ->\n        \"Filling the #{container} with #{liquid}...\"\n\n      $('.shopping_cart').bind 'click', (event) =>\n        @customer.purchase @cart\n",
      "coffee",
    );
    expect(calc.methods).toBe(4);
  });

  it("calculate CoffeeScript LOCs", () => {
    calc.addByString(
      "      # Assignment:\n      number   = 42\n      opposite = true\n\n      ###\n      CoffeeScript Compiler v1.4.0\n      Released under the MIT License\n      ###\n\n      # Conditions:\n      number = -42 if opposite\n",
      "coffee",
    );
    expect([calc.lines, calc.codeLines]).toEqual([11, 3]);
  });

  it("calculate number of CoffeeScript classes", () => {
    calc.addByString(
      '      class Animal\n        constructor: (@name) ->\n\n        move: (meters) ->\n          alert @name + " moved #{meters}m."\n\n      class Snake extends Animal\n        move: ->\n          alert "Slithering..."\n          super 5\n\n      # class Horse\n',
      "coffee",
    );
    expect(calc.classes).toBe(2);
  });

  it("skip CoffeeScript comments", () => {
    calc.addByString(
      "###\nclass Animal\n  constructor: (@name) ->\n\n  move: (meters) ->\n    alert @name + \" moved #{meters}m.\"\n  ###\n\n  # class Horse\n  alert 'hello'\n",
      "coffee",
    );
    expect([calc.lines, calc.codeLines, calc.classes, calc.methods]).toEqual([10, 1, 0, 0]);
  });

  it("count rake tasks", () => {
    calc.addByString("      task :test_task do\n        puts 'foo'\n      end\n\n", "rake");
    expect([calc.lines, calc.codeLines]).toEqual([4, 3]);
  });

  it("calculate number of TypeScript methods", () => {
    calc.addByString(
      "function foo(x: number) {\n  return x;\n}\n\nconst bar = (y: number) => y;\n\nclass Baz {\n  async run() {}\n  get name() { return 'a'; }\n}\n",
      "ts",
    );
    expect(calc.methods).toBe(4);
  });

  it("calculate number of TypeScript classes", () => {
    calc.addByString(
      "export class Foo {}\nexport default class Bar {}\nabstract class Baz {}\n// class Hidden {}\n",
      "ts",
    );
    expect(calc.classes).toBe(3);
  });
});

describe("CodeStatisticsTest", () => {
  let tmpPath: string;
  beforeEach(() => {
    tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "trails-cs-suite-"));
    fs.mkdirSync(path.join(tmpPath, "lib.js"), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpPath, { recursive: true, force: true });
    CodeStatistics.directories = [...DEFAULT_DIRECTORIES];
    CodeStatistics.testTypes = [...DEFAULT_TEST_TYPES];
  });

  it("register directories", () => {
    CodeStatistics.registerDirectory("My Directory", "path/to/dir");
    expect(
      CodeStatistics.directories.some(([l, p]) => l === "My Directory" && p === "path/to/dir"),
    ).toBe(true);
    expect(CodeStatistics.testTypes.includes("My Directory")).toBe(false);
  });

  it("register test directories", () => {
    CodeStatistics.registerDirectory("Model specs", "spec/models", { testDirectory: true });
    expect(CodeStatistics.testTypes.includes("Model specs")).toBe(true);
  });

  it("ignores directories that happen to have source files extensions", async () => {
    await expect(CodeStatistics.create(["tmp dir", tmpPath])).resolves.toBeDefined();
  });

  it("renders a Rails-shaped table with totals and Code-to-Test ratio", async () => {
    fs.writeFileSync(path.join(tmpPath, "a.ts"), "export class A {\n  run() {}\n}\n");
    fs.mkdirSync(path.join(tmpPath, "t"), { recursive: true });
    fs.writeFileSync(path.join(tmpPath, "t", "a_test.ts"), "function t() {}\n");
    const stats = await CodeStatistics.create(
      ["Models", tmpPath],
      ["Model tests", path.join(tmpPath, "t")],
    );
    const s = stats.toString();
    const lines = s.split("\n");
    expect(lines[0]).toMatch(/^\+-+(\+-+)+\+$/);
    expect(lines[1]).toContain("| Name");
    expect(lines[1]).toContain("Lines");
    expect(lines[1]).toContain("LOC");
    expect(lines[1]).toContain("Classes");
    expect(lines[1]).toContain("Methods");
    expect(lines[1]).toContain("| M/C | LOC/M |");
    expect(s).toContain("| Models");
    expect(s).toContain("| Model tests");
    expect(s).toContain("| Total");
    expect(s).toMatch(/Code LOC: \d+ +Test LOC: \d+ +Code to Test Ratio: 1:\d+\.\d/);
  });

  it("ignores hidden files", async () => {
    fs.writeFileSync(
      path.join(tmpPath, ".example.rb"),
      "      def foo\n        puts 'foo'\n      end\n",
    );
    await expect(CodeStatistics.create(["hidden file", tmpPath])).resolves.toBeDefined();
  });
});
