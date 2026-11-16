import { Task } from "@blazetrails/rake";
import { describe, expect, it } from "vitest";
import "../lib/tasks/vite.js";

describe("vite.rake", () => {
  it("enhances vite:verify_install with environment", async () => {
    expect((await Task.get("vite:verify_install")).prerequisites).toContain("environment");
  });
});
