/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (lint_test.rb:9-10); the class/interface merge is how `include()` surfaces those members on the type side. */
import { beforeEach, describe, it } from "vitest";
import { extend, include } from "@blazetrails/activesupport";
import { Hash } from "@blazetrails/ruby-compat";
import { Conversion } from "./conversion.js";
import { Tests } from "./lint.js";
import { Naming } from "./naming.js";
import type { ModelName } from "./naming.js";

describe("LintTest", () => {
  interface CompliantModel extends Conversion, Naming {}

  class CompliantModel {
    declare static modelName: ModelName;

    static {
      extend(this, Naming);
      include(this, Conversion);
    }

    isPersisted(): boolean {
      return false;
    }

    get errors(): Hash<string, unknown[]> {
      return new Hash<string, unknown[]>([]);
    }
  }

  let model: CompliantModel;

  beforeEach(() => {
    model = new CompliantModel();
  });

  it("to key", () => {
    Tests.testToKey(model);
  });

  it("to param", () => {
    Tests.testToParam(model);
  });

  it("to partial path", () => {
    Tests.testToPartialPath(model);
  });

  it("persisted?", () => {
    Tests.testPersisted(model);
  });

  it("model naming", () => {
    Tests.testModelNaming(model);
  });

  it("errors aref", () => {
    Tests.testErrorsAref(model);
  });
});
