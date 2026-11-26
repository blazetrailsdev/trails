import { describe, expect, it, vi } from "vitest";
import { stdout } from "@blazetrails/ruby-compat/process-adapter";
import { invoke } from "../../lib/command.js";

describe("CredentialsCommand", { timeout: 30_000 }, () => {
  it("credentials:edit --help reaches Thor's help", async () => {
    const write = vi.spyOn(stdout, "write").mockReturnValue(true);
    await invoke("credentials:edit", ["--help"]);
    const output = write.mock.calls.map((call) => String(call[0])).join("");
    write.mockRestore();
    expect(output).toContain("bin/trails credentials:edit");
    expect(output).toContain("--environment");
  });
});
