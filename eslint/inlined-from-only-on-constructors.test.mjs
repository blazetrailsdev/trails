import { RuleTester } from "eslint";
import rule from "./inlined-from-only-on-constructors.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

const API = "ActiveModel::API#initialize rails/v8.0.2/activemodel/lib/active_model/api.rb:80-84";
const NEW =
  "ActiveRecord::Inheritance::ClassMethods#new rails/v8.0.2/activerecord/lib/active_record/inheritance.rb:56-78";
const BASE = "/repo/packages/activerecord/src/base.ts";

const onConstructor = (...tags) =>
  `class Base {\n  /**\n${tags.map((tag) => `   * @inlinedFrom ${tag}\n`).join("")}   */\n  constructor() {}\n}\n`;

tester.run("inlined-from-only-on-constructors", rule, {
  valid: [
    { code: onConstructor(API), filename: BASE },
    { code: onConstructor(NEW, API), filename: BASE },
    {
      code: `class Base {\n  /** @inlinedFrom ${API} */\n  private constructor(attributes: unknown);\n  constructor(attributes?: unknown) {}\n}\n`,
      filename: BASE,
    },
    { code: `/** Reads what @inlinedFrom names. */\nfunction inlinedFromTags() {}\n` },
    {
      code: onConstructor(
        "ActiveRecord::Core#initialize rails/v8.0.2/activerecord/lib/active_record/core.rb:471-482",
      ),
      filename: "/repo/packages/activemodel/src/core.ts",
    },
  ],
  invalid: [
    {
      code: `class Base {\n  /** @inlinedFrom ${API} */\n  initialize() {}\n}\n`,
      errors: [{ messageId: "notConstructor" }],
    },
    {
      code: `/** @inlinedFrom ${API} */\nexport function initialize() {}\n`,
      errors: [{ messageId: "notConstructor" }],
    },
    {
      code: `/** @inlinedFrom ${API} */\nclass Base {\n  constructor() {}\n}\n`,
      errors: [{ messageId: "notConstructor" }],
    },
    {
      code: onConstructor(
        "ActiveModel::API#assign_attributes rails/v8.0.2/activemodel/lib/active_model/api.rb:80-84",
      ),
      filename: BASE,
      errors: [{ messageId: "notOnList" }],
    },
    {
      code: onConstructor(
        "ActiveSupport::TimeZone#new rails/v8.0.2/activesupport/lib/active_support/values/time_zone.rb:216-218",
      ),
      filename: BASE,
      errors: [{ messageId: "notOnList" }],
    },
    {
      code: onConstructor(
        "ActiveSupport::TimeZone.new rails/v8.0.2/activesupport/lib/active_support/values/time_zone.rb:216-218",
      ),
      filename: BASE,
      errors: [{ messageId: "notOnList" }],
    },
    {
      code: onConstructor("ActiveModel::API#initialize"),
      filename: BASE,
      errors: [{ messageId: "malformedCitation" }],
    },
    {
      code: onConstructor(
        "ActiveModel::API#initialize vendor/rails/v8.0.2/activemodel/lib/active_model/api.rb:80-84",
      ),
      filename: BASE,
      errors: [{ messageId: "malformedCitation" }],
    },
    {
      code: onConstructor(
        "ActiveModel::API#initialize rails/v8.0.2/activemodel/lib/active_model/api.rb:80",
      ),
      filename: BASE,
      errors: [{ messageId: "malformedCitation" }],
    },
    {
      code: onConstructor(`${API} — assigns the attributes`),
      filename: BASE,
      errors: [{ messageId: "trailingProse" }],
    },
    {
      code: onConstructor(API),
      filename: "/repo/packages/activemodel/src/api.ts",
      errors: [{ messageId: "redundant" }],
    },
    {
      code: onConstructor(
        "ActionController::Metal#initialize rails/v8.0.2/actionpack/lib/action_controller/metal.rb:210-222",
      ),
      filename: "/repo/packages/actionpack/src/action-controller/metal.ts",
      errors: [{ messageId: "redundant" }],
    },
    {
      code: onConstructor(NEW, "ActiveModel::API.new"),
      filename: BASE,
      errors: [{ messageId: "notOnList" }],
    },
  ],
});
