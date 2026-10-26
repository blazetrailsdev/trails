import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { Dir, File, FileUtils, include } from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "../actions.js";
import { Shell } from "../shell.js";
import { Thor } from "../thor.js";

class Script extends Thor {
  static {
    include(this, Shell);
    include(this, Actions);
  }
  protected fileName(): string {
    return "rdoc";
  }
}

type Host = ActionsHost & {
  emptyDirectory(destination: string, config?: object): Promise<unknown>;
  createFile(destination: string, ...args: unknown[]): Promise<unknown>;
  createLink(destination: string, ...args: unknown[]): Promise<unknown>;
};

describe("Thor::Actions create_file, create_link and empty_directory (trails)", () => {
  let root: string;
  const host = (options: object = {}, config: object = {}): Host =>
    new Script([], options, { destinationRoot: root, ...config }) as unknown as Host;

  beforeEach(() => {
    root = Dir.mktmpdir("thor-create-file-");
  });
  afterEach(() => {
    FileUtils.rmRf(root);
  });

  it("creates a file, answers the given destination and reports create", async () => {
    let result: unknown;
    const out = await capture(":stdout", async () => {
      result = await host().createFile("doc/%fileName%.rb", "CONFIG");
    });
    expect(result).toBe("doc/rdoc.rb");
    expect(File.read(File.join(root, "doc/rdoc.rb"))).toBe("CONFIG");
    expect(out).toMatch(/create {2}doc\/rdoc\.rb/);
  });

  it("renders a block once and reports identical for the same content", async () => {
    let calls = 0;
    const block = async (): Promise<string> => {
      calls += 1;
      return "é";
    };
    const out = await capture(":stdout", async () => {
      const r = host();
      await r.createFile("a.txt", block);
      await r.createFile("a.txt", "é");
    });
    expect(calls).toBe(1);
    expect(out).toMatch(/identical {2}a\.txt/);
  });

  it("forces or skips a changed file from the config over the host options", async () => {
    File.write(File.join(root, "a.txt"), "old");
    const out = await capture(":stdout", async () => {
      await host({ force: true }).createFile("a.txt", "new", { force: false, skip: true });
    });
    expect(out).toMatch(/skip {2}a\.txt/);
    expect(File.read(File.join(root, "a.txt"))).toBe("old");

    await capture(":stdout", () => host({ force: true }).createFile("a.txt", "new"));
    expect(File.read(File.join(root, "a.txt"))).toBe("new");
  });

  it("asks the shell on a conflict and recurses with its answer", async () => {
    File.write(File.join(root, "a.txt"), "old");
    const r = host();
    const asked: string[] = [];
    (r.shell as unknown as Record<string, unknown>).fileCollision = (destination: string) => {
      asked.push(destination);
      return false;
    };
    const out = await capture(":stdout", () => r.createFile("a.txt", "new"));
    expect(asked).toEqual([File.join(root, "a.txt")]);
    expect(out).toMatch(/conflict {2}a\.txt\n\s+skip {2}a\.txt/);
    expect(File.read(File.join(root, "a.txt"))).toBe("old");
  });

  it("does not write under pretend, and removes on revoke", async () => {
    await capture(":stdout", () => host({ pretend: true }).createFile("a.txt", "new"));
    expect(File.isExist(File.join(root, "a.txt"))).toBe(false);

    await capture(":stdout", () => host().emptyDirectory("doc"));
    expect(File.isDirectory(File.join(root, "doc"))).toBe(true);
    const out = await capture(":stdout", () =>
      host({}, { behavior: "revoke" }).emptyDirectory("doc"),
    );
    expect(out).toMatch(/remove {2}doc/);
    expect(File.isExist(File.join(root, "doc"))).toBe(false);
  });

  it("reports file_clash when the destination's parent is a file", async () => {
    File.write(File.join(root, "doc"), "FOO");
    const out = await capture(":stdout", () => host().createFile("doc/config.rb", "x"));
    expect(out).toMatch(/file_clash {2}doc\/config\.rb/);
  });

  it("creates a symbolic link by default and reports it identical afterwards", async () => {
    File.write(File.join(root, "source.txt"), "x");
    const out = await capture(":stdout", async () => {
      const r = host();
      expect(await r.createLink("link.txt", File.join(root, "source.txt"))).toBe("link.txt");
      await r.createLink("link.txt", File.join(root, "source.txt"));
    });
    expect(File.isSymlink(File.join(root, "link.txt"))).toBe(true);
    expect(out).toMatch(/identical {2}link\.txt/);
  });

  it("forces a changed file when the shell answers the collision", async () => {
    File.write(File.join(root, "a.txt"), "old");
    const out = await capture(":stdout", () => host().createFile("a.txt", "new"));
    expect(out).toMatch(/conflict {2}a\.txt\n\s+force {2}a\.txt/);
    expect(File.read(File.join(root, "a.txt"))).toBe("new");
  });

  it("leaves an unknown encoded instruction as it is and converts a nil answer to an empty string", async () => {
    const r = host() as Host & { blank(): null };
    r.blank = () => null;
    await capture(":stdout", async () => {
      expect(await r.createFile("%missing%.rb", "x")).toBe("%missing%.rb");
      expect(await r.createFile("a%blank%.rb", "x")).toBe("a.rb");
    });
  });

  it("creates the file with the given perm", async () => {
    await capture(":stdout", () => host().createFile("run.sh", "x", { perm: 0o755 }));
    expect(File.stat(File.join(root, "run.sh")).mode & 0o777).toBe(0o755);
  });

  it("removes a created file on revoke and answers the given destination", async () => {
    await capture(":stdout", () => host().createFile("a.txt", "x"));
    let result: unknown;
    await capture(":stdout", async () => {
      result = await host({}, { behavior: "revoke" }).createFile("a.txt", "x");
    });
    expect(result).toBe("a.txt");
    expect(File.isExist(File.join(root, "a.txt"))).toBe(false);
  });

  it("reports file_clash when the destination is a directory", async () => {
    FileUtils.mkdirP(File.join(root, "doc"));
    const out = await capture(":stdout", () => host().createFile("doc", "x"));
    expect(out).toMatch(/file_clash {2}doc/);
    expect(File.isDirectory(File.join(root, "doc"))).toBe(true);
  });

  it("creates a hard link with symbolic: false and replaces an existing link", async () => {
    const source = File.join(root, "source.txt");
    File.write(source, "x");
    File.write(File.join(root, "other.txt"), "y");
    await capture(":stdout", async () => {
      await host().createLink("hard.txt", source, { symbolic: false });
      await host({ force: true }).createLink("hard.txt", File.join(root, "other.txt"), {
        symbolic: false,
      });
    });
    expect(File.isSymlink(File.join(root, "hard.txt"))).toBe(false);
    expect(File.read(File.join(root, "hard.txt"))).toBe("y");
  });
});
