import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classLevelBareRaises, foldBareRaises, scanRaises } from "./rails-bare-raises.js";

describe("bare raises", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "rails-bare-raises-"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  async function scan(ruby: string) {
    const file = path.join(dir, "scanned.rb");
    await writeFile(file, ruby);
    return foldBareRaises((await scanRaises([file]))[file] ?? []);
  }

  it("records a bare raise under the method's TS spellings", async () => {
    const ruby = `
      module Coders
        def dump(message)
          raise Errors::ForbiddenClass unless message.is_a?(Message)
        end

        def table_exists?
          raise(NotImplementedError)
        end

        def check!
          raise ArgumentError.new
        end
      end
    `;
    const methods = {
      dump: ["ForbiddenClass"],
      isTableExists: ["NotImplementedError"],
      tableExists: ["NotImplementedError"],
      checkBang: ["ArgumentError"],
    };
    expect(await scan(ruby)).toEqual({ "*": methods, Coders: methods });
  });

  it("leaves out a raise that carries a message, on one line or several", async () => {
    const ruby = `
      def a
        raise ArgumentError, "no"
      end

      def b
        raise ArgumentError.new(
          "no"
        )
      end

      def c
        raise ArgumentError, <<~MSG.squish
          no
        MSG
      end

      def d
        raise "no"
      end
    `;
    expect(await scan(ruby)).toEqual({});
  });

  it("keys same-named methods of two classes by their owner", async () => {
    const ruby = `
      module Type
        class TypeMap
          def register_type(key)
            raise ::ArgumentError unless key
            raise KeyError
          end
        end

        class HashLookupTypeMap
          def register_type(key)
            raise ::ArgumentError, "key is required" unless key
          end
        end
      end
    `;
    expect(await scan(ruby)).toEqual({
      "*": { registerType: ["KeyError"] },
      TypeMap: { registerType: ["ArgumentError", "KeyError"] },
    });
  });

  it("reads a define_method body, and skips comments and raises outside a method", async () => {
    const ruby = `
      class Railtie
        # raise ArgumentError
        raise LoadError unless defined?(Foo)

        define_method(:abstract_railtie?) { raise NotImplementedError }

        def self.generate(name)
          define_method("#{name}=") { raise FrozenError }
        end
      end
    `;
    const methods = {
      isAbstractRailtie: ["NotImplementedError"],
      abstractRailtie: ["NotImplementedError"],
      generate: ["FrozenError"],
    };
    expect(await scan(ruby)).toEqual({ "*": methods, Railtie: methods });
  });

  it("reports a bare raise outside any method, in a class body or a computed define_method", async () => {
    const file = path.join(dir, "class-level.rb");
    await writeFile(
      file,
      `
      class Railtie
        raise LoadError unless defined?(Foo)
        raise ArgumentError, "no"
        NAMES.each { |name| define_method("#{name}=") { raise FrozenError } }

        def a
          raise KeyError
        end
      end
    `,
    );
    const rows = (await scanRaises([file]))[file];
    expect(classLevelBareRaises(rows)).toEqual(["LoadError", "FrozenError"]);
  });
});
