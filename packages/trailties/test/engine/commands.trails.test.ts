import { afterEach, describe, expect, it, vi } from "vitest";
import { Dir, File, FileUtils, rbFLoad } from "@blazetrails/ruby-compat";
import { APP_PATH, setAppPath, setEngineRoot } from "../../lib/app-path.js";

vi.mock("../../lib/commands.js", () => ({}));

describe("engine/commands", () => {
  const load = () => rbFLoad(File.join(import.meta.dirname, "commands.ts"));

  afterEach(() => {
    setAppPath(undefined);
    setEngineRoot(undefined);
  });

  it("points APP_PATH at the dummy application", async () => {
    const root = Dir.mktmpdir("engine-commands");
    FileUtils.mkdirP(`${root}/test/dummy/config`);
    await File.writeAsync(`${root}/test/dummy/config/application.ts`, "");
    setEngineRoot(root);

    await load();

    expect(APP_PATH).toBe(`${root}/test/dummy/config/application.ts`);
    FileUtils.rmRf(root);
  });

  it("leaves APP_PATH unset without a dummy application", async () => {
    const root = Dir.mktmpdir("engine-commands");
    setEngineRoot(root);

    await load();

    expect(APP_PATH).toBeUndefined();
    FileUtils.rmRf(root);
  });

  it("keeps an APP_PATH the bin stub set", async () => {
    setEngineRoot("/nonexistent");
    setAppPath("/app/config/application.ts");

    await load();

    expect(APP_PATH).toBe("/app/config/application.ts");
  });
});
