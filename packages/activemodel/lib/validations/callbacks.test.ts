import { kernelThrow } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { assertEmpty, include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Callbacks as ValidationsCallbacks } from "./callbacks.js";

class Dog extends Model {
  declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
  declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];

  static {
    include(this, ValidationsCallbacks);
  }

  name: string | null = null;
  history: string[] = [];
}

class DogWithMethodCallbacks extends Dog {
  static {
    this.beforeValidation(":setBeforeValidationMarker");
    this.afterValidation(":setAfterValidationMarker");
  }

  setBeforeValidationMarker(): void {
    this.history.push("before_validation_marker");
  }
  setAfterValidationMarker(): void {
    this.history.push("after_validation_marker");
  }
}

class DogValidatorsAreProc extends Dog {
  static {
    this.beforeValidation((d: Dog) => d.history.push("before_validation_marker"));
    this.afterValidation((d: Dog) => d.history.push("after_validation_marker"));
  }
}

class DogWithTwoValidators extends Dog {
  static {
    this.beforeValidation((d: Dog) => d.history.push("before_validation_marker1"));
    this.beforeValidation((d: Dog) => d.history.push("before_validation_marker2"));
  }
}

class DogBeforeValidatorReturningFalse extends Dog {
  static {
    this.beforeValidation(() => false);
    this.beforeValidation((d: Dog) => d.history.push("before_validation_marker2"));
  }
}

class DogBeforeValidatorThrowingAbort extends Dog {
  static {
    this.beforeValidation(() => kernelThrow(":abort"));
    this.beforeValidation((d: Dog) => d.history.push("before_validation_marker2"));
  }
}

class DogAfterValidatorReturningFalse extends Dog {
  static {
    this.afterValidation(() => false);
    this.afterValidation((d: Dog) => d.history.push("after_validation_marker"));
  }
}

class DogWithMissingName extends Dog {
  static {
    this.beforeValidation((d: Dog) => d.history.push("before_validation_marker"));
    this.validatesPresenceOf("name");
  }
}

class DogValidatorWithOnCondition extends Dog {
  static {
    this.beforeValidation(":setBeforeValidationMarker", { on: "create" });
    this.afterValidation(":setAfterValidationMarker", { on: "create" });
  }

  setBeforeValidationMarker(): void {
    this.history.push("before_validation_marker");
  }
  setAfterValidationMarker(): void {
    this.history.push("after_validation_marker");
  }
}

class DogValidatorWithOnMultipleCondition extends Dog {
  static {
    this.beforeValidation(":setBeforeValidationMarkerOnContextA", { on: "context_a" });
    this.beforeValidation(":setBeforeValidationMarkerOnContextB", { on: "context_b" });
    this.afterValidation(":setAfterValidationMarkerOnContextA", { on: "context_a" });
    this.afterValidation(":setAfterValidationMarkerOnContextB", { on: "context_b" });
  }

  setBeforeValidationMarkerOnContextA(): void {
    this.history.push("before_validation_marker on context_a");
  }
  setBeforeValidationMarkerOnContextB(): void {
    this.history.push("before_validation_marker on context_b");
  }
  setAfterValidationMarkerOnContextA(): void {
    this.history.push("after_validation_marker on context_a");
  }
  setAfterValidationMarkerOnContextB(): void {
    this.history.push("after_validation_marker on context_b");
  }
}

class DogValidatorWithIfCondition extends Dog {
  static {
    this.beforeValidation(":setBeforeValidationMarker1", { if: () => true });
    this.beforeValidation(":setBeforeValidationMarker2", { if: () => false });

    this.afterValidation(":setAfterValidationMarker1", { if: () => true });
    this.afterValidation(":setAfterValidationMarker2", { if: () => false });
  }

  setBeforeValidationMarker1(): void {
    this.history.push("before_validation_marker1");
  }
  setBeforeValidationMarker2(): void {
    this.history.push("before_validation_marker2");
  }

  setAfterValidationMarker1(): void {
    this.history.push("after_validation_marker1");
  }
  setAfterValidationMarker2(): void {
    this.history.push("after_validation_marker2");
  }
}

