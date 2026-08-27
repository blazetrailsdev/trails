import { RuleTester } from "eslint";
import rule from "./no-freeform-comments.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

const prose = [{ messageId: "prose" }];
const freeform = [{ messageId: "freeform" }];

tester.run("no-freeform-comments", rule, {
  valid: [
    { code: `/** @internal */\nconst x = 1;\n` },
    { code: `/** @noRailsEquivalent PERMANENT */\nexport const x = 1;\n` },
    { code: `/** @noRailsEquivalent CONVERGEABLE */\nexport const x = 1;\n` },
    { code: `/** @missingRailsCall PERMANENT */\nconst x = 1;\n` },
    { code: `/** @missingRailsArgs CONVERGEABLE */\nconst x = 1;\n` },
    { code: `/**\n * @internal\n * @noRailsEquivalent PERMANENT\n */\nconst x = 1;\n` },
    // Tool directives change behaviour when deleted.
    { code: `// eslint-disable-next-line no-unused-vars\nconst x = 1;\n` },
    { code: `// @ts-expect-error deliberate\nconst x = 1;\n` },
    { code: `// prettier-ignore\nconst x = 1;\n` },
    { code: `// v8 ignore next\nconst x = 1;\n` },
    { code: `// boundary: legacy Date value\nconst x = 1;\n` },
    {
      code: `// @nie disposition=keep-as-strategy-hook rails=arel/visitors/to_sql.rb:194 cluster=arel-visitor-strategy\nconst x = 1;\n`,
    },
    // A file with no statements is all comment and is left alone.
    { code: `// a licence header, and nothing else\n` },
  ],
  invalid: [
    // Narration goes, with no opt-out marker.
    {
      code: `// keep: still narration\nconst x = 1;\n`,
      errors: freeform,
      output: `const x = 1;\n`,
    },
    {
      code: `// The visitor dispatches on node class, not on arity.\nconst x = 1;\n`,
      errors: freeform,
      output: `const x = 1;\n`,
    },
    // A contiguous run of `//` lines is one comment and goes whole.
    {
      code: `// The visitor dispatches on node class,\n// not on arity.\nconst x = 1;\n`,
      errors: freeform,
      output: `const x = 1;\n`,
    },
    // A trailing comment keeps its line of code.
    { code: `const x = 1; // the engine\n`, errors: freeform, output: `const x = 1;\n` },
  ],
});

// Rails citations were kept until 2026-08-27 on the theory that a pointer is
// not a sentence. They are now deleted like any other comment: the Ruby is
// vendored, and a line number rots the moment Rails edits the file above it.
tester.run("no-freeform-comments (Rails citations are not kept)", rule, {
  valid: [],
  invalid: [
    {
      code: `// query_methods.rb:1604\nconst x = 1;\n`,
      errors: freeform,
      output: `const x = 1;\n`,
    },
    {
      code: `/** Mirrors: ActiveRecord::Relation#where. */\nexport function where() {}\n`,
      errors: prose,
      output: `export function where() {}\n`,
    },
    {
      code: `// Mirrors Rails: \`Nodes::Extract.new [self], field\` (expressions.rb).\nconst x = 1;\n`,
      errors: freeform,
      output: `const x = 1;\n`,
    },
    {
      code: `// ActiveRecord::Base does this in two passes.\nconst x = 1;\n`,
      errors: freeform,
      output: `const x = 1;\n`,
    },
    {
      code: `// Ruby's \`nil\` is falsy; JS \`0\` is not.\nconst x = 1;\n`,
      errors: freeform,
      output: `const x = 1;\n`,
    },
    // A citation no longer rescues the sentence it was anchoring.
    {
      code: `// The visitor dispatches on node class, not on arity, because\n// visitors.rb:41 does the same.\nconst x = 1;\n`,
      errors: freeform,
      output: `const x = 1;\n`,
    },
  ],
});

// Position no longer confers a keep: a descriptive summary on a declaration is
// exactly the form the policy names, so JSDoc earns its place by carrying a
// flag or it goes.
tester.run("no-freeform-comments (descriptive JSDoc goes)", rule, {
  valid: [],
  invalid: [
    {
      code: `/** The engine every manager compiles against. */\nexport const engine = 1;\n`,
      errors: prose,
      output: `export const engine = 1;\n`,
    },
    { code: `/** Add GROUP BY. */\nfunction f() {}\n`, errors: prose, output: `function f() {}\n` },
    { code: `/** The engine. */\nclass C {}\n`, errors: prose, output: `class C {}\n` },
    {
      code: `class C {\n  /** The name. */\n  name = 1;\n}\n`,
      errors: prose,
      output: `class C {\n  name = 1;\n}\n`,
    },
  ],
});

