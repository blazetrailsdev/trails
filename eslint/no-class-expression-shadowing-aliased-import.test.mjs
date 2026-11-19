import { RuleTester } from "eslint";
import rule from "./no-class-expression-shadowing-aliased-import.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

tester.run("no-class-expression-shadowing-aliased-import", rule, {
  valid: [
    {
      code: `import { BacktraceCleaner as AS } from "x";\nclass A { static BacktraceCleaner = class extends AS {}; }\n`,
    },
    {
      code: `import { BacktraceCleaner } from "x";\nconst B = class BacktraceCleaner2 extends BacktraceCleaner {};\n`,
    },
    {
      code: `import { Other as O } from "x";\nconst B = class BacktraceCleaner extends O {};\n`,
    },
    { code: `import * as NS from "x";\nconst B = class NS {};\n` },
    { code: `import * as NS from "x";\nclass A { static Foo = class extends NS.Foo {}; }\n` },
    { code: `const NS = {};\nconst B = class Foo extends NS.Foo {};\n` },
    { code: `import * as NS from "x";\nconst B = class Foo extends NS.Bar {};\n` },
    { code: `import type { Foo as F } from "x";\nconst B = class Foo {};\n` },
    { code: `import { type Foo as F } from "x";\nconst B = class Foo {};\n` },
  ],
  invalid: [
    {
      code: `import { BacktraceCleaner as ActiveSupportBacktraceCleaner } from "x";\nclass A { static BacktraceCleaner = class BacktraceCleaner extends ActiveSupportBacktraceCleaner {}; }\n`,
      errors: [{ messageId: "shadowsAliasedImport" }],
    },
    {
      code: `const B = class Foo {};\nimport { Foo as F } from "x";\n`,
      errors: [{ messageId: "shadowsAliasedImport" }],
    },
    {
      code: `import { default as Foo2, Foo as F } from "x";\nexport const C = class Foo {};\n`,
      errors: [{ messageId: "shadowsAliasedImport" }],
    },
    {
      code: `import * as AS from "x";\nclass A { static BacktraceCleaner = class BacktraceCleaner extends AS.BacktraceCleaner {}; }\n`,
      errors: [{ messageId: "shadowsNamespaceImport" }],
    },
    {
      code: `import { Foo } from "x";\nconst B = class Foo extends Foo {};\n`,
      errors: [{ messageId: "shadowsNamespaceImport" }],
    },
  ],
});
