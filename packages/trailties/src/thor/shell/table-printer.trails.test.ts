import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { env, setEnv, ZeroDivisionError } from "@blazetrails/ruby-compat";
import { Basic } from "./basic.js";

describe("Thor::Shell printers", () => {
  const shell = new Basic();
  let columns: string | undefined;

  beforeEach(() => {
    columns = env["THOR_COLUMNS"];
    setEnv("THOR_COLUMNS", "80");
  });

  afterEach(() => {
    setEnv("THOR_COLUMNS", columns);
  });

  it("ColumnPrinter pads every column but the last and wraps at the terminal width", async () => {
    const array = [1234567890, "a", "b", "c", "d", "e", "f", "g"];
    const content = await capture(":stdout", () => shell.printInColumns(array));
    expect(content).toBe(
      "1234567890  a           b           c           d           e\nf           g\n",
    );
    expect(await capture(":stdout", () => shell.printInColumns([]))).toBe("");
  });

  it("ColumnPrinter raises ZeroDivisionError for an element wider than the terminal", async () => {
    setEnv("THOR_COLUMNS", "10");
    await capture(":stdout", () => {
      expect(() => shell.printInColumns(["a".repeat(9), "b"])).toThrow(ZeroDivisionError);
    });
  });

  it("TablePrinter counts a cell's width in characters, not UTF-16 units", async () => {
    const table = [
      ["𝒶𝒷𝒸", "#1", "x"],
      ["abcd", "#22", "y"],
    ];
    const content = await capture(":stdout", () => shell.printTable(table));
    expect(content).toBe("𝒶𝒷𝒸   #1   x\nabcd  #22  y\n");
  });

  it("TablePrinter right-aligns numbers and treats :separator as a border row", async () => {
    const table: unknown[] = [["Name", "Number", "Color"], ":separator", ["Erik", 1, "green"]];
    const content = await capture(":stdout", () =>
      shell.printTable(table, { borders: true, indent: 2 }),
    );
    expect(content).toBe(
      [
        "  +------+--------+-------+",
        "  | Name | Number | Color |",
        "  +------+--------+-------+",
        "  | Erik |      1 | green |",
        "  +------+--------+-------+",
        "",
      ].join("\n"),
    );
  });

  it("TablePrinter truncates to the terminal width for truncate: true and to a number otherwise", async () => {
    const table = [["abc", "#123", "Lançam foo bar"]];
    expect(
      await capture(":stdout", () => shell.printTable(table, { indent: 2, truncate: 20 })),
    ).toBe("  abc  #123  Lanç...\n");

    setEnv("THOR_COLUMNS", "12");
    expect(await capture(":stdout", () => shell.printTable(table, { truncate: true }))).toBe(
      "abc  #123...\n",
    );
  });

  it("TablePrinter with colwidth formats the first column to it", async () => {
    const table = [
      ["abc", "#123", "first three"],
      ["", "#0", "empty"],
    ];
    const content = await capture(":stdout", () => shell.printTable(table, { colwidth: 10 }));
    expect(content).toBe("abc         #123  first three\n            #0    empty\n");

    const numbers = [
      ["abc", 5, "x"],
      ["d", 6, "y"],
    ];
    expect(await capture(":stdout", () => shell.printTable(numbers, { colwidth: 10 }))).toBe(
      "abc         5  x\nd           6  y\n",
    );
  });

  it("WrappedPrinter rewraps each paragraph to the terminal width less the indent", async () => {
    const message =
      "Creates a back-up of the given folder by compressing it in a .tar.gz\n" +
      "file and then uploading it to the configured Amazon S3 Bucket.\n\n" +
      "It does not verify the integrity of the generated back-up.";
    const content = await capture(":stdout", () => shell.printWrapped(message, { indent: 4 }));
    expect(content).toBe(
      "    Creates a back-up of the given folder by compressing it in a .tar.gz file\n" +
        "    and then uploading it to the configured Amazon S3 Bucket.\n\n" +
        "    It does not verify the integrity of the generated back-up.\n",
    );
  });

  it("WrappedPrinter turns a \\005 into a forced line break", async () => {
    const content = await capture(":stdout", () => shell.printWrapped("a one\x05two three"));
    expect(content).toBe("a one\ntwo three\n");
  });
});
