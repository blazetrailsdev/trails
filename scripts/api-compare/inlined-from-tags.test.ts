import { describe, it, expect } from "vitest";
import { inlinedFromIn, TAG } from "./inlined-from-tags.js";

const API = "ActiveModel::API#initialize rails/v8.0.2/activemodel/lib/active_model/api.rb:80-84";
const CORE =
  "ActiveRecord::Core#initialize rails/v8.0.2/activerecord/lib/active_record/core.rb:471-482";

describe("inlinedFromIn", () => {
  it("reads the one-line form", () => {
    expect(inlinedFromIn(`/** ${TAG} ${API} */`)).toEqual([
      {
        module: "ActiveModel::API",
        hook: "initialize",
        source: "rails",
        version: "v8.0.2",
        file: "activemodel/lib/active_model/api.rb",
        firstLine: 80,
        lastLine: 84,
      },
    ]);
  });

  it("reads the multi-line form in written order, without sorting", () => {
    const tags = inlinedFromIn(`/**\n * @internal\n * ${TAG} ${CORE}\n * ${TAG} ${API}\n */`);
    expect(tags.map((t) => t.module)).toEqual(["ActiveRecord::Core", "ActiveModel::API"]);
  });

  it("reads `new` on a ClassMethods module", () => {
    const [tag] = inlinedFromIn(
      `/** ${TAG} ActiveRecord::Inheritance::ClassMethods#new rails/v8.0.2/activerecord/lib/active_record/inheritance.rb:56-78 */`,
    );
    expect([tag.module, tag.hook]).toEqual(["ActiveRecord::Inheritance::ClassMethods", "new"]);
  });

  it.each([
    ["a bare tag", `${TAG}`],
    [
      "a name that is not Module#initialize",
      `${TAG} ActiveModel::API#assign_attributes rails/v8.0.2/a.rb:1-2`,
    ],
    ["a lowercase module", `${TAG} api#initialize rails/v8.0.2/a.rb:1-2`],
    [
      "`new` off a ClassMethods module",
      `${TAG} ActiveRecord::Inheritance#new rails/v8.0.2/a.rb:1-2`,
    ],
    ["no citation", `${TAG} ActiveModel::API#initialize`],
    [
      "a citation spelling vendor/",
      `${TAG} ActiveModel::API#initialize vendor/rails/v8.0.2/a.rb:1-2`,
    ],
    ["a citation with one line", `${TAG} ActiveModel::API#initialize rails/v8.0.2/a.rb:80`],
    ["a backwards span", `${TAG} ActiveModel::API#initialize rails/v8.0.2/a.rb:84-80`],
    ["trailing prose", `${TAG} ${API} — PERMANENT`],
  ])("surfaces %s as malformed", (_what, line) => {
    expect(() => inlinedFromIn(`/**\n * ${line}\n */`, { fileName: "m.ts", startLine: 7 })).toThrow(
      /@inlinedFrom is malformed: m\.ts:8/,
    );
  });
});