describe("CallbacksWithMethodNamesShouldBeCalled", () => {
  it("if condition is respected for before validation", async () => {
    const d = new DogValidatorWithIfCondition();
    await d.isValid();
    expect(d.history).toEqual(["before_validation_marker1", "after_validation_marker1"]);
  });

  it("on condition is respected for validation with matching context", async () => {
    const d = new DogValidatorWithOnCondition();
    await d.isValid("create");
    expect(d.history).toEqual(["before_validation_marker", "after_validation_marker"]);
  });

  it("on condition is respected for validation without matching context", async () => {
    const d = new DogValidatorWithOnCondition();
    await d.isValid("save");
    expect(d.history).toEqual([]);
  });

  it("on condition is respected for validation without context", async () => {
    const d = new DogValidatorWithOnCondition();
    await d.isValid();
    expect(d.history).toEqual([]);
  });

  it("on multiple condition is respected for validation with matching context", async () => {
    let d = new DogValidatorWithOnMultipleCondition();
    await d.isValid("context_a");
    expect(d.history).toEqual([
      "before_validation_marker on context_a",
      "after_validation_marker on context_a",
    ]);

    d = new DogValidatorWithOnMultipleCondition();
    await d.isValid("context_b");
    expect(d.history).toEqual([
      "before_validation_marker on context_b",
      "after_validation_marker on context_b",
    ]);

    d = new DogValidatorWithOnMultipleCondition();
    await d.isValid(["context_a", "context_b"]);
    expect(d.history).toEqual([
      "before_validation_marker on context_a",
      "before_validation_marker on context_b",
      "after_validation_marker on context_a",
      "after_validation_marker on context_b",
    ]);
  });

  it("on multiple condition is respected for validation without matching context", async () => {
    const d = new DogValidatorWithOnMultipleCondition();
    await d.isValid("save");
    expect(d.history).toEqual([]);
  });

  it("on multiple condition is respected for validation without context", async () => {
    const d = new DogValidatorWithOnMultipleCondition();
    await d.isValid();
    expect(d.history).toEqual([]);
  });

  it("before validation and after validation callbacks should be called", async () => {
    const d = new DogWithMethodCallbacks();
    await d.isValid();
    expect(d.history).toEqual(["before_validation_marker", "after_validation_marker"]);
  });

  it("before validation and after validation callbacks should be called with proc", async () => {
    const d = new DogValidatorsAreProc();
    await d.isValid();
    expect(d.history).toEqual(["before_validation_marker", "after_validation_marker"]);
  });

  it("before validation and after validation callbacks should be called in declared order", async () => {
    const d = new DogWithTwoValidators();
    await d.isValid();
    expect(d.history).toEqual(["before_validation_marker1", "before_validation_marker2"]);
  });

  it("further callbacks should not be called if before validation throws abort", async () => {
    const d = new DogBeforeValidatorThrowingAbort();
    const output = await d.isValid();
    expect(d.history).toEqual([]);
    expect(output).toEqual(false);
  });

  it("further callbacks should be called if before validation returns false", async () => {
    const d = new DogBeforeValidatorReturningFalse();
    const output = await d.isValid();
    expect(d.history).toEqual(["before_validation_marker2"]);
    expect(output).toEqual(true);
  });

  it("further callbacks should be called if after validation returns false", async () => {
    const d = new DogAfterValidatorReturningFalse();
    await d.isValid();
    expect(d.history).toEqual(["after_validation_marker"]);
  });

  it("validation test should be done", async () => {
    const d = new DogWithMissingName();
    const output = await d.isValid();
    expect(d.history).toEqual(["before_validation_marker"]);
    expect(output).toEqual(false);
  });

  it("before validation does not mutate the if options array", () => {
    const opts: Array<() => boolean> = [];

    void class extends Dog {
      static {
        this.beforeValidation(() => {}, { if: opts, on: "create" });
      }
    };

    assertEmpty(opts);
  });

  it("after validation does not mutate the if options array", () => {
    const opts: Array<() => boolean> = [];

    void class extends Dog {
      static {
        this.afterValidation(() => {}, { if: opts, on: "create" });
      }
    };

    assertEmpty(opts);
  });
});
