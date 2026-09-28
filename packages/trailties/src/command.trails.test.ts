import { describe, it, expect, vi } from "vitest";
import { findByNamespace, invoke } from "./command.js";
import { VERSION } from "./version.js";

describe("Rails::Command.find_by_namespace", () => {
  it("resolves the namespace of a namespace:command spelling", () => {
    expect(findByNamespace("dev", "cache")?.name()).toBe("dev");
    expect(findByNamespace("db", "migrate")?.name()).toBe("db");
    expect(findByNamespace("credentials", "edit")?.name()).toBe("credentials");
  });

  it("finds nothing for an unknown namespace", () => {
    expect(findByNamespace("nope", "cache")).toBeUndefined();
  });
});

describe("Rails::Command.invoke help/version arms", () => {
  async function capture(namespace: string): Promise<string> {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m: unknown) => {
      lines.push(String(m));
    });
    try {
      await invoke(namespace);
    } finally {
      spy.mockRestore();
    }
    return lines.join("\n");
  }

  it("resolves -v and --version to VersionCommand", async () => {
    expect(await capture("-v")).toBe(`Trails ${VERSION}`);
    expect(await capture("--version")).toBe(`Trails ${VERSION}`);
  });

  it("resolves the empty namespace to HelpCommand#help", async () => {
    const output = await capture("");
    expect(output).toMatch(/^Usage:\n {2}bin\/trails COMMAND \[options\]/);
    expect(output).not.toMatch(/In addition to those commands/);
  });

  it("resolves -h and help to HelpCommand#help_extended", async () => {
    for (const namespace of ["-h", "--help", "help"]) {
      const output = await capture(namespace);
      expect(output).toMatch(/^Usage:/);
      expect(output).toMatch(/In addition to those commands, there are:\n\n[^]*^db {2,}Database/m);
      expect(output).not.toMatch(/^generate {2}/m);
    }
  });
});
