import { describe, expect, it, vi } from "vitest";
import { stdout } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { invoke } from "../command.js";
import { NotesCommand } from "./notes.js";

describe("NotesCommand", { timeout: 30_000 }, () => {
  it("has --annotations option", () => {
    const options = (NotesCommand as unknown as ThorClass).classOptions();
    expect(Object.values(options).map((o) => o.switchName)).toContain("--annotations");
  });

  it("--help reaches Thor's help", async () => {
    const write = vi.spyOn(stdout, "write").mockReturnValue(true as never);
    await invoke("notes", ["--help"]);
    const output = write.mock.calls.map((call) => String(call[0])).join("");
    write.mockRestore();
    expect(output).toContain("bin/rails notes");
    expect(output).toContain("--annotations");
  });
});
