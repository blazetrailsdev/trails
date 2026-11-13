import { Task } from "@blazetrails/rake";
import { Dir, File, FileUtils, LOAD_PATH } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallGenerator } from "../../../../lib/generators/action-text/install/install-generator.js";

class Generator extends InstallGenerator {
  override trailsCommand: InstallGenerator["trailsCommand"] = async (command, options) => {
    commands.push(`trails ${command} ${JSON.stringify(options)}`);
    return undefined;
  };
}

await Generator.sourceRoot(InstallGenerator._sourceRoot);

let commands: string[];

LOAD_PATH.unshift(File.expandPath("../../../../lib", import.meta.dirname));

describe("ActionText::Generators::InstallGenerator", () => {
  let app: string;

  beforeEach(async () => {
    app = File.join(Dir.tmpdir(), `actiontext-install-${crypto.randomUUID()}`);
    await FileUtils.mkdirPAsync(File.join(app, "app/javascript"));
    await FileUtils.mkdirPAsync(File.join(app, "config"));
    await File.writeAsync(
      File.join(app, "app/javascript/application.js"),
      'import "./controllers"\n',
    );
    await File.writeAsync(File.join(app, "config/importmap.rb"), 'pin "application"\n');
    await File.writeAsync(File.join(app, "package.json"), '{ "dependencies": {} }\n');
    commands = [];
    vi.spyOn(InstallGenerator.prototype, "run").mockImplementation(async (command) => {
      commands.push(String(command));
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
      'trails railties:install:migrations FROM=active_storage,action_text {"inline":true}',
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
    expect(JSON.parse(await read("package.json")).dependencies).toHaveProperty(
      "@blazetrails/image-processing",
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
    const invoke = vi.spyOn(Trails.Command!, "invoke").mockResolvedValue(undefined as never);
    await (await Task.get("action_text:install")).execute();
    expect(invoke).toHaveBeenCalledWith("generate", ["action_text:install"]);
  });

  it("tells the user to import the modules when application.js is missing", async () => {
    await FileUtils.rmAsync(File.join(app, "app/javascript/application.js"));
    const say = vi.spyOn(Generator.prototype, "say");
    await Generator.start(["-t=test_unit", "--quiet"], { destinationRoot: app });
    expect(say).toHaveBeenCalledWith(
      "You must import the @rails/actiontext and trix JavaScript modules in your application entrypoint.\n",
      "green",
    );
  });

  it("skips the JavaScript install and image_processing without a package.json", async () => {
    await FileUtils.rmAsync(File.join(app, "package.json"));
    await Generator.start(["-t=test_unit", "--quiet"], { destinationRoot: app });
    expect(commands).toEqual([
      'trails railties:install:migrations FROM=active_storage,action_text {"inline":true}',
    ]);
  });
});
