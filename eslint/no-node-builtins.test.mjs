import { RuleTester } from "eslint";
import { describe, it, expect } from "vitest";
import * as rubyCompat from "@blazetrails/ruby-compat";
import rule, { RUBY_COMPAT_REPLACEMENTS } from "./no-node-builtins.mjs";

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } });

tester.run("no-node-builtins", rule, {
  valid: [
    'import { File } from "@blazetrails/ruby-compat";',
    'import { Dir } from "@blazetrails/ruby-compat";',
    'import { getCrypto } from "@blazetrails/ruby-compat";',
    'import { foo } from "./local.js";',
    'import lodash from "lodash";',
  ],
  invalid: [
    // Namespace import — rewrites import + all usage sites
    {
      code: 'import * as fs from "fs";\nfs.existsSync("x");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { File } from "@blazetrails/ruby-compat";\nFile.isExist("x");',
    },
    // node: prefix
    {
      code: 'import * as fs from "node:fs";\nfs.statSync("x");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { File } from "@blazetrails/ruby-compat";\nFile.stat("x");',
    },
    // Default import
    {
      code: 'import fs from "fs";\nfs.renameSync("x", "y");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { File } from "@blazetrails/ruby-compat";\nFile.rename("x", "y");',
    },
    // A directory member takes its seat on Dir, not File
    {
      code: 'import * as fs from "fs";\nfs.readdirSync("x");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { Dir } from "@blazetrails/ruby-compat";\nDir.children("x");',
    },
    // Both seats at once
    {
      code: 'import * as fs from "fs";\nfs.readdirSync("x");\nfs.existsSync("y");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { Dir, File } from "@blazetrails/ruby-compat";\nDir.children("x");\nFile.isExist("y");',
    },
    // Named imports
    {
      code: 'import { existsSync } from "fs";\nexistsSync("x");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { File } from "@blazetrails/ruby-compat";\nFile.isExist("x");',
    },
    // Named imports — multiple
    {
      code: 'import { unlinkSync, existsSync } from "fs";\nunlinkSync("x");\nexistsSync("y");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { File } from "@blazetrails/ruby-compat";\nFile.delete("x");\nFile.isExist("y");',
    },
    // Aliased named import — uses original (imported) name, not alias
    {
      code: 'import { existsSync as ex } from "fs";\nex("x");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { File } from "@blazetrails/ruby-compat";\nFile.isExist("x");',
    },
    // A member with no Ruby seat is reported without a fix
    {
      code: 'import * as fs from "fs";\nfs.readFileSync("x", "utf-8");',
      errors: [{ messageId: "useAdapter" }],
      output: null,
    },
    // Merges into an existing ruby-compat named import
    {
      code: 'import { StringIO } from "@blazetrails/ruby-compat";\nimport * as path from "path";\npath.join("a", "b");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { StringIO, File } from "@blazetrails/ruby-compat";\n\nFile.join("a", "b");',
    },
    // path
    {
      code: 'import * as path from "path";\npath.join("a", "b");',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { File } from "@blazetrails/ruby-compat";\nFile.join("a", "b");',
    },
    {
      code: 'import { basename, extname } from "node:path";\nbasename("a");\nextname("a");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { File } from "@blazetrails/ruby-compat";\nFile.basename("a");\nFile.extname("a");',
    },
    // crypto keeps the adapter accessor
    {
      code: 'import { createHash } from "crypto";\ncreateHash("sha256");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getCrypto } from "@blazetrails/ruby-compat";\ngetCrypto().createHash("sha256");',
    },
    // crypto with node: prefix
    {
      code: 'import * as crypto from "node:crypto";\ncrypto.randomBytes(16);',
      errors: [{ messageId: "useAdapter" }],
      output: 'import { getCrypto } from "@blazetrails/ruby-compat";\ngetCrypto().randomBytes(16);',
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
    // ruby-compat is no longer a special case: the seat it is pointed at is its own
    {
      filename: "/repo/packages/ruby-compat/src/hash.ts",
      code: 'import { createHash } from "node:crypto";\ncreateHash("sha256");',
      errors: [{ messageId: "useAdapter" }],
      output:
        'import { getCrypto } from "@blazetrails/ruby-compat";\ngetCrypto().createHash("sha256");',
    },
  ],
});

describe("no-node-builtins seats", () => {
  it("every seat the autofix writes exists on @blazetrails/ruby-compat", () => {
    for (const [builtin, replacement] of Object.entries(RUBY_COMPAT_REPLACEMENTS)) {
      expect(rubyCompat[replacement.importName], builtin).toBeDefined();
      for (const seat of Object.values(replacement.members ?? {})) {
        const [receiver, member] = seat.split(".");
        expect(rubyCompat[receiver][member], seat).toBeDefined();
      }
    }
  });
});
