import { Dir, File, stdout } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { require } from "./core-ext/kernel.js";
import { Cref } from "./cref.js";
import { NameError } from "./error.js";
import { Loader } from "./loader.js";
import { get, newLoader, teardown, withFiles, withSetup } from "./test-helpers/loader-test.js";

describe("TestLogging", () => {
  let loader: Loader;
  let output: string;

  const print = (message: string): void => {
    output += message;
  };

  function taggedMessage(message: string): string {
    return `Zeitwerk@${loader.tag}: ${message}`;
  }

  async function assertLogged(expected: string | RegExp, block: () => unknown): Promise<void> {
    output = "";
    await block();
    if (typeof expected === "string") {
      expect(output).toEqual(taggedMessage(expected));
    } else {
      expect(output).toMatch(new RegExp(taggedMessage(expected.source)));
    }
  }

  beforeEach(async () => {
    loader = await newLoader({ setup: false });
    loader.logger = print;
  });
  afterEach(async () => {
    Loader.defaultLogger = null;
    loader.logger = null;
    await teardown();
  });

  it("log! just prints to $stdout", async () => {
    loader.logger = null;
    loader.logBang();
    const message = "test log!";
    const write = vi.spyOn(stdout, "write").mockImplementation((chunk) => {
      print(String(chunk));
      return true;
    });
    try {
      await assertLogged(new RegExp(`${message}\n`), () => loader.log(message));
    } finally {
      write.mockRestore();
    }
  });

  it("accepts objects that respond to :call", async () => {
    loader.logger = { call: print };

    const message = "test message :call";
    await assertLogged(message, () => loader.log(message));
  });

  it("accepts objects that respond to :debug", async () => {
    loader.logger = { debug: print };

    const message = "test message :debug";
    await assertLogged(message, () => loader.log(message));
  });

  it("new loaders get assigned the default global logger", () => {
    expect(new Loader().logger).toBeNull();

    Loader.defaultLogger = { call: print };
    expect(new Loader().logger).toBe(Loader.defaultLogger);
  });

  it("logs loaded files", async () => {
    await withFiles([["x.ts", "export const X = true"]], async () => {
      const expected = new RegExp(`constant X loaded from file ${File.expandPath("x.ts")}`);
      await assertLogged(expected, async () => {
        await loader.pushDir(".");
        await loader.setup();

        expect(await get(Object, "X")).toBeTruthy();
      });
    });
  });

  it("logs required managed files", async () => {
    await withFiles([["x.ts", "export const X = true"]], async () => {
      const expected = new RegExp(`constant X loaded from file ${File.expandPath("x.ts")}`);
      await assertLogged(expected, async () => {
        await loader.pushDir(".");
        await loader.setup();

        expect(await require(File.expandPath("x.ts"))).toBeTruthy();
      });
    });
  });

  it("logs autovivified modules", async () => {
    await withFiles([["admin/user.ts", "export class User {}"]], async () => {
      const expected = new RegExp(
        `module Admin autovivified from directory ${File.expandPath("admin")}`,
      );
      await assertLogged(expected, async () => {
        await loader.pushDir(".");
        await loader.setup();

        expect(await get(Object, "Admin")).toBeTruthy();
      });
    });
  });

  it("logs implicit to explicit promotions", async () => {
    const files: [string, string][] = [
      ["a/m/x.ts", "export const X = true"],
      ["b/m.ts", "export class M {}"],
    ];
    await withFiles(files, async () => {
      await loader.pushDir("a");
      await loader.pushDir("b");
      const expected = new RegExp(
        `earlier autoload for M discarded, it is actually an explicit namespace defined in ${File.expandPath("b/m.ts")}`,
      );
      await assertLogged(expected, () => loader.setup());
    });
  });

  it("logs autoload configured for files", async () => {
    await withFiles([["x.ts", "export const X = true"]], async () => {
      await assertLogged(
        `autoload set for X, to be loaded from ${File.expandPath("x.ts")}`,
        async () => {
          await loader.pushDir(".");
          await loader.setup();
        },
      );
    });
  });

  it("logs failed autoloads, provided the require call succeeded", async () => {
    await withFiles([["x.ts", ""]], async () => {
      const expected = new RegExp(
        `expected file ${File.expandPath("x.ts")} to define constant X, but didn't`,
      );
      await assertLogged(expected, async () => {
        await loader.pushDir(".");
        await loader.setup();
        await expect(get(Object, "X")).rejects.toThrow(NameError);
      });
    });
  });

  it("logs autoload configured for directories", async () => {
    await withFiles([["admin/user.ts", "export class User {}"]], async () => {
      await assertLogged(
        `autoload set for Admin, to be autovivified from ${File.expandPath("admin")}`,
        async () => {
          await loader.pushDir(".");
          await loader.setup();
        },
      );
    });
  });

  it("logs unloads for autoloads", async () => {
    await withFiles([["x.ts", "export const X = true"]], async () => {
      await assertLogged(/autoload for X removed/, async () => {
        await loader.pushDir(".");
        await loader.setup();
        await loader.reload();
      });
    });
  });

  it("logs unloads for loaded objects", async () => {
    await withFiles([["x.ts", "export const X = true"]], async () => {
      await assertLogged(/X unloaded/, async () => {
        await loader.pushDir(".");
        await loader.setup();
        expect(await get(Object, "X")).toBeTruthy();
        await loader.reload();
      });
    });
  });

  it("logs files shadowed by autoloads", async () => {
    const files: [string, string][] = [
      ["a/foo.ts", 'export const Foo = "a"'],
      ["b/foo.ts", 'export const Foo = "b"'],
    ];
    await withFiles(files, async () => {
      await newLoader({ dirs: "a" });
      await assertLogged(
        /file .*?\/b\/foo\.ts is ignored because .*?\/a\/foo\.ts has precedence/,
        async () => {
          await loader.pushDir("b");
          await loader.setup();
        },
      );
    });
  });

  it("logs files shadowed by already defined constants", async () => {
    new Cref(Object, "X").set(1);
    await withFiles([["x.ts", "export const X = 1"]], async () => {
      await loader.pushDir(".");
      await assertLogged(/file .*?\/x\.ts is ignored because X is already defined/, () =>
        loader.setup(),
      );
    });
  });

  it("logs directories being ignored because they have no Ruby files", async () => {
    await withFiles([["tasks/foo.rake", ""]], async () => {
      await assertLogged(
        /directory .*?\/tasks is ignored because it has no Ruby files/,
        async () => {
          await loader.pushDir(".");
          await loader.setup();
        },
      );
    });
  });

  it("logs when eager loading a directory starts", async () => {
    await withFiles([], async () => {
      await assertLogged(new RegExp(`eager load directory ${Dir.pwd()} start`), async () => {
        await loader.pushDir(".");
        await loader.setup();
        await loader.eagerLoadDir(".");
      });
    });
  });

  it("logs when eager loading a directory ends", async () => {
    await withFiles([], async () => {
      await assertLogged(new RegExp(`eager load directory ${Dir.pwd()} end`), async () => {
        await loader.pushDir(".");
        await loader.setup();
        await loader.eagerLoadDir(".");
      });
    });
  });

  it("logs when eager loading starts", async () => {
    await withSetup(loader, [], {}, async () => {
      await assertLogged(/eager load start/, () => loader.eagerLoad());
    });
  });

  it("logs when eager loading ends", async () => {
    await withSetup(loader, [], {}, async () => {
      await assertLogged(/eager load end/, () => loader.eagerLoad());
    });
  });
});
