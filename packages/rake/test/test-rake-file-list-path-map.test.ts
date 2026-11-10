import { describe, expect, it } from "vitest";
import { FileList } from "../lib/file-list.js";

describe("TestRakeFileListPathMap", () => {
  it("file list supports pathmap", async () => {
    expect(await (await FileList.get("dir/a.rb", "dir/b.rb").pathmap("%n")).toA()).toEqual([
      "a",
      "b",
    ]);
  });

  it("file list supports pathmap with a block", async () => {
    const mapped = await FileList.get("dir/a.rb", "dir/b.rb").pathmap("%{.*,*}n", (name) =>
      name.toUpperCase(),
    );
    expect(await mapped.toA()).toEqual(["A", "B"]);
  });
});
