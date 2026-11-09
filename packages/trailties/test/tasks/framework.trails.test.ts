import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rake } from "@blazetrails/rake";
import { Dir, File, FileUtils, RuntimeError, rbFLoad } from "@blazetrails/ruby-compat";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";

class FrameworkTaskTestApp extends Application {}

describe("tasks/framework", () => {
  let root: string;

  beforeEach(() => {
    root = Dir.mktmpdir("framework-task");
    vi.spyOn(Trails, "root").mockReturnValue({ toString: () => root } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    FileUtils.rmRf(root);
  });

  it("raises when no LOCATION is given", async () => {
    vi.stubEnv("LOCATION", "");
    await expect(
      Rake.withApplication(async (rake) => {
        await rbFLoad(File.join(import.meta.dirname, "../../lib/tasks/framework.ts"));
        const task = rake.lookup("app:template")!;
        task.clearPrerequisites();
        await task.invoke();
      }),
    ).rejects.toBeInstanceOf(RuntimeError);
  });

  it("applies the template at LOCATION, running its generate in line", async () => {
    const previous = Trails.application;
    Trails.application = FrameworkTaskTestApp.instance();
    File.write(File.join(root, "tsconfig.json"), "{}");
    const tmpl = File.join(root, "template.mjs");
    File.write(tmpl, 'export default (g) => g.generate("helper", "Post", { inline: true });\n');
    vi.stubEnv("LOCATION", tmpl);
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "../../lib/tasks/framework.ts"));
      const task = rake.lookup("app:template")!;
      task.clearPrerequisites();
      await task.invoke();
    }).finally(() => {
      Trails.application = previous;
    });
    expect(File.isExist(File.join(root, "app/helpers/post-helper.ts"))).toBe(true);
  });

  it("copies the default templates", async () => {
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "../../lib/tasks/framework.ts"));
      await rake.lookup("app:templates:copy")!.invoke();
    });
    for (const name of ["controller/view.html.tse.tt", "mailer/layout.text.tse.tt"]) {
      expect(File.isExist(File.join(root, "lib/templates/tse", name))).toBe(true);
    }
    expect(File.isExist(File.join(root, "lib/templates/tse/scaffold/_form.html.tse.tt"))).toBe(
      true,
    );
  });
});
