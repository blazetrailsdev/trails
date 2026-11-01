import { TypeError } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NameError } from "./error.js";
import { Inflector } from "./inflector.js";
import type { Loader } from "./loader.js";
import { newLoader, teardown, withFiles } from "./test-helpers/loader-test.js";

describe("TestCustomInflector", () => {
  let loader: Loader;

  beforeEach(() => {
    loader = newLoader();
  });
  afterEach(teardown);

  it("raises TypeError if the inflector #camelize does not return a string", async () => {
    await withFiles([["foo.ts"]], async () => {
      loader.inflector = new (class extends Inflector {
        override camelize(_basename: string, _abspath: string | null): string {
          return Symbol.for("Foo") as unknown as string;
        }
      })();

      await loader.pushDir(".");

      const setup = loader.setup();
      await expect(setup).rejects.toThrow(TypeError);
      const error = await setup.catch((e: unknown) => e);
      expect((error as TypeError).message).toContain("#camelize must return a String");
    });
  });

  it("raises if the returned constant names has ::", async () => {
    await withFiles([["foo-bar.ts"]], async () => {
      loader.inflector = new (class extends Inflector {
        override camelize(basename: string, abspath: string | null): string {
          if (basename === "foo_bar") {
            return "Foo::Bar";
          } else {
            return super.camelize(basename, abspath);
          }
        }
      })();

      await loader.pushDir(".");

      const setup = loader.setup();
      await expect(setup).rejects.toThrow(NameError);
      const error = await setup.catch((e: unknown) => e);
      expect((error as NameError).message).toContain("wrong constant name Foo::Bar");
      expect((error as NameError).message).toContain(
        "#camelize should return a simple constant name",
      );
    });
  });
});
