import { describe, expect, it } from "vitest";
import { puts, rbGvSet, rbInspect, stdout as $stdout } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import { Group, type GroupClass } from "./group.js";
import { capture } from "./test-helpers/helper.js";
import { Thor, type ThorClass } from "./thor.js";

class BoringVendorProvidedCLI extends Thor {
  static {
    (this as unknown as ThorClass).desc("boring", "do boring stuff");
    (this as unknown as ThorClass).methodAdded("boring");
  }

  boring() {
    puts.call($stdout, "bored. <yawn>");
  }
}

class ExcitingPluginCLI extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("hooray", "say hooray!");
    (this as unknown as ThorClass).methodAdded("hooray");

    klass.desc("fireworks", "exciting fireworks!");
    (this as unknown as ThorClass).methodAdded("fireworks");
  }

  hooray() {
    puts.call($stdout, "hooray!");
  }

  fireworks() {
    puts.call($stdout, "kaboom!");
  }
}

class SuperSecretPlugin extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.defaultCommand("squirrel");

    klass.desc("squirrel", "All of secret squirrel's secrets");
    (this as unknown as ThorClass).methodAdded("squirrel");
  }

  squirrel() {
    puts.call($stdout, "I love nuts");
  }
}

class GroupPlugin extends Group {
  static {
    const klass = this as unknown as GroupClass & ThorClass;
    klass.desc("part one");
    (this as unknown as ThorClass).methodAdded("part_one");

    klass.desc("part two");
    (this as unknown as ThorClass).methodAdded("part_two");
  }

  part_one() {
    puts.call($stdout, "part one");
  }

  part_two() {
    puts.call($stdout, "part two");
  }
}

class ClassOptionGroupPlugin extends Group {
  static {
    (this as unknown as GroupClass).classOption("who", {
      type: "string",
      aliases: "-w",
      default: "zebra",
    });
  }
}

class PluginInheritingFromClassOptionsGroup extends ClassOptionGroupPlugin {
  declare options: Base["options"];

  static {
    const klass = this as unknown as GroupClass & ThorClass;
    klass.desc("animal");
    (this as unknown as ThorClass).methodAdded("animal");
  }

  animal() {
    puts.call($stdout, rbInspect(this.options["who"]));
  }
}

class PluginWithDefault extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("say MSG", "print MSG");
    (this as unknown as ThorClass).methodAdded("say");

    klass.defaultCommand("say");
  }

  say(msg: unknown) {
    puts.call($stdout, msg);
  }
}

class PluginWithDefaultMultipleArguments extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("say MSG [MSG]", "print multiple messages");
    (this as unknown as ThorClass).methodAdded("say");

    klass.defaultCommand("say");
  }

  say(...args: unknown[]) {
    puts.call($stdout, args);
  }
}

class PluginWithDefaultcommandAndDeclaredArgument extends Thor {
  declare msg: unknown;

  static {
    const klass = this as unknown as ThorClass;
    klass.desc("say MSG [MSG]", "print multiple messages");
    klass.argument("msg");
    (this as unknown as ThorClass).methodAdded("say");

    klass.defaultCommand("say");
  }

  say() {
    puts.call($stdout, this.msg);
  }
}

class SubcommandWithDefault extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.defaultCommand("default");

    klass.desc("default", "default subcommand");
    (this as unknown as ThorClass).methodAdded("default");

    klass.desc("with_args", "subcommand with arguments");
    (this as unknown as ThorClass).methodAdded("with_args");
  }

  default() {
    puts.call($stdout, "default");
  }

  with_args(...args: unknown[]) {
    puts.call($stdout, "received arguments: " + args.join(","));
  }
}

const cli = BoringVendorProvidedCLI as unknown as ThorClass;

cli.register(
  ExcitingPluginCLI as unknown as ThorClass,
  "exciting",
  "do exciting things",
  "Various non-boring actions",
);

cli.register(
  SuperSecretPlugin as unknown as ThorClass,
  "secret",
  "secret stuff",
  "Nothing to see here. Move along.",
  { hide: true },
);