// A tag document carries simple data or nothing. The English reason that used
// to follow a tag is prose in a tag's clothing, so the fix rewrites the block
// down to the tag and the permanence token the extractors switch on.
tester.run("no-freeform-comments (tag documents keep data, not prose)", rule, {
  valid: [],
  invalid: [
    {
      code: `/** Mirrors: X. @internal */\nconst x = 1;\n`,
      errors: prose,
      output: `/** @internal */\nconst x = 1;\n`,
    },
    {
      code: `/**\n * Sets the FROM table.\n *\n * @internal\n */\nconst x = 1;\n`,
      errors: prose,
      output: `/** @internal */\nconst x = 1;\n`,
    },
    {
      code: `/**\n * @noRailsEquivalent PERMANENT — Ruby's \`@connection\` is duck-typed, so\n * no Ruby file declares the shape.\n */\nconst x = 1;\n`,
      errors: prose,
      output: `/** @noRailsEquivalent PERMANENT */\nconst x = 1;\n`,
    },
    {
      code: `/**\n * @param a the first one\n * @returns the sum\n * @internal\n */\nconst x = 1;\n`,
      errors: prose,
      output: `/** @internal */\nconst x = 1;\n`,
    },
    {
      code: `/**\n * Prose.\n * @internal\n * @noRailsEquivalent CONVERGEABLE — a reason.\n */\nconst x = 1;\n`,
      errors: prose,
      output: `/**\n * @internal\n * @noRailsEquivalent CONVERGEABLE\n */\nconst x = 1;\n`,
    },
    // `@param` / `@returns` / `@example` carry English by construction and
    // nothing reads them, so a block of them alone goes entirely.
    {
      code: `/**\n * @param a the first one\n * @returns the sum\n */\nfunction f(a) {}\n`,
      errors: prose,
      output: `function f(a) {}\n`,
    },
  ],
});

// A directive comment is machine input and is left byte-identical, prose and
// all. Rewriting it is what turned `/* eslint-disable X -- why */` into
// `/** eslint-disable X */` on the first fix pass; the second pass no longer
// recognised that as a directive and deleted it, silently un-suppressing the
// rule it was holding off.
tester.run("no-freeform-comments (directive comments are untouched)", rule, {
  valid: [
    {
      code: `/* eslint-disable no-console --\n   Each model spells the include in its class body.\n   The empty merge beside it is how include() surfaces the members. */\nconst x = 1;\n`,
    },
    { code: `/* eslint-disable no-console */\nconst x = 1;\n` },
    { code: `/* eslint-enable no-console */\nconst x = 1;\n` },
    // Recognised even wearing a JSDoc `*` continuation, so a directive that
    // ever lands inside a block comment is never mistaken for prose.
    { code: `/**\n * eslint-disable no-console\n */\nconst x = 1;\n` },
    // A trailing directive keeps the prose that documents which rule it lifts.
    { code: `const x = 1; // eslint-disable-line no-console -- the CLI prints here\n` },
  ],
  invalid: [],
});

// `@empty` marks an intentionally-empty block. ESLint's `no-empty` ignores a
// block containing a comment, so an empty Rails arm stayed legal only because
// the sentence explaining it was there. `@empty` is that comment with the
// English removed, and any prose written beside it is stripped like any other.
tester.run("no-freeform-comments (@empty marks an intentionally-empty block)", rule, {
  valid: [
    { code: `if (a) {\n  /** @empty */\n}\n` },
    { code: `try {\n  f();\n} catch {\n  /** @empty */\n}\n` },
  ],
  invalid: [
    {
      code: `if (a) {\n  /** @empty — Rails takes no action on this arm. */\n}\n`,
      errors: prose,
      output: `if (a) {\n  /** @empty */\n}\n`,
    },
    // Without the marker an explanatory comment is prose and goes, which is
    // what empties the block.
    {
      code: `if (a) {\n  // Rails takes no action on this arm.\n}\n`,
      errors: freeform,
      output: `if (a) {\n}\n`,
    },
  ],
});

