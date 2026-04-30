import { RuleTester } from "eslint";
import rule from "./no-process-bypass.mjs";

// Use the TypeScript parser since this rule is enforced on *.ts files.
// Without it, TS-only bypasses (process!, process as any, etc.) wouldn't
// even parse in the test, let alone get exercised.
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: (await import("typescript-eslint")).parser,
  },
});

const SOURCE = "@blazetrails/activesupport/process-adapter";

tester.run("no-process-bypass", rule, {
  valid: [
    // Adapter-routed forms
    `import { cwd } from "${SOURCE}"; cwd();`,
    `import { env } from "${SOURCE}"; env.FOO;`,
    `import { setExitCode } from "${SOURCE}"; setExitCode(1);`,
    // Suffix-match safety: identifiers that share a prefix with `process` are fine
    "const myprocess = {}; myprocess.env;",
    // Unrelated property on process is not flagged (only the listed props)
    "process.versions.node;",
    "process.pid;",
    // `process` as a property name on another object is not flagged
    "obj.process.env;",
    // Interpolated template-literal bracket access: dynamic name, not flagged.
    "process[`${'en' + 'v'}`];",
    "process[`${dynKey}`];",
  ],
  invalid: [
    // ── Risky props: flagged but NOT autofixed (local clash risk) ──
    { code: "process.cwd();", errors: [{ messageId: "bypass" }], output: null },
    { code: "process.env.FOO;", errors: [{ messageId: "bypass" }], output: null },
    { code: "process.argv;", errors: [{ messageId: "bypass" }], output: null },
    { code: "process.argv[0];", errors: [{ messageId: "bypass" }], output: null },
    { code: "process?.env;", errors: [{ messageId: "bypass" }], output: null },
    { code: 'process["env"];', errors: [{ messageId: "bypass" }], output: null },
    { code: "process['cwd'];", errors: [{ messageId: "bypass" }], output: null },
    { code: 'process?.["env"];', errors: [{ messageId: "bypass" }], output: null },
    { code: '"FOO" in process.env;', errors: [{ messageId: "bypass" }], output: null },
    { code: "process.env.FOO = 'x';", errors: [{ messageId: "bypass" }], output: null },

    // ── Autofixable props ──
    {
      code: "process.exitCode = 1;",
      errors: [{ messageId: "bypass" }],
      output: `import { setExitCode } from "${SOURCE}";\nsetExitCode(1);`,
    },
    {
      code: "process.exit(2);",
      errors: [{ messageId: "bypass" }],
      output: `import { exit } from "${SOURCE}";\nexit(2);`,
    },
    {
      code: "process.platform;",
      errors: [{ messageId: "bypass" }],
      output: `import { platform } from "${SOURCE}";\nplatform();`,
    },
    {
      code: "process.stdout.write('hi');",
      errors: [{ messageId: "bypass" }],
      output: `import { stdout } from "${SOURCE}";\nstdout.write('hi');`,
    },
    {
      code: "process.stderr.write('err');",
      errors: [{ messageId: "bypass" }],
      output: `import { stderr } from "${SOURCE}";\nstderr.write('err');`,
    },
    {
      code: "process.on('SIGINT', () => {});",
      errors: [{ messageId: "bypass" }],
      output: `import { onSignal } from "${SOURCE}";\nonSignal('SIGINT', () => {});`,
    },

    // ── Import merging: append to existing import from the same source ──
    {
      code: `import { cwd } from "${SOURCE}";\nprocess.exitCode = 0;`,
      errors: [{ messageId: "bypass" }],
      output: `import { cwd, setExitCode } from "${SOURCE}";\nsetExitCode(0);`,
    },
    // Already-imported (possibly aliased) symbol: reuse the local name.
    {
      code: `import { setExitCode as setEC } from "${SOURCE}";\nprocess.exitCode = 1;`,
      errors: [{ messageId: "bypass" }],
      output: `import { setExitCode as setEC } from "${SOURCE}";\nsetEC(1);`,
    },

    // ── Autofix safety gates ──
    // exitCode in expression context: flagged but NOT autofixed (semantics
    // would change — assignment evaluates to the RHS but setExitCode is void)
    {
      code: "if ((process.exitCode = 1)) {}",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    {
      code: "foo(process.exitCode = 1);",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    {
      code: "const x = process.exitCode = 1;",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    // process.on with a non-signal event name: flagged but NOT autofixed
    {
      code: "process.on('exit', () => {});",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    {
      code: "process.on('message', () => {});",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    // process.on with dynamic name: flagged but NOT autofixed
    {
      code: "process.on(name, () => {});",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    // process.on with SIGTERM: autofixed (other supported signal)
    {
      code: "process.on('SIGTERM', h);",
      errors: [{ messageId: "bypass" }],
      output: `import { onSignal } from "${SOURCE}";\nonSignal('SIGTERM', h);`,
    },

    // ── Template-literal bracket access (no interpolation) ──
    // process[`env`] is identical to process["env"] at runtime; flag it.
    { code: "process[`env`];", errors: [{ messageId: "bypass" }], output: null },
    { code: "process[`cwd`]();", errors: [{ messageId: "bypass" }], output: null },
    // Template literals WITH interpolation are dynamic and not flagged
    // — we can't statically know the property name. Documenting via
    // an explicit valid case in the suite below would require valid:[]
    // entries; covered implicitly by absence of error.

    // ── TypeScript wrapper bypasses ──
    // Non-null assertion: process!.env
    { code: "process!.env;", errors: [{ messageId: "bypass" }], output: null },
    // `as` type assertion: (process as any).cwd()
    { code: "(process as any).cwd();", errors: [{ messageId: "bypass" }], output: null },
    // Old-style type assertion: <any>process .env (rarely used in TS files)
    { code: "(<any>process).env;", errors: [{ messageId: "bypass" }], output: null },
    // Parenthesized: (process).env
    { code: "(process).env;", errors: [{ messageId: "bypass" }], output: null },
    // satisfies: (process satisfies object).env
    { code: "(process satisfies object).env;", errors: [{ messageId: "bypass" }], output: null },
    // Combined: ((process as any)!).env
    { code: "((process as any)!).env;", errors: [{ messageId: "bypass" }], output: null },

    // ── Destructuring ──
    // Direct destructure of process
    {
      code: "const { env } = process;",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    // Multiple props in one declarator
    {
      code: "const { env, cwd } = process;",
      errors: [{ messageId: "bypass" }, { messageId: "bypass" }],
      output: null,
    },
    // Renamed destructure
    {
      code: "const { env: e } = process;",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    // Destructure of an unwrapped TS expression
    {
      code: "const { env } = process!;",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
    // Mix of safe + unsafe props — only the unsafe one is reported
    {
      code: "const { pid, env } = process;",
      errors: [{ messageId: "bypass" }],
      output: null,
    },
  ],
});
