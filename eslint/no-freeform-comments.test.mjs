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
    // A tagless JSDoc documenting a declaration is still JSDoc. This is also
    // the rule's known limitation: it cannot tell this from narration that was
    // reformatted to `/** */` to dodge the fix. See the rule's own doc.
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
    // The escape hatch, and it is case-insensitive.
    { code: `// keep: the ordering here is load-bearing for the pool.\nconst x = 1;\n` },
    { code: `// KEEP: shouted, still kept.\nconst x = 1;\n` },
    // One line of a wrapped block carrying the citation keeps the whole block.
    {
      code: `// The visitor dispatches on node class, not on arity, because\n// visitors.rb:41 does the same.\nconst x = 1;\n`,
    },
  ],
  invalid: [
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
