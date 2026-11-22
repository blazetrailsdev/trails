import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { StringIO } from "@blazetrails/ruby-compat";
import { CodeStatisticsCalculator } from "../lib/code-statistics-calculator.js";

describe("CodeStatisticsCalculatorTest", () => {
  let calc: CodeStatisticsCalculator;
  let tmpDir: string;
  beforeEach(() => {
    calc = new CodeStatisticsCalculator();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-cs-"));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it("calculate statistics using #add_by_file_path", async () => {
    const p = path.join(tmpDir, "stats.rb");
    fs.writeFileSync(p, "      def foo\n        puts 'foo'\n        # bar\n      end\n");
    await calc.addByFilePath(p);
    expect(calc.lines).toBe(4);
    expect(calc.codeLines).toBe(3);
    expect(calc.classes).toBe(0);
    expect(calc.methods).toBe(1);
  });

  it("count number of methods in minitest file", async () => {
    const p = path.join(tmpDir, "foo_test.rb");
    fs.writeFileSync(
      p,
      "      class FooTest < ActionController::TestCase\n        test 'expectation' do\n          assert true\n        end\n\n        def test_expectation\n          assert true\n        end\n      end\n",
    );
    await calc.addByFilePath(p);
    expect(calc.methods).toBe(2);
  });

  it("add statistics to another using #add", () => {
    calc.add(new CodeStatisticsCalculator(1, 2, 3, 4));
    expect(calc.lines).toBe(1);
    expect(calc.codeLines).toBe(2);
    expect(calc.classes).toBe(3);
    expect(calc.methods).toBe(4);
    calc.add(new CodeStatisticsCalculator(2, 3, 4, 5));
    expect(calc.lines).toBe(3);
    expect(calc.codeLines).toBe(5);
    expect(calc.classes).toBe(7);
    expect(calc.methods).toBe(9);
  });

  it("accumulate statistics using #add_by_io", () => {
    calc.add(new CodeStatisticsCalculator(1, 2, 3, 4));
    calc.addByIo(
      new StringIO(
        "      def foo\n        puts 'foo'\n      end\n\n      def bar; end\n      class A; end\n",
      ),
      "rb",
    );
    expect(calc.lines).toBe(7);
    expect(calc.codeLines).toBe(7);
    expect(calc.classes).toBe(4);
    expect(calc.methods).toBe(6);
  });

  it("calculate number of Ruby methods", () => {
    calc.addByIo(
      new StringIO(
        "      def foo\n        puts 'foo'\n      end\n\n      def bar; end\n\n      class Foo\n        def bar(abc)\n        end\n      end\n",
      ),
      "rb",
    );
    expect(calc.methods).toBe(3);
  });

  it("calculate Ruby LOCs", () => {
    calc.addByIo(
      new StringIO(
        "      def foo\n        puts 'foo'\n      end\n\n      # def bar; end\n\n      class A < B\n      end\n",
      ),
      "rb",
    );
    expect(calc.lines).toBe(8);
    expect(calc.codeLines).toBe(5);
  });

  it("calculate number of Ruby classes", () => {
    calc.addByIo(
      new StringIO(
        "      class Foo < Bar\n        def foo\n          puts 'foo'\n        end\n      end\n\n      class Z; end\n\n      # class A\n      # end\n",
      ),
      "rb",
    );
    expect(calc.classes).toBe(2);
  });

  it("skip Ruby comments", () => {
    calc.addByIo(
      new StringIO(
        "=begin\n      class Foo\n        def foo\n          puts 'foo'\n        end\n      end\n=end\n\n      # class A\n      # end\n",
      ),
      "rb",
    );
    expect(calc.lines).toBe(10);
    expect(calc.codeLines).toBe(0);
    expect(calc.classes).toBe(0);
    expect(calc.methods).toBe(0);
  });

  it("calculate number of JS methods", () => {
    calc.addByIo(
      new StringIO(
        "      function foo(x, y, z) {\n        doX();\n      }\n\n      $(function () {\n        bar();\n      })\n\n      var baz = function ( x ) {\n      }\n",
      ),
      "js",
    );
    expect(calc.methods).toBe(3);
  });

  it("calculate JS LOCs", () => {
    calc.addByIo(
      new StringIO(
        "      function foo()\n        alert('foo');\n      end\n\n      // var b = 2;\n\n      var a = 1;\n",
      ),
      "js",
    );
    expect(calc.lines).toBe(7);
    expect(calc.codeLines).toBe(4);
  });

  it("skip JS comments", () => {
    calc.addByIo(
      new StringIO(
        "      /*\n       * var f = function () {\n       1 / 2;\n      }\n      */\n\n      // call();\n      //\n",
      ),
      "js",
    );
    expect(calc.lines).toBe(8);
    expect(calc.codeLines).toBe(0);
    expect(calc.classes).toBe(0);
    expect(calc.methods).toBe(0);
  });

  it("skip TSE comments", () => {
    calc.addByIo(
      new StringIO(
        "      <!-- This is an HTML comment -->\n      <%# This is a great comment! %>\n      <div>\n        <%= hello %>\n\n      </div>\n",
      ),
      "tse",
    );
    expect(calc.lines).toBe(6);
    expect(calc.codeLines).toBe(3);
    expect(calc.classes).toBe(0);
    expect(calc.methods).toBe(0);
  });

  it("skip CSS comments", () => {
    calc.addByIo(
      new StringIO(
        "      /* My cool CSS */\n      .selector {\n        background-color: blue;\n\n      }\n",
      ),
      "css",
    );
    expect(calc.lines).toBe(5);
    expect(calc.codeLines).toBe(3);
    expect(calc.classes).toBe(0);
    expect(calc.methods).toBe(0);
  });

  it("skip SCSS comments", () => {
    calc.addByIo(
      new StringIO(
        "      // My cool SCSS\n      /* My cool SCSS */\n      .selector {\n        background-color: blue;\n\n      }\n",
      ),
      "scss",
    );
    expect(calc.lines).toBe(6);
    expect(calc.codeLines).toBe(3);
    expect(calc.classes).toBe(0);
    expect(calc.methods).toBe(0);
  });

  it("calculate number of CoffeeScript methods", () => {
    calc.addByIo(
      new StringIO(
        "      square = (x) -> x * x\n\n      math =\n        cube: (x) -> x * square x\n\n      fill = (container, liquid = \"coffee\") ->\n        \"Filling the #{container} with #{liquid}...\"\n\n      $('.shopping_cart').bind 'click', (event) =>\n        @customer.purchase @cart\n",
      ),
      "coffee",
    );
    expect(calc.methods).toBe(4);
  });

  it("calculate CoffeeScript LOCs", () => {
    calc.addByIo(
      new StringIO(
        "      # Assignment:\n      number   = 42\n      opposite = true\n\n      ###\n      CoffeeScript Compiler v1.4.0\n      Released under the MIT License\n      ###\n\n      # Conditions:\n      number = -42 if opposite\n",
      ),
      "coffee",
    );
    expect(calc.lines).toBe(11);
    expect(calc.codeLines).toBe(3);
  });

  it("calculate number of CoffeeScript classes", () => {
    calc.addByIo(
      new StringIO(
        '      class Animal\n        constructor: (@name) ->\n\n        move: (meters) ->\n          alert @name + " moved #{meters}m."\n\n      class Snake extends Animal\n        move: ->\n          alert "Slithering..."\n          super 5\n\n      # class Horse\n',
      ),
      "coffee",
    );
    expect(calc.classes).toBe(2);
  });

  it("skip CoffeeScript comments", () => {
    calc.addByIo(
      new StringIO(
        "###\nclass Animal\n  constructor: (@name) ->\n\n  move: (meters) ->\n    alert @name + \" moved #{meters}m.\"\n  ###\n\n  # class Horse\n  alert 'hello'\n",
      ),
      "coffee",
    );
    expect(calc.lines).toBe(10);
    expect(calc.codeLines).toBe(1);
    expect(calc.classes).toBe(0);
    expect(calc.methods).toBe(0);
  });

  it("count rake tasks", () => {
    calc.addByIo(
      new StringIO("      task :test_task do\n        puts 'foo'\n      end\n\n"),
      "rake",
    );
    expect(calc.lines).toBe(4);
    expect(calc.codeLines).toBe(3);
    expect(calc.classes).toBe(0);
    expect(calc.methods).toBe(0);
  });

  it("calculate number of TypeScript methods", () => {
    calc.addByIo(
      new StringIO(
        "function foo(x: number) {\n  return x;\n}\n\nconst bar = (y: number) => y;\n\nclass Baz {\n  async run() {}\n  get name() { return 'a'; }\n}\n",
      ),
      "ts",
    );
    expect(calc.methods).toBe(4);
  });

  it("calculate number of TypeScript classes", () => {
    calc.addByIo(
      new StringIO(
        "export class Foo {}\nexport default class Bar {}\nabstract class Baz {}\n// class Hidden {}\n",
      ),
      "ts",
    );
    expect(calc.classes).toBe(3);
  });
});
