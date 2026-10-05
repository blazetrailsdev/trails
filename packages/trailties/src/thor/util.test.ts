import { describe, expect, it } from "vitest";
import { assertEmpty } from "@blazetrails/activesupport";
import { Module, rbModConstSet } from "@blazetrails/ruby-compat";
import { HashWithIndifferentAccess } from "./core-ext/hash-with-indifferent-access.js";
import { Thor, type ThorClass } from "./thor.js";
import * as Util from "./util.js";

const Scripts = { name: "Scripts" };

class MyScript extends Thor {
  static {
    (this as unknown as ThorClass).desc("zoo", "zoo around");
    (this as unknown as ThorClass).methodAdded("zoo");
  }
  zoo() {}
}

class AnotherScript extends Thor {
  static {
    (this as unknown as ThorClass).desc("baz", "do some bazing");
    (this as unknown as ThorClass).methodAdded("baz");
  }
  baz() {}
}
rbModConstSet(MyScript, "AnotherScript", AnotherScript);

class ScriptsMyScript extends MyScript {
  static {
    (this as unknown as ThorClass).desc("zoo", "zoo around");
    (this as unknown as ThorClass).methodAdded("zoo");
  }
  zoo() {}
}
rbModConstSet(Scripts, "MyScript", ScriptsMyScript);

class MyDefaults extends Thor {
  static {
    (this as unknown as ThorClass).namespace("default");
    (this as unknown as ThorClass).desc("cow", "prints 'moo'");
    (this as unknown as ThorClass).methodAdded("cow");
  }
  cow() {}
}
rbModConstSet(Scripts, "MyDefaults", MyDefaults);

class ChildDefault extends Thor {
  static {
    (this as unknown as ThorClass).namespace("default:child");
  }
}
rbModConstSet(Scripts, "ChildDefault", ChildDefault);

class BrokenCounter extends Thor {
  static {
    (this as unknown as ThorClass).namespace("app:broken:counter");
  }
}

class Apple extends Thor {
  static {
    (this as unknown as ThorClass).namespace("fruits");
    (this as unknown as ThorClass).desc("apple", "apple");
    (this as unknown as ThorClass).methodAdded("apple");
    (this as unknown as ThorClass).desc("rotten-apple", "rotten apple");
    (this as unknown as ThorClass).methodAdded("rotten_apple");
    (this as unknown as ThorClass).map({ ra: ":rotten_apple" });
  }
  apple() {}
  rotten_apple() {}
}

class Pear extends Thor {
  static {
    (this as unknown as ThorClass).namespace("fruits");
    (this as unknown as ThorClass).desc("pear", "pear");
    (this as unknown as ThorClass).methodAdded("pear");
  }
  pear() {}
}

