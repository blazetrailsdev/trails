import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { Parameters } from "../../metal/strong-parameters.js";

describe("ParametersSerializationTest", () => {
  let oldPermittedParameters: boolean;

  beforeEach(() => {
    oldPermittedParameters = Parameters.permitAllParameters;
    Parameters.permitAllParameters = false;
  });

  afterEach(() => {
    Parameters.permitAllParameters = oldPermittedParameters;
  });

  // BLOCKED: psych-dump-puts-root-tag-on-its-own-line
  // BLOCKED: parameters-holds-a-plain-object-not-hash-with-indifferent-access
  it.skip("YAML serialization", () => {
    const params = new Parameters({ key: ":value" });
    const yamlDump = YAML.dump(params);
    expect(yamlDump).toMatch("--- !ruby/object:ActionController::Parameters");
    expect(yamlDump).toMatch(
      /parameters: !ruby\/hash:ActiveSupport::HashWithIndifferentAccess\n\s+key: :value/,
    );
    expect(yamlDump).toMatch("permitted: false");
  });

  it("YAML deserialization", () => {
    const params = new Parameters({ key: ":value" });
    const payload = YAML.dump(params);
    const roundtripped = YAML.unsafeLoad(payload) as Parameters;

    expect(roundtripped.equals(params)).toBe(true);
    expect(roundtripped.permitted).toBe(false);
  });

  it("YAML backwardscompatible with psych 2.0.8 format", () => {
    const payload = `--- !ruby/hash:ActionController::Parameters
key: :value
`;
    const params = YAML.unsafeLoad(payload) as Parameters;

    expect(params.get("key")).toEqual(":value");
    expect(params.permitted).toBe(false);
  });

  it("YAML backwardscompatible with psych 2.0.9+ format", () => {
    const payload = `--- !ruby/hash-with-ivars:ActionController::Parameters
elements:
  key: :value
ivars:
  :@permitted: false
`;
    const params = YAML.unsafeLoad(payload) as Parameters;

    expect(params.get("key")).toEqual(":value");
    expect(params.permitted).toBe(false);
  });
});
