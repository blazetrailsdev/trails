import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { invoke } from "../../lib/command.js";

describe("Trails::Command::ApplicationTest", { timeout: 60_000 }, () => {
  const runApplicationCommand = (...args: string[]) =>
    capture("stdout", () => invoke("application", args));

  it("trails new without path prints help", async () => {
    const output = await runApplicationCommand("new");

    expect(output.startsWith("No value provided for required arguments")).toBeFalsy();

    expect(
      output.includes(
        "The `trails new` command creates a new Trails application with a default\n    directory structure and configuration at the path you specify.",
      ),
    ).toBeTruthy();
  });
});
