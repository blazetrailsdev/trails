import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dir, File, FileUtils, stdout } from "@blazetrails/ruby-compat";
import { invoke } from "../command.js";
import { Annotation, resetAnnotationRegistry } from "../source-annotation-extractor.js";

let appPath: string;
let originalCwd: string;

beforeEach(() => {
  appPath = Dir.mktmpdir("trails-notes-");
  originalCwd = Dir.pwd();
  Dir.chdir(appPath);
});

afterEach(() => {
  Dir.chdir(originalCwd);
  FileUtils.rmRf(appPath);
  resetAnnotationRegistry();
});

function appFile(path: string, contents: string): void {
  FileUtils.mkdirP(File.dirname(path));
  File.write(path, contents);
}

async function runNotesCommand(args: string[] = []): Promise<string> {
  const write = vi.spyOn(stdout, "write").mockReturnValue(true as never);
  await invoke("notes", args);
  const output = write.mock.calls.map((call) => String(call[0])).join("");
  write.mockRestore();
  return output;
}

describe("Rails::Command::NotesTest", { timeout: 30_000 }, () => {
  it("`rails notes` displays results for default directories and default annotations with aligned line number and annotation tag", async () => {
    appFile("app/controllers/some_controller.ts", "// OPTIMIZE: note in app directory");
    appFile("config/initializers/some_initializer.ts", "// TODO: note in config directory");
    appFile("db/some_seeds.ts", "// FIXME: note in db directory");
    appFile("lib/some_file.ts", "// TODO: note in lib directory");
    appFile("test/some_test.ts", "\n".repeat(100) + "// FIXME: note in test directory");

    appFile("some_other_dir/blah.ts", "// TODO: note in some_other directory");

    expect(await runNotesCommand()).toBe(
      "app/controllers/some_controller.ts:\n  * [  1] [OPTIMIZE] note in app directory\n\n" +
        "config/initializers/some_initializer.ts:\n  * [  1] [TODO] note in config directory\n\n" +
        "db/some_seeds.ts:\n  * [  1] [FIXME] note in db directory\n\n" +
        "lib/some_file.ts:\n  * [  1] [TODO] note in lib directory\n\n" +
        "test/some_test.ts:\n  * [101] [FIXME] note in test directory\n\n",
    );
  });

  it("`rails notes` displays an empty string when no results were found", async () => {
    expect(await runNotesCommand()).toBe("");
  });

  it("`rails notes --annotations` displays results for a single annotation without being prefixed by a tag", async () => {
    appFile("db/some_seeds.ts", "// FIXME: note in db directory");
    appFile("test/some_test.ts", "// FIXME: note in test directory");

    appFile("app/controllers/some_controller.ts", "// OPTIMIZE: note in app directory");
    appFile("config/initializers/some_initializer.ts", "// TODO: note in config directory");

    expect(await runNotesCommand(["--annotations", "FIXME"])).toBe(
      "db/some_seeds.ts:\n  * [1] note in db directory\n\n" +
        "test/some_test.ts:\n  * [1] note in test directory\n\n",
    );
  });

  it("`rails notes --annotations` displays results for multiple annotations being prefixed by a tag", async () => {
    appFile("app/controllers/some_controller.ts", "// FOOBAR: note in app directory");
    appFile("config/initializers/some_initializer.ts", "// TODO: note in config directory");
    appFile("lib/some_file.ts", "// TODO: note in lib directory");

    appFile("test/some_test.ts", "// FIXME: note in test directory");

    expect(await runNotesCommand(["--annotations", "FOOBAR", "TODO"])).toBe(
      "app/controllers/some_controller.ts:\n  * [1] [FOOBAR] note in app directory\n\n" +
        "config/initializers/some_initializer.ts:\n  * [1] [TODO] note in config directory\n\n" +
        "lib/some_file.ts:\n  * [1] [TODO] note in lib directory\n\n",
    );
  });

  it("displays results from additional directories added to the default directories from a config file", async () => {
    appFile("db/some_seeds.ts", "// FIXME: note in db directory");
    appFile("lib/some_file.ts", "// TODO: note in lib directory");
    appFile("spec/spec_helper.ts", "// TODO: note in spec");
    appFile("spec/models/user_spec.ts", "// TODO: note in model spec");

    Annotation.registerDirectories("spec");

    expect(await runNotesCommand()).toBe(
      "db/some_seeds.ts:\n  * [1] [FIXME] note in db directory\n\n" +
        "lib/some_file.ts:\n  * [1] [TODO] note in lib directory\n\n" +
        "spec/models/user_spec.ts:\n  * [1] [TODO] note in model spec\n\n" +
        "spec/spec_helper.ts:\n  * [1] [TODO] note in spec\n\n",
    );
  });

  it("displays results from additional file extensions added to the default extensions from a config file", async () => {
    Annotation.registerExtensions(
      "scss",
      "sass",
      (annotation) => new RegExp(`//\\s*(${annotation}):?\\s*(.*)$`),
    );
    appFile("db/some_seeds.ts", "// FIXME: note in db directory");
    appFile("app/assets/stylesheets/application.css.scss", "// TODO: note in scss");
    appFile("app/assets/stylesheets/application.css.sass", "// TODO: note in sass");

    expect(await runNotesCommand()).toBe(
      "app/assets/stylesheets/application.css.sass:\n  * [1] [TODO] note in sass\n\n" +
        "app/assets/stylesheets/application.css.scss:\n  * [1] [TODO] note in scss\n\n" +
        "db/some_seeds.ts:\n  * [1] [FIXME] note in db directory\n\n",
    );
  });

  it("displays results from additional tags added to the default tags from a config file", async () => {
    appFile("app/models/profile.ts", "// TESTME: some method to test");
    appFile(
      "app/controllers/hello_controller.ts",
      "// DEPRECATEME: this action is no longer needed",
    );
    appFile("db/some_seeds.ts", "// TODO: default tags such as TODO are still present");

    Annotation.registerTags("TESTME", "DEPRECATEME");

    expect(await runNotesCommand()).toBe(
      "app/controllers/hello_controller.ts:\n  * [1] [DEPRECATEME] this action is no longer needed\n\n" +
        "app/models/profile.ts:\n  * [1] [TESTME] some method to test\n\n" +
        "db/some_seeds.ts:\n  * [1] [TODO] default tags such as TODO are still present\n\n",
    );
  });

  it("does not display results from tags that are neither default nor registered", async () => {
    appFile("app/models/profile.ts", "// TESTME: some method to test");
    appFile(
      "app/controllers/hello_controller.ts",
      "// DEPRECATEME: this action is no longer needed",
    );
    appFile("db/some_seeds.ts", "// TODO: default tags such as TODO are still present");
    appFile("db/some_other_seeds.ts", "// BAD: this note should not be listed");

    Annotation.registerTags("TESTME", "DEPRECATEME");

    expect(await runNotesCommand()).toBe(
      "app/controllers/hello_controller.ts:\n  * [1] [DEPRECATEME] this action is no longer needed\n\n" +
        "app/models/profile.ts:\n  * [1] [TESTME] some method to test\n\n" +
        "db/some_seeds.ts:\n  * [1] [TODO] default tags such as TODO are still present\n\n",
    );
  });

  it.skip("does not pick up notes inside string literals", async () => {
    // BLOCKED: source-annotation-extractor-scans-comment-tokens-not-lines
    appFile("app/models/profile.ts", '"// TODO: do something"');

    expect(await runNotesCommand()).toBe("");
  });
});
