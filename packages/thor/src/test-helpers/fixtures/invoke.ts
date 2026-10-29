import { include, puts, rbInspect, stdout as $stdout, toS } from "@blazetrails/ruby-compat";
import { Actions } from "../../actions.js";
import type { Base } from "../../base.js";
import { Group, type GroupClass } from "../../group.js";
import type { Invocation } from "../../invocation.js";
import type { Shell } from "../../shell.js";
import { Thor, type ThorClass } from "../../thor.js";

function p(obj: unknown): void {
  puts.call($stdout, rbInspect(obj));
}

export class A extends Thor {
  static {
    include(this, Actions);
    const klass = this as unknown as ThorClass;

    klass.desc("one", "invoke one");
    (this as unknown as ThorClass).methodAdded("one");

    klass.desc("two", "invoke two");
    (this as unknown as ThorClass).methodAdded("two");

    klass.desc("three", "invoke three");
    (this as unknown as ThorClass).methodAdded("three");

    klass.desc("four", "invoke four");
    (this as unknown as ThorClass).methodAdded("four");

    klass.desc("five N", "check if number is equal 5");
    (this as unknown as ThorClass).methodAdded("five");

    klass.desc("invoker", "invoke a b command");
    (this as unknown as ThorClass).methodAdded("invoker");
  }

  async one() {
    p(1);
    await (this as unknown as Invocation).invoke("two");
    await (this as unknown as Invocation).invoke("three");
  }

  async two() {
    p(2);
    await (this as unknown as Invocation).invoke("three");
  }

  three() {
    p(3);
  }

  async four() {
    p(4);
    await (this as unknown as Invocation).invoke("defined:five");
  }

  five(number: unknown): boolean {
    return number == 5;
  }

  invoker(..._args: unknown[]) {
    return (this as unknown as Invocation).invoke("b", "one", ["Jose"]);
  }
}

export class B extends Thor {
  declare options: Base["options"];

  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("last_name", { type: "string" });

    klass.desc("one FIRST_NAME", "invoke one");
    (this as unknown as ThorClass).methodAdded("one");

    klass.desc("two", "invoke two");
    (this as unknown as ThorClass).methodAdded("two");

    klass.desc("three", "invoke three");
    (this as unknown as ThorClass).methodAdded("three");

    klass.desc("four", "invoke four");
    klass.option("defaulted_value", { type: "string", default: "default" });
    (this as unknown as ThorClass).methodAdded("four");
  }

  one(firstName: unknown): string {
    return `${toS(this.options.last_name)}, ${toS(firstName)}`;
  }

  two(): unknown {
    return this.options;
  }

  three(): this {
    return this;
  }

  four(): unknown {
    return this.options.defaulted_value;
  }
}

export class C extends Group {
  static {
    include(this, Actions);
    (this as unknown as ThorClass).methodAdded("one");
    (this as unknown as ThorClass).methodAdded("two");
    (this as unknown as ThorClass).methodAdded("three");
  }

  one() {
    p(1);
  }

  two() {
    p(2);
  }

  three() {
    p(3);
  }
}

export class Defined extends Group {
  static {
    const klass = this as unknown as GroupClass;
    klass.classOption("unused", { type: "boolean", desc: "This option has no use" });
    (this as unknown as ThorClass).methodAdded("one");
    (this as unknown as ThorClass).methodAdded("five");
    (this as unknown as ThorClass).methodAdded("print_status");
  }

  async one() {
    p(1);
    const self = this as unknown as Invocation;
    await self.invoke("a:two");
    await self.invoke("a:three");
    await self.invoke("a:four");
    await self.invoke("defined:five");
  }

  five() {
    p(5);
  }

  print_status() {
    (this as unknown as Shell).sayStatus("finished", "counting");
  }
}

export class E extends Group {
  static {
    (this as unknown as GroupClass).invoke(Defined);
  }
}

export class F extends Group {
  static {
    (this as unknown as GroupClass).invoke(
      "b:one",
      (instance: Invocation, klass: unknown, command: unknown) =>
        instance.invoke(klass, command, ["Jose"], { last_name: "Valim" }),
    );
  }
}

export class G extends Group {
  static {
    const klass = this as unknown as GroupClass;
    klass.classOption("invoked", { type: "string", default: "defined" });
    klass.invokeFromOption("invoked");
  }
}

export class H extends Group {
  static {
    const klass = this as unknown as GroupClass;
    klass.classOption("defined", { type: "boolean", default: true });
    klass.invokeFromOption("defined");
  }
}

export class I extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("two", "Two");
    (this as unknown as ThorClass).methodAdded("two");
  }

  two(): unknown {
    return (this as unknown as Invocation).currentCommandChain();
  }
}

export class J extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("i", "I");
    klass.subcommand("one", I as unknown as ThorClass);
  }
}
