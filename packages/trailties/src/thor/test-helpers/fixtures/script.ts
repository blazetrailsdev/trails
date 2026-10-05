import {
  isEmpty,
  NoMethodError,
  puts,
  rbCheckArity,
  rbFSend,
  rbModConstSet,
  rbObjClassname,
  RuntimeError,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import type { Base } from "../../base.js";
import { Thor, type ThorClass } from "../../thor.js";

export class MyScript extends Thor {
  declare options: Base["options"];

  static {
    const klass = this as unknown as ThorClass;
    klass.checkUnknownOptionsBang({ except: "with_optional" });

    klass.attrAccessor("someAttribute");
    klass.attrWriter("anotherAttribute");
    klass.attrReader("anotherAttribute");

    klass.attrReader("privateAttribute");

    klass.group("script");
    klass.defaultCommand(":example_default_command");

    klass.map(new Map<string | string[], string>([["-T", ":animal"]]).set(["-f", "--foo"], ":foo"));

    klass.map({ animal_prison: "zoo" });

    klass.desc("zoo", "zoo around");
    (this as unknown as ThorClass).methodAdded("zoo");

    klass.desc("animal TYPE", "horse around");

    klass.noCommands(() => {
      klass.noCommands(() => {
        (this as unknown as ThorClass).methodAdded("this_is_not_a_command");
      });

      (this as unknown as ThorClass).methodAdded("neither_is_this");
    });

    (this as unknown as ThorClass).methodAdded("animal");

    klass.map({ hid: "hidden" });

    klass.desc("hidden TYPE", "this is hidden", { hide: true });
    (this as unknown as ThorClass).methodAdded("hidden");

    klass.map({ fu: "zoo" });

    klass.desc("foo BAR", "do some fooing\n  This is more info!\n  Everyone likes more info!\n");
    klass.methodOption("force", { type: "boolean", desc: "Force to do some fooing" });
    (this as unknown as ThorClass).methodAdded("foo");

    klass.methodOption("all", { desc: "Do bazing for all the things" });
    klass.desc(["baz THING", "baz --all"], "super cool");
    (this as unknown as ThorClass).methodAdded("baz");

    klass.desc("example_default_command", "example!");
    klass.methodOptions({ with: ":string" });
    (this as unknown as ThorClass).methodAdded("example_default_command");

    klass.desc("call_myself_with_wrong_arity", "get the right error");
    (this as unknown as ThorClass).methodAdded("call_myself_with_wrong_arity");

    klass.desc("call_unexistent_method", "Call unexistent method inside a command");
    (this as unknown as ThorClass).methodAdded("call_unexistent_method");

    klass.desc("long_description", "a".repeat(80));
    klass.longDesc(
      "    This is a really really really long description.\n" +
        "    Here you go. So very long.\n" +
        "\n" +
        "    It even has two paragraphs.\n",
    );
    (this as unknown as ThorClass).methodAdded("long_description");

    klass.desc("name-with-dashes", "Ensure normalization of command names");
    (this as unknown as ThorClass).methodAdded("name_with_dashes");

    klass.desc("long_description", "a".repeat(80));
    klass.longDesc(
      "No added indentation,   Inline\n" +
        "whatespace not merged,\n" +
        "Linebreaks preserved\n" +
        "  and\n" +
        "    indentation\n" +
        "  too\n",
      { wrap: false },
    );
    (this as unknown as ThorClass).methodAdded("long_description_unwrapped");

    klass.methodOptions({ all: ":boolean" });
    klass.methodOption("lazy", { lazyDefault: "yes" });
    klass.methodOption("lazy_numeric", { type: "numeric", lazyDefault: 42 });
    klass.methodOption("lazy_array", { type: "array", lazyDefault: ["eat", "at", "joes"] });
    klass.methodOption("lazy_hash", { type: "hash", lazyDefault: { swedish: "meatballs" } });
    klass.desc("with_optional NAME", "invoke with optional name");
    (this as unknown as ThorClass).methodAdded("with_optional");

    klass.desc("send", "send as a command name");
    (this as unknown as ThorClass).methodAdded("send");

    klass.desc("what", "what");
  }

  zoo(): unknown {
    return true;
  }

  this_is_not_a_command() {}
  neither_is_this() {}

  animal(type: unknown): unknown {
    return [type];
  }

  hidden(type: unknown) {
    return [type];
  }

  foo(bar: unknown) {
    return [bar, this.options];
  }

  baz(thing: unknown = null) {
    if (thing == null && !this.options.has("all")) throw new RuntimeError("unhandled exception");
  }

  example_default_command() {
    return isEmpty(this.options) ? "default command" : this.options;
  }

  call_myself_with_wrong_arity(): unknown {
    rbCheckArity(this.call_myself_with_wrong_arity, 1);
    return rbFSend(this, "call_myself_with_wrong_arity", 4);
  }

  call_unexistent_method() {
    return rbFSend(this, "boom!");
  }

  long_description() {}
  name_with_dashes() {}
  long_description_unwrapped() {}

  with_optional(name: unknown = null, ...args: unknown[]) {
    return [name, this.options, args];
  }

  send() {
    return true;
  }

  protected methodMissing(meth: string, ...args: unknown[]) {
    if (meth === "boom!") {
      throw new NoMethodError(
        `undefined method '${meth}' for an instance of ${rbObjClassname(this)}`,
        meth,
      );
    } else {
      return [meth, args];
    }
  }

  protected what() {}
}

export class AnotherScript extends Thor {
  static {
    (this as unknown as ThorClass).desc("baz", "do some bazing");
    (this as unknown as ThorClass).methodAdded("baz");
  }

  baz() {}
}
rbModConstSet(MyScript, "AnotherScript", AnotherScript);

export class MyChildScript extends MyScript {
  static {
    const klass = this as unknown as ThorClass;
    klass.removeCommand("name_with_dashes");

    klass.methodOptions({ force: ":boolean", param: ":numeric" });
    (this as unknown as ThorClass).methodAdded("initialize");

    klass.desc("zoo", "zoo around");
    klass.methodOptions({ param: ":required" });
    (this as unknown as ThorClass).methodAdded("zoo");

    klass.desc("animal TYPE", "horse around");
    (this as unknown as ThorClass).methodAdded("animal");
    klass.methodOption("other", { type: "string", default: "method default", for: "animal" });
    klass.desc("animal KIND", "fish around", { for: "animal" });

    klass.desc("boom", "explodes everything");
    (this as unknown as ThorClass).methodAdded("boom");

    klass.removeCommand("boom", { undefine: true });
  }

  constructor(...args: unknown[]) {
    super(...args);
  }

  override zoo(): unknown {
    return this.options;
  }

  override animal(type: unknown): unknown {
    return [type, this.options];
  }

  boom() {}
}

export class Barn extends Thor {
  declare options: Base["options"];

  static isExitOnFailure(): boolean {
    return false;
  }

  static {
    const klass = this as unknown as ThorClass;
    klass.desc("open [ITEM]", "open the barn door");
    (this as unknown as ThorClass).methodAdded("open");

    klass.desc("paint [COLOR]", "paint the barn");
    klass.methodOption("coats", { type: "numeric", default: 2, desc: "how many coats of paint" });
    (this as unknown as ThorClass).methodAdded("paint");
  }

  open(item: unknown = null) {
    if (item === "shotgun") {
      puts.call($stdout, "That's going to leave a mark.");
    } else {
      puts.call($stdout, "Open sesame!");
    }
  }

  paint(color = "red") {
    puts.call($stdout, `${this.options["coats"]} coats of ${color} paint`);
  }
}

export class PackageNameScript extends Thor {
  static {
    (this as unknown as ThorClass).packageName("Baboon");
  }
}

const scripts = { name: "Scripts" };

class ScriptsMyScript extends MyChildScript {
  declare accessor: unknown;

  static {
    const klass = this as unknown as ThorClass;
    klass.argument("accessor", { type: "string" });
    klass.classOptions({ force: ":boolean" });
    klass.methodOption("new_option", { type: "string", for: "example_default_command" });

    (this as unknown as ThorClass).methodAdded("zoo");
  }

  override zoo(): unknown {
    return this.accessor;
  }
}
rbModConstSet(scripts, "MyScript", ScriptsMyScript);

class MyDefaults extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.checkUnknownOptionsBang();

    klass.namespace("default");
    klass.desc("cow", "prints 'moo'");
    (this as unknown as ThorClass).methodAdded("cow");

    klass.desc("command_conflict", "only gets called when prepended with a colon");
    (this as unknown as ThorClass).methodAdded("command_conflict");

    klass.desc("barn", "commands to manage the barn");
    klass.subcommand("barn", Barn as unknown as ThorClass);
  }

  static isExitOnFailure(): boolean {
    return false;
  }

  cow() {
    puts.call($stdout, "moo");
  }

  command_conflict() {
    puts.call($stdout, "command");
  }
}
rbModConstSet(scripts, "MyDefaults", MyDefaults);

