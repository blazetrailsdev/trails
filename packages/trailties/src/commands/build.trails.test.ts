import { describe, expect, it, vi } from "vitest";
import { BuildCommand } from "./build.js";

const buildAutoload = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@blazetrails/trails-tsc", () => ({ buildAutoload }));

describe("BuildCommand", () => {
  it("runs the build-autoload step", async () => {
    await BuildCommand.prototype.perform.call(Object.create(BuildCommand.prototype));
    expect(buildAutoload).toHaveBeenCalledOnce();
  });
});
