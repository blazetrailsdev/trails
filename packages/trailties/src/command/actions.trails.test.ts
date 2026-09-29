import { afterEach, describe, expect, it } from "vitest";
import { setAppPath } from "../app-path.js";
import { bootApplicationBang } from "./actions.js";

describe("Rails::Command::Actions", () => {
  afterEach(() => {
    setAppPath(undefined);
  });

  it("skips require_environment! when no application path was resolved", async () => {
    setAppPath(undefined);
    await expect(bootApplicationBang()).resolves.toBeUndefined();
  });
});
