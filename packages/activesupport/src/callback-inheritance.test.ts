import { include } from "@blazetrails/ruby-compat";
import type { Extended, Included } from "@blazetrails/ruby-compat/include";
import { beforeEach, describe, expect, it } from "vitest";
import { Callbacks } from "./callbacks.js";
import { assertNotPredicate, assertPredicate } from "./testing/assertions.js";

type ClassMethods = Extended<typeof Callbacks.ClassMethods>;
type RunCallbacks = Included<typeof Callbacks>["runCallbacks"];

class GrandParent {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare static skipCallback: ClassMethods["skipCallback"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  readonly log: string[];
  readonly actionName: string;

  constructor(actionName: string) {
    this.actionName = actionName;
    this.log = [];
  }

  static {
    this.defineCallbacks("dispatch");
    this.setCallback("dispatch", "before", ":before1", ":before2", {
      if: (c: GrandParent) => c.actionName === "index" || c.actionName === "update",
    });
    this.setCallback("dispatch", "after", ":after1", ":after2", {
      if: (c: GrandParent) => c.actionName === "update" || c.actionName === "delete",
    });
  }

  before1(): void {
    this.log.push("before1");
  }

  before2(): void {
    this.log.push("before2");
  }

  after1(): void {
    this.log.push("after1");
  }

  after2(): void {
    this.log.push("after2");
  }

  dispatch(): this {
    this.runCallbacks("dispatch", () => {
      this.log.push(this.actionName);
    });
    return this;
  }
}

class Parent extends GrandParent {
  static {
    this.skipCallback("dispatch", "before", ":before2", {
      unless: (c: GrandParent) => c.actionName === "update",
    });
    this.skipCallback("dispatch", "after", ":after2", {
      unless: (c: GrandParent) => c.actionName === "delete",
    });
  }
}

class Child extends GrandParent {
  static {
    this.skipCallback("dispatch", "before", ":before2", {
      unless: (c: GrandParent) => c.actionName === "update",
      if: ":isStateOpen",
    });
  }

  private state: string;

  isStateOpen(): boolean {
    return this.state === ":open";
  }

  constructor(actionName: string, state: string) {
    super(actionName);
    this.state = state;
  }
}

class EmptyParent {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  private performed?: boolean;

  isPerformed(): boolean {
    return (this.performed ||= false);
  }

  static {
    this.defineCallbacks("dispatch");
  }

  performBang(): void {
    this.performed = true;
  }

  dispatch(): this {
    this.runCallbacks("dispatch");
    return this;
  }
}

class EmptyChild extends EmptyParent {
  static {
    this.setCallback("dispatch", "before", ":doNothing");
  }

  doNothing(): void {}
}

class CountingParent {
  declare static defineCallbacks: ClassMethods["defineCallbacks"];
  declare static setCallback: ClassMethods["setCallback"];
  declare runCallbacks: RunCallbacks;

  static {
    include(this, Callbacks);
  }

  count: number;

  static {
    this.defineCallbacks("dispatch");
  }

  constructor() {
    this.count = 0;
  }

  countBang(): void {
    this.count += 1;
  }

  dispatch(): this {
    this.runCallbacks("dispatch");
    return this;
  }
}

class CountingChild extends CountingParent {}

describe("BasicCallbacksTest", () => {
  let index: GrandParent;
  let update: GrandParent;
  let del: GrandParent;

  beforeEach(() => {
    index = new GrandParent("index").dispatch();
    update = new GrandParent("update").dispatch();
    del = new GrandParent("delete").dispatch();
  });

  it("basic conditional callback1", () => {
    expect(index.log).toEqual(["before1", "before2", "index"]);
  });

  it("basic conditional callback2", () => {
    expect(update.log).toEqual(["before1", "before2", "update", "after2", "after1"]);
  });

  it("basic conditional callback3", () => {
    expect(del.log).toEqual(["delete", "after2", "after1"]);
  });
});

describe("InheritedCallbacksTest", () => {
  let index: Parent;
  let update: Parent;
  let del: Parent;

  beforeEach(() => {
    index = new Parent("index").dispatch();
    update = new Parent("update").dispatch();
    del = new Parent("delete").dispatch();
  });

  it("inherited excluded", () => {
    expect(index.log).toEqual(["before1", "index"]);
  });

  it("inherited not excluded", () => {
    expect(update.log).toEqual(["before1", "before2", "update", "after1"]);
  });

  it("partially excluded", () => {
    expect(del.log).toEqual(["delete", "after2", "after1"]);
  });
});

describe("InheritedCallbacksTest2", () => {
  let update1: Child;
  let update2: Child;

  beforeEach(() => {
    update1 = new Child("update", ":open").dispatch();
    update2 = new Child("update", ":closed").dispatch();
  });

  it("complex mix on", () => {
    expect(update1.log).toEqual(["before1", "update", "after2", "after1"]);
  });

  it("complex mix off", () => {
    expect(update2.log).toEqual(["before1", "before2", "update", "after2", "after1"]);
  });
});

describe("DynamicInheritedCallbacks", () => {
  it("callbacks looks to the superclass before running", () => {
    let child = new EmptyChild().dispatch();
    assertNotPredicate(child, (c) => c.isPerformed());
    EmptyParent.setCallback("dispatch", "before", ":performBang");
    child = new EmptyChild().dispatch();
    assertPredicate(child, (c) => c.isPerformed());
  });

  it("callbacks should be performed once in child class", () => {
    CountingParent.setCallback("dispatch", "before", function (this: CountingParent) {
      this.countBang();
    });
    const child = new CountingChild().dispatch();
    expect(child.count).toBe(1);
  });
});

describe("DynamicDefinedCallbacks", () => {
  it("callbacks should be performed once in child class after dynamic define", () => {
    GrandParent.defineCallbacks("foo");
    GrandParent.setCallback("foo", "before", ":before1");
    const parent = new Parent("foo");
    parent.runCallbacks("foo");
    expect(parent.log).toEqual(["before1"]);
  });
});
