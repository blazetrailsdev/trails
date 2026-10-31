import type { AssertionReceipt } from "../assertion-receipts.js";

export const rubyCompat: Record<string, AssertionReceipt[]> = {
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of a FalseClass":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_==",
        reason:
          "library/yaml/to_yaml_spec.rb:35 `should be_kind_of(FalseClass)` — a JS boolean has no FalseClass/TrueClass; the port asserts its typeof",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of a Float object":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_==",
        reason:
          "library/yaml/to_yaml_spec.rb:41 `should be_kind_of(Float)` — a JS number has no Float class; the port asserts its typeof",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of a NilClass object":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_be_nil",
        reason:
          "library/yaml/to_yaml_spec.rb:53 `should be_kind_of(NilClass)` — JS null has no NilClass; the port asserts toBeNull",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of a TrueClass":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_==",
        reason:
          "library/yaml/to_yaml_spec.rb:85 `should be_kind_of(TrueClass)` — a JS boolean has no FalseClass/TrueClass; the port asserts its typeof",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of an Integer object":
    [
      {
        kind: "should_be_kind_of",
        value: null,
        as: "should_==",
        reason:
          "library/yaml/to_yaml_spec.rb:47 `should be_kind_of(Integer)` — a JS number has no Integer class; the port asserts Number.isInteger",
      },
    ],
  "ruby-compat:library/yaml/to_yaml_spec.rb › Object#to_yaml › returns the YAML representation of numeric constants":
    [
      {
        kind: "should_match_yaml",
        value: null,
        as: null,
        reason:
          "library/yaml/to_yaml_spec.rb:105 `(0.0).to_yaml` is `--- 0.0` — `0.0` and `0` are one JS number, so no Float exists to dump with a fraction",
      },
    ],
};
