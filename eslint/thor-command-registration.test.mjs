import { Linter, RuleTester } from "eslint";
import { expect, it } from "vitest";
import rule from "./thor-command-registration.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const unregistered = (name) => ({ messageId: "unregistered", data: { name } });

tester.run("thor-command-registration", rule, {
  valid: [
    {
      code: `
class MyScript extends Thor {
  static {
    this.desc("zoo", "zoo around");
    this.methodAdded("zoo");
  }
  zoo() {}
}`,
    },
    {
      code: `
class MyScript extends Thor {
  static {
    this.noCommands(() => this.methodAdded("helper"));
  }
  helper() {}
}`,
    },
    {
      code: `
class MyGroup extends Thor.Group {
  static {
    (this as unknown as ThorClass).methodAdded("one");
  }
  one() {}
  private two() {}
  protected three() {}
  #four() {}
  get five() { return 5; }
  set five(value) {}
  constructor() { super(); }
}`,
    },
    {
      code: `
class MyScript extends Thor {
  static override start() {}
  static banner() {}
}`,
    },
    {
      code: `
class MyScript extends Thor {
  static {
    this.methodAdded("zoo");
  }
  zoo(name: string): void;
  zoo(name: number): void;
  zoo(name: unknown) {}
}`,
    },
    { code: `class Plain { zoo() {} }` },
    { code: `class Model extends Base { zoo() {} }` },
    {
      code: `
class Generator extends NamedBase {
  static {
    this.methodAdded("createFile");
  }
  createFile() {}
}`,
      options: [{ baseClasses: ["NamedBase"] }],
    },
  ],
  invalid: [
    {
      code: `
class MyScript extends Thor {
  static {
    this.desc("zoo", "zoo around");
    this.methodAdded("zoo");
  }
  zoo() {}
  animal() {}
}`,
      output: `
class MyScript extends Thor {
  static {
    this.desc("zoo", "zoo around");
    this.methodAdded("zoo");
    this.methodAdded("animal");
  }
  zoo() {}
  animal() {}
}`,
      errors: [unregistered("animal")],
    },
    {
      code: `
class MyGroup extends Thor.Group {
  one() {}
}`,
      output: `
class MyGroup extends Thor.Group {
  static {
    this.methodAdded("one");
  }
  one() {}
}`,
      errors: [unregistered("one")],
    },
    {
      code: `
class MyScript extends Thor {
  static {}
  zoo() {}
}`,
      output: `
class MyScript extends Thor {
  static {
    this.methodAdded("zoo");
  }
  zoo() {}
}`,
      errors: [unregistered("zoo")],
    },
    {
      code: `
class Parent extends Thor {
  static {
    this.methodAdded("zoo");
  }
  zoo() {}
}
class Child extends Parent {
  static {
    this.noCommands(() => this.methodAdded("helper"));
  }
  helper() {}
  animal() {}
}`,
      output: `
class Parent extends Thor {
  static {
    this.methodAdded("zoo");
  }
  zoo() {}
}
class Child extends Parent {
  static {
    this.noCommands(() => this.methodAdded("helper"));
    this.methodAdded("animal");
  }
  helper() {}
  animal() {}
}`,
      errors: [unregistered("animal")],
    },
    {
      code: `
const command = class extends Thor {
  my_action() {}
} as unknown as ThorClass;
const child = class extends command {
  other() {}
};`,
      output: `
const command = class extends Thor {
  static {
    this.methodAdded("my_action");
  }
  my_action() {}
} as unknown as ThorClass;
const child = class extends command {
  static {
    this.methodAdded("other");
  }
  other() {}
};`,
      errors: [unregistered("my_action"), unregistered("other")],
    },
    {
      code: `
class MyScript extends Thor {
  first() {}
  second() {}
}`,
      output: `
class MyScript extends Thor {
  static {
    this.methodAdded("first");
  }
  first() {}
  second() {}
}`,
      errors: [unregistered("first"), unregistered("second")],
    },
    {
      code: `
class Child extends Parent {
  animal() {}
}
class Parent extends Thor {}`,
      output: `
class Child extends Parent {
  static {
    this.methodAdded("animal");
  }
  animal() {}
}
class Parent extends Thor {}`,
      errors: [unregistered("animal")],
    },
    {
      code: `
const Child = class extends Parent {
  animal() {}
};
class Parent extends Thor {}`,
      output: `
const Child = class extends Parent {
  static {
    this.methodAdded("animal");
  }
  animal() {}
};
class Parent extends Thor {}`,
      errors: [unregistered("animal")],
    },
    {
      code: `
class MyScript extends Thor {
  static {
    Other.methodAdded("zoo");
  }
  zoo(name: string): void;
  zoo(name: unknown) {}
}`,
      output: `
class MyScript extends Thor {
  static {
    Other.methodAdded("zoo");
    this.methodAdded("zoo");
  }
  zoo(name: string): void;
  zoo(name: unknown) {}
}`,
      errors: [unregistered("zoo")],
    },
    {
      code: `
class Generator extends NamedBase {
  createFile() {}
}`,
      output: `
class Generator extends NamedBase {
  static {
    this.methodAdded("createFile");
  }
  createFile() {}
}`,
      options: [{ baseClasses: ["NamedBase"] }],
      errors: [unregistered("createFile")],
    },
  ],
});

it("registers every missing method in definition order across fix passes", () => {
  const { output } = new Linter().verifyAndFix(
    "class MyScript extends Thor {\n  first() {}\n  second() {}\n  third() {}\n}",
    {
      plugins: { blazetrails: { rules: { "thor-command-registration": rule } } },
      rules: { "blazetrails/thor-command-registration": "error" },
    },
  );
  expect(output.match(/methodAdded\("(\w+)"\)/g)).toEqual([
    'methodAdded("first")',
    'methodAdded("second")',
    'methodAdded("third")',
  ]);
});
