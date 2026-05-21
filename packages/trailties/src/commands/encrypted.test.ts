import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";

describe("EncryptedCommand", () => {
  it("registers edit/show with --key defaulting to config/master.key", () => {
    const cmd = createProgram().commands.find((c) => c.name() === "encrypted");
    const names = cmd?.commands.map((c) => c.name()) ?? [];
    expect(names).toEqual(expect.arrayContaining(["edit", "show"]));
    const edit = cmd?.commands.find((c) => c.name() === "edit");
    expect(edit?.options.find((o) => o.long === "--key")?.defaultValue).toBe("config/master.key");
  });
});
