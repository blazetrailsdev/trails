import { RuleTester } from "eslint";
import rule from "./no-freeform-comments.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("no-freeform-comments", rule, {
  valid: [
    // JSDoc is where every port convention lives.
    { code: `/** Mirrors: ActiveRecord::Relation#where. */\nexport function where() {}\n` },
    { code: `/**\n * @internal\n */\nconst x = 1;\n` },
    // A tagless JSDoc documenting a declaration is still JSDoc. Ordinary API
    // documentation looks exactly like this and is untouched; what closes the
    // reformat-to-`/** */` bypass is position, not content — see the
    // "JSDoc must document something" block below.
    { code: `/** The engine every manager compiles against. */\nexport const engine = 1;\n` },
    // Rails citations, in every spelling the packages actually use.
    { code: `// query_methods.rb:1604\nconst x = 1;\n` },
    {
      code: `// Mirrors Rails: \`Nodes::Extract.new [self], field\` (expressions.rb).\nconst x = 1;\n`,
    },
    { code: `// ActiveRecord::Base does this in two passes.\nconst x = 1;\n` },
    { code: `// Ruby's \`nil\` is falsy; JS \`0\` is not.\nconst x = 1;\n` },
    // Tool directives change behaviour when deleted.
    { code: `// eslint-disable-next-line no-unused-vars\nconst x = 1;\n` },
    { code: `// @ts-expect-error deliberate\nconst x = 1;\n` },
    { code: `// prettier-ignore\nconst x = 1;\n` },
    // One line of a wrapped block carrying the citation keeps the whole block.
    {
      code: `// The visitor dispatches on node class, not on arity, because\n// visitors.rb:41 does the same.\nconst x = 1;\n`,
    },
  ],
  invalid: [
    // There is no opt-out marker. `keep:` was the rule's escape hatch and was
    // removed unused — a comment now earns JSDoc or a citation, or it goes.
    {
      code: `// keep: the ordering here is load-bearing for the pool.\nconst x = 1;\n`,
      output: `const x = 1;\n`,
      errors: [{ messageId: "freeform" }],
    },
    // A standalone comment takes its whole line with it.
    {
      code: `// this adds two numbers\nconst x = 1 + 1;\n`,
      output: `const x = 1 + 1;\n`,
      errors: [{ messageId: "freeform" }],
    },
    // A trailing comment keeps the code and loses the preceding space.
    {
      code: `const x = 1; // obvious\n`,
      output: `const x = 1;\n`,
      errors: [{ messageId: "freeform" }],
    },
    // A non-JSDoc block comment is free-form.
    {
      code: `/* just a note */\nconst x = 1;\n`,
      output: `const x = 1;\n`,
      errors: [{ messageId: "freeform" }],
    },
    // A wrapped run with no citation anywhere is one report, deleted whole.
    {
      code: `// first line of narration\n// second line of narration\nconst x = 1;\n`,
      output: `const x = 1;\n`,
      errors: [{ messageId: "freeform" }],
    },
    // Indentation is consumed too, so no blank-ish line is left behind.
    {
      code: `function f() {\n  // narration\n  return 1;\n}\n`,
      output: `function f() {\n  return 1;\n}\n`,
      errors: [{ messageId: "freeform" }],
    },
    // Two separated comments are two reports, not one.
    {
      code: `// one\nconst x = 1;\n// two\nconst y = 2;\n`,
      output: `const x = 1;\nconst y = 2;\n`,
      errors: [{ messageId: "freeform" }, { messageId: "freeform" }],
    },
    // Section banners carry no information the code does not.
    {
      code: `// ---------------------------------------------------------------\n// Statements\n// ---------------------------------------------------------------\nconst x = 1;\n`,
      output: `const x = 1;\n`,
      errors: [{ messageId: "freeform" }],
    },
  ],
});

// Audit mode reports without fixing, so a survey run cannot mutate the tree.
tester.run("no-freeform-comments (report mode)", rule, {
  valid: [],
  invalid: [
    {
      code: `// narration\nconst x = 1;\n`,
      options: [{ report: true }],
      output: null,
      errors: [{ messageId: "freeform" }],
    },
  ],
});

// `boundary:` / `@boundary-file:` are directives this repo's own
// `no-native-date` rule reads, so deleting one reds that rule rather than
// merely losing a note. They are accepted anywhere in the comment because
// `no-native-date` accepts them mid-line.
tester.run("no-freeform-comments (boundary directives)", rule, {
  valid: [
    { code: `// boundary: the JS Date is matched only to refuse it, per #939\nconst x = 1;\n` },
    { code: `// @boundary-file: adapter marshalling\nconst x = 1;\n` },
    { code: `const x = 1; /* boundary: */\n` },
  ],
  invalid: [],
});

// `@nie disposition=` is required on every `throw new NotImplementedError(...)`
// by `nie-requires-annotation`, so deleting one reds that rule.
tester.run("no-freeform-comments (nie disposition directives)", rule, {
  valid: [
    { code: `// @nie disposition=TODO\nconst x = 1;\n` },
    { code: `// @nie disposition=port-real rails=relation.rb:12 cluster=foo\nconst x = 1;\n` },
  ],
  invalid: [],
});