class ChildDefault extends Thor {
  static {
    (this as unknown as ThorClass).namespace("default:child");
  }
}
rbModConstSet(scripts, "ChildDefault", ChildDefault);

class Arities extends Thor {
  static isExitOnFailure(): boolean {
    return false;
  }

  static {
    const klass = this as unknown as ThorClass;
    klass.desc("zero_args", "takes zero args");
    (this as unknown as ThorClass).methodAdded("zero_args");

    klass.desc("one_arg ARG", "takes one arg");
    (this as unknown as ThorClass).methodAdded("one_arg");

    klass.desc("two_args ARG1 ARG2", "takes two args");
    (this as unknown as ThorClass).methodAdded("two_args");

    klass.desc("optional_arg [ARG]", "takes an optional arg");
    (this as unknown as ThorClass).methodAdded("optional_arg");

    klass.desc(
      ["multiple_usages ARG --foo", "multiple_usages ARG --bar"],
      "takes mutually exclusive combinations of args and flags",
    );
    (this as unknown as ThorClass).methodAdded("multiple_usages");
  }

  zero_args() {}
  one_arg(_arg: unknown) {}
  two_args(_arg1: unknown, _arg2: unknown) {}
  optional_arg(_arg: unknown = "default") {}
  multiple_usages(_arg: unknown) {}
}
rbModConstSet(scripts, "Arities", Arities);

