import { File, include, puts, rbObjRespondTo, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Actions } from "../../actions.js";
import { Group, type GroupClass } from "../../group.js";
import type { ThorClass } from "../../thor.js";

const __FILE__ = decodeURIComponent(
  new URL(import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/i, ""),
);

type ActionsGroupClass = GroupClass & {
  addRuntimeOptionsBang(): void;
  sourcePaths(): string[];
  sourceRoot(path?: string | null): Promise<string | null>;
};

type ActionsGroup = {
  options: Record<string, unknown>;
  capture(block: () => unknown): string;
  concat(string: string): unknown;
};

export class MyCounter extends Group {
  declare first: unknown;
  declare second: unknown;
  declare options: Record<string, unknown>;

  static {
    include(this, Actions);
    (this as unknown as ActionsGroupClass).addRuntimeOptionsBang();
  }

  static isExitOnFailure(): boolean {
    return false;
  }

  static getFromSuper(this: GroupClass): unknown {
    return this.fromSuperclass("getFromSuper", 13);
  }

  static {
    const klass = this as unknown as ActionsGroupClass;
    void klass.sourceRoot(File.expandPath(File.dirname(__FILE__)));
    klass.sourcePaths().push(File.expandPath("broken", File.dirname(__FILE__)));

    klass.argument("first", { type: "numeric" });
    klass.argument("second", { type: "numeric", default: 2 });

    klass.classOption("third", {
      type: "numeric",
      desc: "The third argument",
      default: 3,
      banner: "THREE",
      aliases: "-t",
    });
    klass.classOption("fourth", { type: "numeric", desc: "The fourth argument" });
    klass.classOption("simple", { type: "numeric", aliases: "z" });
    klass.classOption("symbolic", { type: "numeric", aliases: ["y", "r"] });
    klass.classOption("array", { type: "array", default: ["foo", "bar"] });

    klass.desc("Description:\n  This generator runs three commands: one, two and three.\n");

    (this as unknown as ThorClass).methodAdded("one");
    (this as unknown as ThorClass).methodAdded("two");
    (this as unknown as ThorClass).methodAdded("three");
    (this as unknown as ThorClass).methodAdded("four");
    (this as unknown as ThorClass).methodAdded("five");
    (this as unknown as ThorClass).methodAdded("six");

    klass.noCommands(() => (this as unknown as ThorClass).methodAdded("world"));
  }

  one(): unknown {
    return this.first;
  }

  two(): unknown {
    return this.second;
  }

  three(): unknown {
    return this.options["third"];
  }

  four(): unknown {
    return this.options["fourth"];
  }

  five(): unknown {
    return this.options["simple"];
  }

  six(): unknown {
    return this.options["symbolic"];
  }

  world(block: () => unknown): unknown {
    const self = this as unknown as ActionsGroup;
    const result = self.capture(block);
    return self.concat(result.trim() + " world!");
  }
}

export class ClearCounter extends MyCounter {
  static {
    const klass = this as unknown as ActionsGroupClass;
    klass.sourcePaths().unshift(File.expandPath(File.join(File.dirname(__FILE__), "doc")));

    klass.removeArgument("first", "second", { undefine: true });
    klass.removeClassOption("third");
  }

  static async sourceRoot(): Promise<string> {
    return File.expandPath(File.join(File.dirname(__FILE__), "bundle"));
  }
}

export class BrokenCounter extends MyCounter {
  static {
    const klass = this as unknown as ActionsGroupClass;
    klass.sourcePaths().unshift(File.expandPath(File.join(File.dirname(__FILE__), "doc")));

    klass.namespace("app:broken:counter");
    klass.classOption("fail", { type: "boolean", default: false });

    Object.defineProperty(this, "sourceRoot", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    (this as unknown as ThorClass).methodAdded("one");
    (this as unknown as ThorClass).methodAdded("four");
    (this as unknown as ThorClass).methodAdded("five");
  }

  override one(): unknown {
    return this.options["first"];
  }

  override four(): unknown {
    return rbObjRespondTo(this, "fail");
  }

  override five(): unknown {
    return this.options["fail"]
      ? (this as unknown as { this_method_does_not_exist(): unknown }).this_method_does_not_exist()
      : 5;
  }
}

export class WhinyGenerator extends Group {
  static {
    include(this, Actions);
  }

  static async sourceRoot(): Promise<string> {
    return File.expandPath(File.dirname(__FILE__));
  }

  static {
    (this as unknown as ThorClass).methodAdded("wrong_arity");
  }

  wrong_arity(_required: unknown) {}
}

export class CommandConflict extends Group {
  static {
    const klass = this as unknown as GroupClass;
    klass.desc("A group with the same name as a default command");
    (this as unknown as ThorClass).methodAdded("group");
  }

  group() {
    puts.call($stdout, "group");
  }
}

export class ParentGroup extends Group {
  protected foo(): unknown {
    return "foo";
  }

  protected baz(name: unknown = "baz"): unknown {
    return name;
  }
}

export class ChildGroup extends ParentGroup {
  static {
    const klass = this as unknown as GroupClass;
    (this as unknown as ThorClass).methodAdded("bar");
    klass.publicCommand("foo", "baz");
  }

  bar(): unknown {
    return "bar";
  }
}