cli.register(
  GroupPlugin as unknown as GroupClass,
  "groupwork",
  "Do a bunch of things in a row",
  "purple monkey dishwasher",
);

cli.register(
  PluginInheritingFromClassOptionsGroup as unknown as GroupClass,
  "zoo",
  "zoo [-w animal]",
  "Shows a provided animal or just zebra",
);

cli.register(PluginWithDefault as unknown as ThorClass, "say", "say message", "subcommands ftw");

cli.register(
  PluginWithDefaultMultipleArguments as unknown as ThorClass,
  "say_multiple",
  "say message",
  "subcommands ftw",
);

cli.register(
  PluginWithDefaultcommandAndDeclaredArgument as unknown as ThorClass,
  "say_argument",
  "say message",
  "subcommands ftw",
);

cli.register(
  SubcommandWithDefault as unknown as ThorClass,
  "subcommand",
  "subcommand",
  "Run subcommands",
);

describe(".register-ing a Thor subclass", () => {
  it("registers the plugin as a subcommand", async () => {
    const fireworksOutput = await capture(":stdout", () => cli.start(["exciting", "fireworks"]));
    expect(fireworksOutput).toEqual("kaboom!\n");
  });

  it("includes the plugin's usage in the help", async () => {
    const helpOutput = await capture(":stdout", () => cli.start(["help"]));
    expect(helpOutput).toContain("do exciting things");
  });

  describe("with a default command,", () => {
    it("invokes the default command correctly", async () => {
      const output = await capture(":stdout", () => cli.start(["say", "hello"]));
      expect(output).toContain("hello");
    });

    it("invokes the default command correctly with multiple args", async () => {
      const output = await capture(":stdout", () => cli.start(["say_multiple", "hello", "adam"]));
      expect(output).toContain("hello");
      expect(output).toContain("adam");
    });

    it("invokes the default command correctly with a declared argument", async () => {
      const output = await capture(":stdout", () => cli.start(["say_argument", "hello"]));
      expect(output).toContain("hello");
    });

    it("displays the subcommand's help message", async () => {
      const output = await capture(":stdout", () => cli.start(["subcommand", "help"]));
      expect(output).toContain("default subcommand");
      expect(output).toContain("subcommand with argument");
    });

    it("invokes commands with their actual args", async () => {
      const output = await capture(":stdout", () =>
        cli.start(["subcommand", "with_args", "actual_argument"]),
      );
      expect(output.trim()).toEqual("received arguments: actual_argument");
    });
  });

  describe("when $thor_runner is false", () => {
    it("includes the plugin's subcommand name in subcommand's help", async () => {
      try {
        rbGvSet("$thor_runner", false);
        const helpOutput = await capture(":stdout", () => cli.start(["exciting"]));
        expect(helpOutput).toContain("thor exciting fireworks");
      } finally {
        rbGvSet("$thor_runner", true);
      }
    });
  });

  describe("when hidden", () => {
    it("omits the hidden plugin's usage from the help", async () => {
      const helpOutput = await capture(":stdout", () => cli.start(["help"]));
      expect(helpOutput).not.toContain("secret stuff");
    });

    it("registers the plugin as a subcommand", async () => {
      const secretOutput = await capture(":stdout", () => cli.start(["secret", "squirrel"]));
      expect(secretOutput).toEqual("I love nuts\n");
    });
  });
});

describe(".register-ing a Thor::Group subclass", () => {
  it("registers the group as a single command", async () => {
    const groupOutput = await capture(":stdout", () => cli.start(["groupwork"]));
    expect(groupOutput).toEqual("part one\npart two\n");
  });
});

describe(".register-ing a Thor::Group subclass with class options", () => {
  it("works w/o command options", async () => {
    const groupOutput = await capture(":stdout", () => cli.start(["zoo"]));
    expect(groupOutput).toMatch(/zebra/);
  });

  it("works w/command options", async () => {
    const groupOutput = await capture(":stdout", () => cli.start(["zoo", "-w", "lion"]));
    expect(groupOutput).toMatch(/lion/);
  });
});