describe("Thor::Util", () => {
  describe("#find_by_namespace", () => {
    it("returns 'default' if no namespace is given", () => {
      expect(Util.findByNamespace("")).toEqual(MyDefaults);
    });

    it("adds 'default' if namespace starts with :", () => {
      expect(Util.findByNamespace(":child")).toEqual(ChildDefault);
    });

    it("returns nil if the namespace can't be found", () => {
      expect(Util.findByNamespace("thor:core_ext:hash_with_indifferent_access")).toBeNull();
    });

    it("returns a class if it matches the namespace", () => {
      expect(Util.findByNamespace("app:broken:counter")).toEqual(BrokenCounter);
    });

    it("matches classes default namespace", () => {
      expect(Util.findByNamespace("scripts:my_script")).toEqual(ScriptsMyScript);
    });
  });

  describe("#namespace_from_thor_class", () => {
    it("replaces constant nesting with command namespacing", () => {
      expect(Util.namespaceFromThorClass("Foo::Bar::Baz")).toEqual("foo:bar:baz");
    });

    it("snake-cases component strings", () => {
      expect(Util.namespaceFromThorClass("FooBar::BarBaz::BazBoom")).toEqual(
        "foo_bar:bar_baz:baz_boom",
      );
    });

    it("accepts class and module objects", () => {
      expect(Util.namespaceFromThorClass(HashWithIndifferentAccess)).toEqual(
        "thor:core_ext:hash_with_indifferent_access",
      );
      expect(
        Util.namespaceFromThorClass(rbModConstSet({ name: "Thor" }, "Util", new Module())),
      ).toEqual("thor:util");
    });

    it("removes Thor::Sandbox namespace", () => {
      expect(Util.namespaceFromThorClass("Thor::Sandbox::Package")).toEqual("package");
    });
  });

  describe("#snake_case", () => {
    it("preserves no-cap strings", () => {
      expect(Util.snakeCase("foo")).toEqual("foo");
      expect(Util.snakeCase("foo_bar")).toEqual("foo_bar");
    });

    it("downcases all-caps strings", () => {
      expect(Util.snakeCase("FOO")).toEqual("foo");
      expect(Util.snakeCase("FOO_BAR")).toEqual("foo_bar");
    });

    it("downcases initial-cap strings", () => {
      expect(Util.snakeCase("Foo")).toEqual("foo");
    });

    it("replaces camel-casing with underscores", () => {
      expect(Util.snakeCase("FooBarBaz")).toEqual("foo_bar_baz");
      expect(Util.snakeCase("Foo_BarBaz")).toEqual("foo_bar_baz");
    });

    it("places underscores between multiple capitals", () => {
      expect(Util.snakeCase("ABClass")).toEqual("a_b_class");
    });
  });

  describe("#find_class_and_command_by_namespace", () => {
    // BLOCKED: port-thor-group
    it.skip("returns a Thor::Group class if full namespace matches", () => {
      class MyCounter extends Thor.Group {
        static {
          (this as unknown as ThorClass).methodAdded("one");
        }
        one() {}
      }
      expect(Util.findClassAndCommandByNamespace("my_counter")).toEqual([MyCounter, null]);
    });

    it("returns a Thor class if full namespace matches", () => {
      expect(Util.findClassAndCommandByNamespace("thor")).toEqual([Thor, null]);
    });

    it("returns a Thor class and the command name", () => {
      expect(Util.findClassAndCommandByNamespace("thor:help")).toEqual([Thor, "help"]);
    });

    it("falls back in the namespace:command look up even if a full namespace does not match", () => {
      rbModConstSet(Thor, "Help", {});
      expect(Util.findClassAndCommandByNamespace("thor:help")).toEqual([Thor, "help"]);
      delete (Thor as { Help?: unknown }).Help;
    });

    it("falls back on the default namespace class if nothing else matches", () => {
      expect(Util.findClassAndCommandByNamespace("test")).toEqual([MyDefaults, "test"]);
    });

    it("returns correct Thor class and the command name when shared namespaces", () => {
      expect(Util.findClassAndCommandByNamespace("fruits:apple")).toEqual([Apple, "apple"]);
      expect(Util.findClassAndCommandByNamespace("fruits:pear")).toEqual([Pear, "pear"]);
    });

    it("returns correct Thor class and the command name with hypen when shared namespaces", () => {
      expect(Util.findClassAndCommandByNamespace("fruits:rotten-apple")).toEqual([
        Apple,
        "rotten-apple",
      ]);
    });

    it("returns correct Thor class and the associated alias command name when shared namespaces", () => {
      expect(Util.findClassAndCommandByNamespace("fruits:ra")).toEqual([Apple, "ra"]);
    });
  });

  describe("#thor_classes_in", () => {
    it("returns thor classes inside the given class", () => {
      expect(Util.thorClassesIn(MyScript as unknown as ThorClass)).toEqual([AnotherScript]);
      assertEmpty(Util.thorClassesIn(AnotherScript as unknown as ThorClass));
    });
  });

  describe("#escape_globs", () => {
    it("escapes ? * { } [ ] glob characters", () => {
      expect(Util.escapeGlobs("apps?")).toEqual("apps\\?");
      expect(Util.escapeGlobs("apps*")).toEqual("apps\\*");
      expect(Util.escapeGlobs("apps {1}")).toEqual("apps \\{1\\}");
      expect(Util.escapeGlobs("apps [1]")).toEqual("apps \\[1\\]");
    });
  });
});
