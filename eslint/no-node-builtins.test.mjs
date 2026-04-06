import { RuleTester } from "eslint";
import rule from "./no-node-builtins.mjs";

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } });

tester.run("no-node-builtins", rule, {
  valid: [
    'import { getFs } from "@blazetrails/activesupport";',
    'import { getPath } from "@blazetrails/activesupport";',
    'import { getCrypto } from "@blazetrails/activesupport";',
    'import { foo } from "./local.js";',
    'import lodash from "lodash";',
  ],
  invalid: [
    // Namespace import — rewrites import + all usage sites
    {
      code: 'import * as fs from "fs";\nfs.readFileSync("x", "utf-8");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getFs } from "@blazetrails/activesupport";\ngetFs().readFileSync("x", "utf-8");',
    },
    // node: prefix
    {
      code: 'import * as fs from "node:fs";\nfs.existsSync("x");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { getFs } from "@blazetrails/activesupport";\ngetFs().existsSync("x");',
    },
    // Default import
    {
      code: 'import fs from "fs";\nfs.readFileSync("x", "utf-8");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getFs } from "@blazetrails/activesupport";\ngetFs().readFileSync("x", "utf-8");',
    },
    // Named imports
    {
      code: 'import { readFileSync } from "fs";\nreadFileSync("x", "utf-8");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getFs } from "@blazetrails/activesupport";\ngetFs().readFileSync("x", "utf-8");',
    },
    // Named imports — multiple
    {
      code: 'import { readFileSync, existsSync } from "fs";\nreadFileSync("x", "utf-8");\nexistsSync("y");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getFs } from "@blazetrails/activesupport";\ngetFs().readFileSync("x", "utf-8");\ngetFs().existsSync("y");',
    },
    // Aliased named import — uses original (imported) name, not alias
    {
      code: 'import { readFileSync as rfs } from "fs";\nrfs("x", "utf-8");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getFs } from "@blazetrails/activesupport";\ngetFs().readFileSync("x", "utf-8");',
    },
    // path
    {
      code: 'import * as path from "path";\npath.join("a", "b");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { getPath } from "@blazetrails/activesupport";\ngetPath().join("a", "b");',
    },
    // crypto
    {
      code: 'import { createHash } from "crypto";\ncreateHash("sha256");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getCrypto } from "@blazetrails/activesupport";\ngetCrypto().createHash("sha256");',
    },
    // crypto with node: prefix
    {
      code: 'import * as crypto from "node:crypto";\ncrypto.randomBytes(16);',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getCrypto } from "@blazetrails/activesupport";\ngetCrypto().randomBytes(16);',
    },
    // Namespace passed as value — autofix bails (reports error only)
    {
      code: 'import * as fs from "fs";\nuse(fs);',
      errors: [{ messageId: "useAdapter" }],
      output: null,
    },
    // Other builtins — no autofix
    {
      code: 'import * as zlib from "zlib";',
      errors: [{ messageId: "noNodeBuiltin" }],
    },
    {
      code: 'import { createServer } from "http";',
      errors: [{ messageId: "noNodeBuiltin" }],
    },
    {
      code: 'import * as os from "node:os";',
      errors: [{ messageId: "noNodeBuiltin" }],
    },
    // Dynamic import — no autofix, but detected
    {
      code: 'const fs = await import("fs");',
      errors: [{ messageId: "useAdapter" }],
    },
    // require — no autofix, but detected
    {
      code: 'const fs = require("fs");',
      errors: [{ messageId: "useAdapter" }],
    },
  ],
});

console.log("All tests passed.");
