import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { Dir, File, FileUtils, getFs, include } from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "../actions.js";
import { Shell } from "../shell.js";
import { Thor } from "../thor.js";

class Script extends Thor {
  static {
    include(this, Shell);
    include(this, Actions);
  }
}

type Host = ActionsHost & {
  chmod(path: string, mode: number, config?: object): Promise<void>;
  gsubFile(path: string, flag: RegExp | string, ...args: unknown[]): Promise<void>;
  uncommentLines(path: string, flag: RegExp | string, ...args: unknown[]): Promise<void>;
  commentLines(path: string, flag: RegExp | string, ...args: unknown[]): Promise<void>;
  removeFile(path: string, config?: object): Promise<void>;
  removeDir(path: string, config?: object): Promise<void>;
};

describe("Thor::Actions chmod, gsub_file, comment_lines and remove_file (trails)", () => {
  let root: string;
  const host = (options: object = {}, config: object = {}): Host =>
    new Script([], options, { destinationRoot: root, ...config }) as unknown as Host;
  const file = (name: string): string => File.join(root, name);

  beforeEach(() => {
    root = Dir.mktmpdir("thor-file-manipulation-");
    FileUtils.mkdirP(file("doc"));
    File.write(file("doc/README"), "__start__\nREADME\n__end__\n");
    File.write(
      file("doc/COMMENTER"),
      "__start__\n # greenblue\n#\n#orange\n    purple\n  ind#igo\n",
    );
  });
  afterEach(() => {
    FileUtils.rmRf(root);
  });

  it("chmods recursively and reports the relative path", async () => {
    const out = await capture(":stdout", () => host().chmod("doc", 0o700));
    expect(getFs().statSync(file("doc/README")).mode & 0o777).toBe(0o700);
    expect(out).toMatch(/chmod {2}doc\n/);
  });

  it("does not chmod when pretending or revoking", async () => {
    const before = getFs().statSync(file("doc/README")).mode;
    await capture(":stdout", async () => {
      await host({ pretend: true }).chmod("doc/README", 0o600);
      await host({}, { behavior: "revoke" }).chmod("doc/README", 0o600);
    });
    expect(getFs().statSync(file("doc/README")).mode).toBe(before);
  });

  it("gsubs with a replacement string and its backreferences", async () => {
    const out = await capture(":stdout", () => host().gsubFile("doc/README", /__(\w+)__/, "<\\1>"));
    expect(File.read(file("doc/README"))).toBe("<start>\nREADME\n<end>\n");
    expect(out).toMatch(/gsub {2}doc\/README\n/);
  });

  it("gsubs with a block and keeps non-ASCII content", async () => {
    File.write(file("doc/README"), "é rake\n");
    await capture(":stdout", () =>
      host().gsubFile("doc/README", "rake", (match: string) => `${match}é`, { verbose: false }),
    );
    expect(File.read(file("doc/README"))).toBe("é rakeé\n");
  });

  it("gsubs on revoke only when forced, and never when pretending", async () => {
    await host({}, { behavior: "revoke" }).gsubFile("doc/README", "README", "x", {
      verbose: false,
    });
    await host({ pretend: true }).gsubFile("doc/README", "README", "x", { verbose: false });
    expect(File.read(file("doc/README"))).toMatch(/README/);
    await host({}, { behavior: "revoke" }).gsubFile("doc/README", "README", "x", {
      verbose: false,
      force: true,
    });
    expect(File.read(file("doc/README"))).toBe("__start__\nx\n__end__\n");
  });

  it("uncomments matching lines, keeping the indentation", async () => {
    await host().uncommentLines("doc/COMMENTER", /greenblue|orange/, { verbose: false });
    expect(File.read(file("doc/COMMENTER"))).toBe(
      "__start__\n greenblue\n#\norange\n    purple\n  ind#igo\n",
    );
  });

  it("comments matching lines given a string flag", async () => {
    await host().commentLines("doc/COMMENTER", "purple", { verbose: false });
    expect(File.read(file("doc/COMMENTER"))).toMatch(/^ {4}# purple$/m);
    expect(File.read(file("doc/COMMENTER"))).toMatch(/^ {2}ind#igo$/m);
  });

  it("removes a file, a directory and a dangling symlink", async () => {
    await File.symlinkAsync(file("missing"), file("dangling"));
    const out = await capture(":stdout", async () => {
      const r = host();
      await r.removeFile("doc/README");
      await r.removeFile("dangling");
      await r.removeDir("doc");
    });
    expect(getFs().existsSync(file("doc"))).toBe(false);
    expect(await File.isSymlinkAsync(file("dangling"))).toBe(false);
    expect(out).toMatch(/remove {2}doc\/README\n/);
  });

  it("does not remove when pretending or revoking", async () => {
    await capture(":stdout", async () => {
      await host({ pretend: true }).removeFile("doc/README");
      await host({}, { behavior: "revoke" }).removeFile("doc/README");
    });
    expect(getFs().existsSync(file("doc/README"))).toBe(true);
  });
});
