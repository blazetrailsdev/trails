/**
 * ESLint rule: no-new-rebuild-canonical-tables
 *
 * The only-shrink ratchet over `rebuildCanonicalTables`
 * (`packages/activerecord/src/support/canonical-table-rebuild.ts`), for
 * RFC 0079 — "Drive rebuildCanonicalTables call sites to zero, then delete it".
 *
 * `rebuildCanonicalTables` drops and recreates a named subset of canonical
 * tables on the shared per-worker database. Every call site is a paid-per-run
 * patch over a contamination source: either the file's own DDL, or a sibling
 * that reshaped the table and never restored it. RFC 0079 drives the count to
 * zero and then deletes the helper along with its FK-scan machinery.
 *
 * Without a ratchet the count can only GROW, because the sibling rule
 * `require-canonical-rebuild` *mandates* a rebuild after any canonical-table
 * drop — so a new suite that force-creates a canonical table is told by lint to
 * add a call here. Three sites arrived that way after RFC 0079 was written
 * (`migration/exclusion-constraint.test.ts`, `migration/rename-table.test.ts`,
 * `migration/unique-constraint.test.ts`). This rule closes that loop: the two
 * rules together now say "restore what you drop, AND do not become a new
 * caller" — which leaves exactly one way out, namely not dropping a canonical
 * table in the first place.
 *
 * The baseline lives in `eslint/rebuild-canonical-tables-callers.json`, a map
 * of repo-relative path to the number of call sites that file is allowed. It is
 * ONLY-SHRINK, on the same contract as the call-parity baselines (CLAUDE.md,
 * "A documented deviation is debt, not permission"):
 *
 *   - A file with no entry may not call the helper at all — `unlistedCaller`.
 *   - A listed file may not exceed its allowance — `tooManyCalls`.
 *   - A listed file that has FEWER calls than its allowance reports
 *     `staleAllowance`: the burndown PR that removed the call must also
 *     decrement (or delete) the entry, so the ratchet actually tightens
 *     instead of leaving slack for the next caller to grow back into.
 *
 * There is deliberately NO reseed script. Reseeding is what turns an
 * only-shrink baseline back into a rubber stamp; the entries are few enough
 * that every change to this file is a reviewed one-line edit.
 *
 * Three details of the implementation are worth stating, since none is obvious
 * from the code:
 *
 *   - The helper's own module and its two self-coverage tests are skipped
 *     outright. They are deleted along with the helper by the RFC's final
 *     story, so a path allowance for them would be debt existing only to be
 *     deleted.
 *   - Both the bare call and a member call (`mod.rebuildCanonicalTables(…)`)
 *     count, so re-exporting the helper under a namespace cannot slip past.
 *   - When a listed file exceeds its allowance only the EXCESS calls report,
 *     so a file that legitimately keeps its baselined sites is not lit up
 *     wholesale by one new one.
 */

import {
  rebuildCallerAllowance,
  isRebuildHelperModule,
} from "./rebuild-canonical-tables-scope.mjs";

const HELPER = "rebuildCanonicalTables";

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Freeze the rebuildCanonicalTables caller list (RFC 0079). rebuildCanonicalTables drops and recreates canonical tables on the shared per-worker database; every call site is a patch over a contamination source that RFC 0079 is driving to zero. The baseline in eslint/rebuild-canonical-tables-callers.json maps repo-relative path to allowed call count and is only-shrink: a file outside it may not call the helper, a listed file may not exceed its count, and a listed file below its count must tighten the entry in the same PR. New suites restore canonical shape with fixtures({ ... }) — or, better, do not drop a canonical table at all. The helper's own module is exempt so its declaration and its self-coverage tests are not measured against a path allowance they would have to carry forever.",
    },
    schema: [],
    messages: {
      unlistedCaller: `\`${HELPER}\` is frozen by RFC 0079 (drop-rebuild-canonical-tables) and this file is not in the baseline, so it may not call it. The helper drops and recreates canonical tables on the SHARED per-worker database — every call site is a paid-per-run patch over a contamination source, and the RFC is driving the count to zero so the helper can be deleted. Seed this suite's schema with \`fixtures({ ... })\` instead. If you reached for it because \`require-canonical-rebuild\` told you to restore a canonical table you dropped, the real fix is upstream: do not drop the canonical table — give this suite's DDL a bespoke table name, or run it against a private (\`:memory:\`/tmpdir) adapter. Adding a row to eslint/rebuild-canonical-tables-callers.json is NOT the fix; that baseline only shrinks.`,
      tooManyCalls: `This file is in the RFC 0079 baseline for \`${HELPER}\` with an allowance of {{allowed}} call site(s), but it now has {{actual}}. The baseline in eslint/rebuild-canonical-tables-callers.json only shrinks — raising an allowance re-opens the growth this ratchet exists to stop. Restore the canonical shape another way (\`fixtures({ ... })\`), or stop dropping the canonical table this new call is patching over.`,
      staleAllowance: `Stale RFC 0079 allowance: eslint/rebuild-canonical-tables-callers.json permits {{allowed}} \`${HELPER}\` call site(s) in this file, but it now has {{actual}}. Tighten it in this PR: set the entry to {{actual}}, or delete the line entirely when that count is 0. The baseline is only-shrink, so leaving slack behind lets a later caller grow back into it without review.`,
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();

    if (isRebuildHelperModule(filename)) return {};

    const allowed = rebuildCallerAllowance(filename);
    const calls = [];

    return {
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" &&
                !callee.computed &&
                callee.property.type === "Identifier"
              ? callee.property.name
              : null;
        if (name === HELPER) calls.push(node);
      },

      "Program:exit"(program) {
        if (allowed === null) {
          for (const node of calls) context.report({ node, messageId: "unlistedCaller" });
          return;
        }
        if (calls.length > allowed) {
          for (const node of calls.slice(allowed)) {
            context.report({
              node,
              messageId: "tooManyCalls",
              data: { allowed: String(allowed), actual: String(calls.length) },
            });
          }
          return;
        }
        if (calls.length < allowed) {
          context.report({
            node: calls[0] ?? program,
            messageId: "staleAllowance",
            data: { allowed: String(allowed), actual: String(calls.length) },
          });
        }
      },
    };
  },
};

export default rule;
