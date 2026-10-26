import { describe, expect, it } from "vitest";
import { File, getProcessAdapter, RbConfig } from "@blazetrails/ruby-compat";
import { Thor, type ThorClass } from "./thor.js";
import {
  camelCase,
  findClassAndCommandByNamespace,
  findClassAndTaskByNamespace,
  rubyCommand,
} from "./util.js";

class Fruits extends Thor {
  static {
    (this as unknown as ThorClass).namespace("util_trails_fruits");
    (this as unknown as ThorClass).desc("apple", "apple");
    (this as unknown as ThorClass).methodAdded("apple");
  }
  static isCommandExists(this: ThorClass, commandName: string): boolean {
    return Object.keys(this.commands()).includes(commandName);
  }
  apple() {}
}

describe("Thor::Util", () => {
  describe("#camel_case", () => {
    it("capitalizes each underscored component", () => {
      expect(camelCase("foo_bar_baz")).toBe("FooBarBaz");
      expect(camelCase("foo")).toBe("Foo");
      expect(camelCase("fOO_bAR")).toBe("FooBar");
    });

    it("preserves a string with a capital and no underscore", () => {
      expect(camelCase("fooBar")).toBe("fooBar");
    });
  });

  describe("#find_class_and_command_by_namespace", () => {
    it("returns the class holding the command under the namespace", () => {
      expect(findClassAndCommandByNamespace("util_trails_fruits:apple")).toEqual([Fruits, "apple"]);
    });

    it("returns the class and no command when the full namespace matches", () => {
      expect(findClassAndCommandByNamespace("util_trails_fruits")).toEqual([Fruits, null]);
    });

    it("returns no class without the fallback", () => {
      expect(findClassAndCommandByNamespace("util_trails_pear", false)).toEqual([null, null]);
    });

    it("is aliased as find_class_and_task_by_namespace", () => {
      expect(findClassAndTaskByNamespace).toBe(findClassAndCommandByNamespace);
    });
  });

  describe("#ruby_command", () => {
    it("is the path of the running JS runtime's executable", () => {
      const execPath = getProcessAdapter().execPath!();
      expect(File.join(RbConfig.CONFIG.bindir, RbConfig.CONFIG.ruby_install_name)).toBe(
        execPath.slice(0, execPath.length - RbConfig.CONFIG.EXEEXT.length),
      );
      expect(rubyCommand()).toBe(/\s/.test(execPath) ? `"${execPath}"` : execPath);
      expect(rubyCommand()).toBe(rubyCommand());
    });
  });
});
