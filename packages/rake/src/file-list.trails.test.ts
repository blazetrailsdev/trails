import { describe, expect, it } from "vitest";
import { File, block } from "@blazetrails/ruby-compat";
import { FileList } from "./file-list.js";
import { useRakeTestCase } from "./test-helpers/file-creation.js";

describe("FileList#egrep", () => {
  useRakeTestCase();

  it("a String pattern is String#match's receiver, each line the Regexp", async () => {
    await File.writeAsync("egrep.txt", "no\nX.Z");
    const found: unknown[] = [];
    const matched = await FileList.get("egrep.txt").egrep(
      "XYZZY",
      block((fn: string, ln: number, line: string) => void found.push([fn, ln, line])),
    );
    expect(matched).toEqual(1);
    expect(found).toEqual([["egrep.txt", 2, "X.Z"]]);
  });

  it("hands its options to File.open", async () => {
    await File.writeAsync("egrep.txt", "XYZZY\n");
    let line: unknown = null;
    await FileList.get("egrep.txt").egrep(
      /XYZZY/,
      { externalEncoding: "ASCII-8BIT" },
      block((_fn: string, _ln: number, l: unknown) => void (line = l)),
    );
    expect(line).toBeInstanceOf(Uint8Array);
  });
});