// A directive does not rescue the prose that happens to sit next to it. A
// contiguous run of `//` lines is grouped so a wrapped sentence is judged
// whole, but a directive line is its own comment: skipping the whole group on
// its account would keep every sentence written above an `eslint-disable`.
tester.run("no-freeform-comments (a directive does not rescue its neighbours)", rule, {
  valid: [],
  invalid: [
    {
      code: `// Rails' second failure terminal: no handler on the class.\n// eslint-disable-next-line no-console\nconsole.log(1);\n`,
      errors: freeform,
      output: `// eslint-disable-next-line no-console\nconsole.log(1);\n`,
    },
    {
      code: `// eslint-disable-next-line no-console\nconsole.log(1);\n// Trailing narration.\nconst x = 1;\n`,
      errors: freeform,
      output: `// eslint-disable-next-line no-console\nconsole.log(1);\nconst x = 1;\n`,
    },
  ],
});

// `@deprecated` is required by `blazetrails/rails-deprecated-jsdoc` wherever
// Rails deprecates the member. Stripping it set the two rules fighting — one
// deleting the tag, the other re-adding it — which ESLint reports as a
// circular fix and which leaves the file in whichever state the last pass won.
tester.run("no-freeform-comments (@deprecated survives)", rule, {
  valid: [{ code: `/** @deprecated */\nexport function unsignedFloat() {}\n` }],
  invalid: [
    {
      code: `/** Deprecated in Rails 5.1. @deprecated use float instead. */\nexport function unsignedFloat() {}\n`,
      errors: prose,
      output: `/** @deprecated */\nexport function unsignedFloat() {}\n`,
    },
  ],
});

// A tag's arguments are data and stay; only the English reason after the
// permanence claim goes. `@missingRailsCall`'s ruby_call NAMES which Rails
// call is unmade — dropping it left the tag saying nothing, and
// `scripts/api-compare/build.ts` fails the run on a tag with no subject.
tester.run("no-freeform-comments (tag arguments are data)", rule, {
  valid: [
    { code: `/** @missingRailsCall with_connection — PERMANENT */\nconst x = 1;\n` },
    { code: `/** @noRailsEquivalent PERMANENT */\nconst x = 1;\n` },
  ],
  invalid: [
    {
      code: `/** @missingRailsCall with_connection — PERMANENT: Rails is \`@arel ||= ...\`. */\nconst x = 1;\n`,
      errors: prose,
      output: `/** @missingRailsCall with_connection — PERMANENT */\nconst x = 1;\n`,
    },
    // The reason wraps across lines; the data is still read from the whole tag.
    {
      code: `/**\n * @missingRailsArgs change — PERMANENT: time/calculations.rb:256-263 passes\n *   a different hash here.\n */\nconst x = 1;\n`,
      errors: prose,
      output: `/** @missingRailsArgs change — PERMANENT */\nconst x = 1;\n`,
    },
    {
      code: `/**\n * @noRailsEquivalent PERMANENT — Ruby's \`@connection\` is duck-typed, so no\n * Ruby file declares the shape.\n */\nconst x = 1;\n`,
      errors: prose,
      output: `/** @noRailsEquivalent PERMANENT */\nconst x = 1;\n`,
    },
    // Several tags in one block each keep their own data.
    {
      code: `/**\n * Prose.\n * @internal\n * @missingRailsCall merge! — CONVERGEABLE: not yet ported.\n */\nconst x = 1;\n`,
      errors: prose,
      output: `/**\n * @internal\n * @missingRailsCall merge! — CONVERGEABLE\n */\nconst x = 1;\n`,
    },
  ],
});

// A tag whose required argument is missing cannot be reduced to data. A bare
// `@noRailsEquivalent` / `@missingRailsCall` fails the empty-reason contract
// that `scripts/api-compare/missing-rails-call-tags.ts` and `extract-ts-api.ts`
// enforce, and inventing the permanence claim would fabricate a reviewed
// judgement — so the comment is left exactly as written.
tester.run("no-freeform-comments (an unclassifiable tag is left alone)", rule, {
  valid: [
    { code: `/** @noRailsEquivalent Ruby needs no name for a duck type. */\nconst x = 1;\n` },
    {
      code: `/**\n * @noRailsEquivalent Serves trails' awaitable \`serializable_hash\`.\n */\nconst x = 1;\n`,
    },
    { code: `/** @missingRailsCall merge! — it is inlined here. */\nconst x = 1;\n` },
  ],
  invalid: [],
});