// Rails' OWN comments go too. The Ruby is vendored at `vendor/rails/` and the
// ported file cites it, so copying its annotations across duplicates them into
// a second place that rots the moment Rails edits them. A comment that names
// the Ruby is a pointer and survives (rule 2); a comment that restates it does
// not.
tester.run("no-freeform-comments (Rails' own comments are not privileged)", rule, {
  valid: [
    // A pointer to the Ruby, which is what replaces copying the comment.
    { code: `// Mirrors arel/nodes/window.rb:15\nconst x = 1;\n` },
  ],
  invalid: [
    // arel/nodes/window.rb:15, carried across verbatim by the port.
    {
      code: `// FIXME: We SHOULD NOT be converting these to SqlLiteral automatically\nconst x = 1;\n`,
      output: `const x = 1;\n`,
      errors: [{ messageId: "freeform" }],
    },
    // activemodel/lib/active_model/locale/en.yml:3
    {
      code: `// The default format to use in full error messages.\nconst x = 1;\n`,
      output: `const x = 1;\n`,
      errors: [{ messageId: "freeform" }],
    },
  ],
});

// Keep-rule 1 is positional: a JSDoc block is kept where it DOCUMENTS
// something, and deleted where it documents nothing. That is what stops a
// doomed `//` comment from buying a pass by being reformatted to `/** */`,
// without touching the 94 pre-existing tagless API-doc blocks in arel and
// activemodel — every one of which sits on a declaration.
tester.run("no-freeform-comments (JSDoc must document something)", rule, {
  valid: [
    // Declarations, in the spellings the packages actually use.
    { code: `/** The engine. */\nfunction f() {}\n` },
    { code: `/** The engine. */\nclass C {}\n` },
    { code: `/** A row. */\ntype Row = { id: number };\n` },
    { code: `/** A row. */\ninterface Row {\n  /** Its key. */\n  id: number;\n}\n` },
    { code: `/** Set the FROM table. */\nexport function from() {}\n` },
    // Class and object members.
    {
      code: `class C {\n  /** Add GROUP BY. */\n  group() {}\n  /** The engine. */\n  engine = 1;\n}\n`,
    },
    { code: `const o = {\n  /** Wrap as EXISTS(subquery). */\n  exists: 1,\n};\n` },
    // A parameter, which JSDoc documents in place as often as by `@param`.
    { code: `function f(\n  /** The engine. */\n  engine: number,\n) {\n  return engine;\n}\n` },
    // A definition-shaped statement, at top level or nested: the
    // `describe(...)` file headers the packages already carry, the `it(...)`
    // headers inside them, and an assignment that names what it assigns (the
    // repo's `Model.aliasAttribute = aliasAttribute` mixin idiom). Being
    // top-level is NOT what earns the keep — see the bare-statement case in
    // `invalid`.
    { code: `/** What this file covers. */\ndescribe("Relation", () => {});\n` },
    { code: `/** Convenience factory. */\ntaggedLogging.logger = function () {};\n` },
    {
      code: `/** Mixed in from attribute-methods.ts. */\nModel.aliasAttribute = aliasAttribute;\n`,
    },
    {
      code: `describe("Relation", () => {\n  /** Why this asserts the property and not the boot baseline. */\n  it("fingerprints deterministically", () => {});\n});\n`,
    },
    // A tag or a Rails reference keeps a block wherever it sits — the tags are
    // the port's own conventions and tooling reads several of them.
    { code: `function f() {\n  /**\n   * @internal\n   */\n  return 1;\n}\n` },
    { code: `function f() {\n  /** Mirrors: query_methods.rb:1604. */\n  return 1;\n}\n` },
    // Every `include(...)` mixin-wiring note in the packages is of this shape:
    // it cites the Ruby include it mirrors, so rule 2 keeps it. `include(C, M)`
    // takes no function, so position alone would not — and should not, since
    // nothing distinguishes an uncited one from `registerFoo()` below.
    {
      code: `/** Mirrors attribute.rb:6-10, in Rails' include order. */\ninclude(Attribute, Expressions);\n`,
    },
    // A file with no statements has no documenting position to attach to, so
    // its comments are the whole file and are kept rather than erased.
    { code: `/** This file is intentionally empty. */\n` },
  ],
  invalid: [
    // The bypass itself: narration reformatted from `//` to `/** */`.
    {
      code: `function f() {\n  /** now we add the two numbers */\n  return 1 + 1;\n}\n`,
      output: `function f() {\n  return 1 + 1;\n}\n`,
      errors: [{ messageId: "floatingJsDoc" }],
    },
    // Module scope is not a documenting position either. A bare top-level
    // statement documents no more than one inside a body does, so exempting it
    // would reopen this bypass one scope up.
    {
      code: `/** now register the thing */\nregisterFoo();\n`,
      output: `registerFoo();\n`,
      errors: [{ messageId: "floatingJsDoc" }],
    },
    // Floating before a branch, before a bare call, and at the end of a block.
    {
      code: `function f(x) {\n  /** the guard below is load-bearing */\n  if (x) return 1;\n  return 2;\n}\n`,
      output: `function f(x) {\n  if (x) return 1;\n  return 2;\n}\n`,
      errors: [{ messageId: "floatingJsDoc" }],
    },
    {
      code: `function f(o) {\n  /** flush first */\n  o.flush();\n}\n`,
      output: `function f(o) {\n  o.flush();\n}\n`,
      errors: [{ messageId: "floatingJsDoc" }],
    },
    {
      code: `function f() {\n  return 1;\n  /** trailing narration */\n}\n`,
      output: `function f() {\n  return 1;\n}\n`,
      errors: [{ messageId: "floatingJsDoc" }],
    },
    // A non-JSDoc block in the same position is the plain free-form report.
    {
      code: `function f() {\n  /* now we add the two numbers */\n  return 1 + 1;\n}\n`,
      output: `function f() {\n  return 1 + 1;\n}\n`,
      errors: [{ messageId: "freeform" }],
    },
  ],
});
