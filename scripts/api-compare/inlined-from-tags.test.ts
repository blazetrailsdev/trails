import { describe, it, expect } from "vitest";
import ts from "typescript-5";
import { inlinedFromIn, TAG } from "./inlined-from-tags.js";
import { extractClass } from "./extract-ts-api.js";

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

describe("the TS extractor records @inlinedFrom on a constructor", () => {
  function members(source: string) {
    const host: ts.CompilerHost = {
      getSourceFile: (name) =>
        name === "m.ts"
          ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
          : undefined,
      getDefaultLibFileName: () => "lib.d.ts",
      writeFile: () => undefined,
      getCurrentDirectory: () => "/",
      getCanonicalFileName: (n) => n,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      fileExists: (name) => name === "m.ts",
      readFile: (name) => (name === "m.ts" ? source : undefined),
    };
    const program = ts.createProgram(["m.ts"], { noLib: true, noResolve: true }, host);
    const node = program.getSourceFile("m.ts")!.statements[0] as ts.ClassDeclaration;
    return extractClass(node, program.getTypeChecker(), "m.ts")!.instanceMethods;
  }

  it("registers the one-line form", () => {
    const [ctor] = members(`class Model {\n  /** ${TAG} ${API} */\n  constructor() {}\n}`);
    expect(ctor.inlinedFrom?.map((t) => `${t.module}#${t.hook}`)).toEqual([
      "ActiveModel::API#initialize",
    ]);
  });

  it("registers the multi-line form, in chain order", () => {
    const [ctor] = members(
      `class Base {\n  /**\n   * ${TAG} ${CORE}\n   * ${TAG} ${API}\n   */\n  constructor() {}\n}`,
    );
    expect(ctor.inlinedFrom?.map((t) => [t.module, t.firstLine, t.lastLine])).toEqual([
      ["ActiveRecord::Core", 471, 482],
      ["ActiveModel::API", 80, 84],
    ]);
  });

  it("records nothing on an untagged constructor or a tagged method", () => {
    const got = members(
      `class Model {\n  constructor() {}\n  /** ${TAG} ${API} */\n  save() {}\n}`,
    );
    expect(got.map((m) => m.inlinedFrom)).toEqual([undefined, undefined]);
  });
});
