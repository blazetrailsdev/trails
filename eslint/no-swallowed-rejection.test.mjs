import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-swallowed-rejection.mjs";

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: "module" },
});

const swallowed = (code) => ({ code, errors: [{ messageId: "swallowed" }] });

tester.run("no-swallowed-rejection", rule, {
  valid: [
    "async function f(p) { await p.catch(() => null); }",
    "async function f(p) { await p.then(() => 1, () => undefined); }",
    "async function f(p) { await p.catch(() => {}).finally(() => {}); }",
    "function f(p) { return p.catch(() => {}); }",
    "const f = (p) => p.catch(() => null);",
    "function f(p) { p.catch((e) => { report(e); }); }",
    "function f(p) { p.catch((e) => e); }",
    "function f(p) { p.then(() => {}); }",
    "function f(p) { p.catch(handler); }",
  ],
  invalid: [
    swallowed("function f(p) { p.catch(() => {}); }"),
    swallowed("function f(p) { p.catch(() => undefined); }"),
    swallowed("function f(p) { p.catch(function () { return null; }); }"),
    swallowed("function f(p) { p.then(() => 1, () => {}); }"),
    swallowed("function f(p) { void p.catch(() => {}); }"),
    swallowed("function f(p) { const q = p.catch(() => null); return q; }"),
    swallowed("class K { f(p) { this.q = p.catch(() => {}); } }"),
    swallowed("async function f(p) { await g(p.catch(() => {})); }"),
  ],
});
