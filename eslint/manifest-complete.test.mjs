import { RuleTester } from "eslint";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import rule from "./manifest-complete.mjs";

// Create a temp models directory for the test fixtures.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-complete-test-"));
const modelsDir = path.join(tmpDir, "models");
fs.mkdirSync(modelsDir);

// Write stub model files so the rule's readdirSync finds them.
fs.writeFileSync(path.join(modelsDir, "user.ts"), "export class User {}\n");
fs.writeFileSync(path.join(modelsDir, "post.ts"), "export class Post {}\n");

process.on("exit", () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const manifestPath = path.join(modelsDir, "index.ts");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

// Code snippets used across cases.
const BOTH_IMPORTS = 'import { User } from "./user.js";\nimport { Post } from "./post.js";\n';
const USER_ONLY = 'import { User } from "./user.js";\n';
const USER_PLUS_GHOST = 'import { User } from "./user.js";\nimport { Ghost } from "./ghost.js";\n';

tester.run("manifest-complete", rule, {
  valid: [
    // Complete manifest — both model files imported.
    {
      filename: manifestPath,
      code: BOTH_IMPORTS,
    },
    // File that is NOT models/index.ts — rule is a no-op.
    {
      filename: path.join(modelsDir, "user.ts"),
      code: BOTH_IMPORTS,
    },
    // Extra non-relative import (e.g. framework import) is ignored.
    {
      filename: manifestPath,
      code: 'import { registerModel } from "@blazetrails/activerecord";\n' + BOTH_IMPORTS,
    },
  ],
  invalid: [
    // Missing post.ts import.
    {
      filename: manifestPath,
      code: USER_ONLY,
      errors: [{ messageId: "missingImport", data: { file: "post.ts" } }],
    },
    // Both model files missing from an empty manifest.
    {
      filename: manifestPath,
      code: 'import { registerModel } from "@blazetrails/activerecord";\n',
      errors: [
        { messageId: "missingImport", data: { file: "post.ts" } },
        { messageId: "missingImport", data: { file: "user.ts" } },
      ],
    },
    // Stale import: ghost.ts doesn't exist on disk.
    {
      filename: manifestPath,
      code: USER_PLUS_GHOST,
      errors: [
        { messageId: "missingImport", data: { file: "post.ts" } },
        { messageId: "staleImport", data: { specifier: "./ghost.js", file: "ghost.ts" } },
      ],
    },
  ],
});

console.log("manifest-complete: ok");