export const Scripts = scripts as typeof scripts & {
  MyScript: typeof ScriptsMyScript;
  MyDefaults: typeof MyDefaults;
  ChildDefault: typeof ChildDefault;
  Arities: typeof Arities;
};

export class Apple extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.namespace("fruits");
    klass.desc("apple", "apple");
    (this as unknown as ThorClass).methodAdded("apple");
    klass.desc("rotten-apple", "rotten apple");
    (this as unknown as ThorClass).methodAdded("rotten_apple");
    klass.map({ ra: ":rotten_apple" });
  }

  apple() {}
  rotten_apple() {}
}

export class Pear extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.namespace("fruits");
    klass.desc("pear", "pear");
    (this as unknown as ThorClass).methodAdded("pear");
  }

  pear() {}
}

export class MyClassOptionScript extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("free");

    klass.classExclusive(() => {
      klass.classOption("one");
      klass.classOption("two");
    });

    klass.classAtLeastOne(() => {
      klass.classOption("three");
      klass.classOption("four");
    });

    klass.desc("mix", "");
    klass.exclusive(() => {
      klass.atLeastOne(() => {
        klass.option("five");
        klass.option("six");
        klass.option("seven");
      });
    });
    (this as unknown as ThorClass).methodAdded("mix");
  }

  mix() {}
}

export class MyOptionScript extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("exclusive", "");
    klass.exclusive(() => {
      klass.methodOption("one");
      klass.methodOption("two");
      klass.methodOption("three");
    });
    klass.methodOption("after1");
    klass.methodOption("after2");
    (this as unknown as ThorClass).methodAdded("exclusive");

    klass.exclusive("after1", "after2", { for: "exclusive" });

    klass.desc("at_least_one", "");
    klass.atLeastOne(() => {
      klass.methodOption("one");
      klass.methodOption("two");
      klass.methodOption("three");
    });
    klass.methodOption("after1");
    klass.methodOption("after2");
    (this as unknown as ThorClass).methodAdded("at_least_one");
    klass.atLeastOne("after1", "after2", { for: "at_least_one" });

    klass.desc("only_one", "");
    klass.exclusive(() => {
      klass.atLeastOne(() => {
        klass.option("one");
        klass.option("two");
        klass.option("three");
      });
    });
    (this as unknown as ThorClass).methodAdded("only_one");

    klass.desc("no_relastions", "");
    klass.option("no_rel1");
    klass.option("no_rel2");
    (this as unknown as ThorClass).methodAdded("no_relations");
  }

  exclusive() {}
  at_least_one() {}
  only_one() {}
  no_relations() {}
}
