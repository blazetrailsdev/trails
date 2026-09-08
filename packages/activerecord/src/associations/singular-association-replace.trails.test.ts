import { describe, it, expect } from "vitest";
import { NotImplementedError } from "@blazetrails/ruby-compat";
import { SingularAssociation } from "./singular-association.js";

describe("SingularAssociation#replace", () => {
  it("raises NotImplementedError so subclasses must implement it", () => {
    const association = Object.create(SingularAssociation.prototype) as {
      replace(record: null): void;
    };

    expect(() => association.replace(null)).toThrow(
      new NotImplementedError("Subclasses must implement a replace(record) method"),
    );
  });
});
