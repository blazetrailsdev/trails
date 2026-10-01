import { RuleTester } from "eslint";
import rule from "./thor-import-boundary.mjs";

const TOP = "packages/trailties/src/thor/actions.ts";
const NESTED = "packages/trailties/src/thor/actions/create-file.ts";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("thor-import-boundary", rule, {
  valid: [
    { filename: TOP, code: 'import { Error } from "./error.js";' },
    { filename: NESTED, code: 'import { Base } from "../base.js";' },
    { filename: NESTED, code: 'export { EmptyDirectory } from "./empty-directory.js";' },
    { filename: TOP, code: 'import { File } from "@blazetrails/ruby-compat";' },
    { filename: TOP, code: 'import { getFs } from "@blazetrails/ruby-compat/fs-adapter";' },
    { filename: TOP, code: 'import { SpellChecker } from "@blazetrails/did-you-mean";' },
    {
      filename: "packages/trailties/src/generators/base.ts",
      code: 'import { camelize } from "@blazetrails/activesupport";',
    },
  ],
  invalid: [
    {
      filename: TOP,
      code: 'import { GeneratorBase } from "../generators/base.js";',
      errors: [{ messageId: "outside" }],
    },
    {
      filename: NESTED,
      code: 'import { GeneratorBase } from "../../generators/base.js";',
      errors: [{ messageId: "outside" }],
    },
    {
      filename: TOP,
      code: 'export * from "../command.js";',
      errors: [{ messageId: "outside" }],
    },
    {
      filename: TOP,
      code: 'const m = await import("../rails.js");',
      errors: [{ messageId: "outside" }],
    },
    {
      filename: TOP,
      code: 'import { camelize } from "@blazetrails/activesupport";',
      errors: [{ messageId: "package" }],
    },
    {
      filename: TOP,
      code: 'import type { Deprecation } from "@blazetrails/activesupport/deprecation";',
      errors: [{ messageId: "package" }],
    },
  ],
});
