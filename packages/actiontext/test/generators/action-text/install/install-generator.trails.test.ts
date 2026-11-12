import { Task } from "@blazetrails/rake";
import { File, FileUtils, LOAD_PATH } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallGenerator } from "../../../../lib/generators/action-text/install/install-generator.js";

class Generator extends InstallGenerator {
  static {
    void this.sourceRoot(InstallGenerator.sourceRoot());
  }

  override trailsCommand = async (command: string) => {
    commands.push(`trails ${command}`);
  };
}

let commands: string[];

LOAD_PATH.unshift(File.expandPath("../../../../lib", import.meta.dirname));

describe("ActionText::Generators::InstallGenerator", () => {
  let app: string;

  beforeEach(async () => {
    app = File.expandPath(`../../../../tmp-install-${Date.now()}`, import.meta.dirname);
    await FileUtils.mkdirPAsync(File.join(app, "app/javascript"));
    await FileUtils.mkdirPAsync(File.join(app, "config"));
    await File.writeAsync(
      File.join(app, "app/javascript/application.js"),
      'import "./controllers"\n',
    );
    await File.writeAsync(File.join(app, "config/importmap.rb"), 'pin "application"\n');
    await File.writeAsync(File.join(app, "package.json"), '{ "dependencies": {} }\n');
    commands = [];
    vi.spyOn(InstallGenerator.prototype, "run").mockImplementation(async (command: string) => {
      commands.push(command);
      return true;
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await FileUtils.rmRfAsync(app);
  });

  const read = (file: string) => File.readAsync(File.join(app, file));

  it("installs and imports the JavaScript dependencies, copies files and migrations", async () => {
    await Generator.start(["-t=test_unit", "--quiet"], { destinationRoot: app });

    expect(commands).toEqual([
      "pnpm add @rails/actiontext trix",
      "pnpm add --lockfile-only @blazetrails/image-processing",
      "trails railties:install:migrations FROM=active_storage,action_text",
    ]);
    expect(await read("app/javascript/application.js")).toContain(
      '\nimport "trix"\nimport "@rails/actiontext"\n',
    );
    expect(await read("config/importmap.rb")).toContain(
      'pin "trix"\npin "@rails/actiontext", to: "actiontext.esm.js"\n',
    );
    expect(await read("app/assets/stylesheets/actiontext.css")).toContain(".trix-content");
    expect(await read("app/views/active-storage/blobs/_blob.html.tse")).toContain("blob");
    expect(await read("app/views/layouts/action_text/contents/_content.html.tse")).toContain(
      "trix-content",
    );
    expect(await read("test/fixtures/action_text/rich_texts.yml")).toContain("# one:");
  });

  it("uses bun when bun.config.js exists", async () => {
    await File.writeAsync(File.join(app, "bun.config.js"), "");
    await Generator.start(["-t=test_unit", "--quiet"], { destinationRoot: app });
    expect(commands[0]).toBe("bun add @rails/actiontext trix");
  });

  it("defines the action_text:install rake task", async () => {
    await import("../../../../lib/tasks/actiontext.js");
    const task = await Task.get("action_text:install");
    expect(task.name).toBe("action_text:install");
  });
});
