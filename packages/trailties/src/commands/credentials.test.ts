import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";
import { buildFile } from "./credentials.js";

describe("CredentialsCommand", () => {
  it("registers edit/show subcommands", () => {
    const cmd = createProgram().commands.find((c) => c.name() === "credentials");
    expect(cmd?.commands.map((c) => c.name())).toEqual(expect.arrayContaining(["edit", "show"]));
  });

  it("--environment switches to per-env content + key paths", () => {
    const d = buildFile({}),
      p = buildFile({ environment: "production" });
    expect([d.contentPath, d.keyPath]).toEqual(["config/credentials.yml.enc", "config/master.key"]);
    expect([p.contentPath, p.keyPath]).toEqual([
      "config/credentials/production.yml.enc",
      "config/credentials/production.key",
    ]);
  });
});
