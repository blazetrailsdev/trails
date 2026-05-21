# trailties generator templates — TypeScript-native plan

Status: **locked (2026-05-21).**

All trailties generators emit TS source through a typed tagged-template
builder under `@blazetrails/trailties/template-builder`. Raw-string emit and
`.rb`/`.erb` content are prohibited. Per-generator tests are mandatory
(snapshot + parse-without-diagnostics + no-Ruby regex).

This doc is the authoritative spec for the builder, the test contract,
and the migration PRs. The plan-doc (`trailties-plan.md`) references
PR T1–T5 below.

## Goals

1. **TS-source-by-construction.** Non-TS content cannot be produced
   without a deliberate carve-out (YAML/JSON builders are separate).
2. **Type-checked interpolations.** Symbols flow through `Ref` values;
   renaming an upstream symbol updates generators.
3. **Snapshot baseline per generator.** Vitest snapshots are the
   canonical record of what each generator emits.
4. **One shared emit infrastructure.** All generators compose the same
   primitives — no per-generator string concatenation.
5. **No new runtime deps in trailties** (hard rule 4 of the plan-doc).
6. **Rails functional parity.** Every Rails-shipped generator produces a
   working app skeleton.

## Non-goals

- Mass-template directory copy (Rails' Thor `directory ".", "."` flow).
- Consumption of third-party Rails generators as-is.
- View templates — those are governed by the actionview `.tse` plan and
  are out of scope here.

## Layers

| Concern        | Mechanism                                                |
| -------------- | -------------------------------------------------------- |
| Structure      | `tsModule({ imports, declarations })` typed record       |
| Declarations   | `tsClass` / `tsInterface` / `tsField` / `tsMethod`       |
| Symbols        | `Ref` (opaque, `unique symbol`-branded; unforgeable)     |
| Interpolation  | `` type`...` `` and `` tsBody`...` `` tagged templates   |
| Imports        | Deduplicated centrally by `tsModule` from collected refs |
| Method bodies  | `` tsBody`...` `` (dedent + ref-carrying)                |
| Escape hatches | `{ kind: "raw"; text }` declarations, bounded            |
| JSON output    | `JSON.stringify(value, null, 2)`                         |
| `compose.yaml` | JSON syntax (YAML 1.2 ⊇ JSON; Compose accepts it)        |
| Dockerfile     | Raw strings (too small a surface for a builder)          |

The TS builder is **never** reused for non-TS content. This is the
codified hard rule.

## API surface

```ts
// packages/trailties/src/template-builder/index.ts

declare const REF_BRAND: unique symbol;

/**
 * Opaque branded identifier. Structurally NOT constructible — the
 * `unique symbol` brand is unforgeable outside this module. The only
 * ways to obtain a `Ref` are `ref(...)` and the `*.refs` field on the
 * result of a `tsImport*` call.
 */
export type Ref = { readonly [REF_BRAND]: true; readonly name: string; readonly from?: string };

/** Tagged-template result carrying refs through interpolation. */
export type Type = {
  readonly [REF_BRAND]: "type";
  readonly text: string;
  readonly refs: readonly Ref[];
};
export function ref(name: string, from?: string): Ref;
export function type(parts: TemplateStringsArray, ...refs: Ref[]): Type;

export interface Import {
  from: string;
  default?: string;
  named?: Record<string, string | "named">;
  typeOnly?: boolean;
}

/** Result of an import call: the Import record plus the Refs callers reference. */
export interface ImportResult<TNames extends string = string> {
  import: Import;
  /** Ref for each imported binding, keyed by the imported alias. */
  refs: { readonly [K in TNames]: Ref };
}
export function tsImport<TNames extends string>(
  from: string,
  names: Record<TNames, string | "named">,
): ImportResult<TNames>;
export function tsImportDefault(from: string, name: string): ImportResult<string>;
export function tsImportType<TNames extends string>(
  from: string,
  names: Record<TNames, string | "named">,
): ImportResult<TNames>;

export interface Field {
  name: string;
  type: Type | Ref | string; // string only for globally-available types (primitives, plus Date/Uint8Array/Promise/etc.)
  nullable?: boolean;
  initializer?: string;
  comment?: string;
}
export function tsField(name: string, type: Field["type"], opts?: Partial<Field>): Field;

export interface Method {
  name: string;
  params: Array<{ name: string; type: Field["type"] }>;
  returnType?: Field["type"];
  body: Body; // tsBody required — plain strings rejected at the type level
  async?: boolean;
  static?: boolean;
  visibility?: "public" | "protected" | "private";
}
export function tsMethod(opts: Method): Method;

/** Dedent + ref-carrying tagged template for method bodies. */
export type Body = {
  readonly [REF_BRAND]: "body";
  readonly text: string;
  readonly refs: readonly Ref[];
};
export function tsBody(parts: TemplateStringsArray, ...interps: Array<Ref | string>): Body;

export interface ClassDecl {
  readonly [REF_BRAND]: "class";
  name: string;
  extends?: Ref; // must be a Ref, not a string — brand enforces this
  implements?: Ref[];
  exported?: boolean; // defaults true
  body: Array<Field | Method>;
}
export function tsClass(opts: Omit<ClassDecl, typeof REF_BRAND>): ClassDecl;

export interface InterfaceDecl {
  readonly [REF_BRAND]: "interface";
  /* analogous to ClassDecl */
}
export function tsInterface(opts: Omit<InterfaceDecl, typeof REF_BRAND>): InterfaceDecl;

export interface ModuleSource {
  imports?: Import[]; // optional — refs from declarations are auto-collected
  declarations: Array<ClassDecl | InterfaceDecl | { readonly [REF_BRAND]: "raw"; text: string }>;
  preamble?: string; // file-level comment block
}

/** The sole record→source resolver. */
export function tsModule(src: ModuleSource): string;

/** Test helpers, exported from "@blazetrails/trailties/template-builder/testing". */
export function parseTs(source: string): { diagnostics: readonly Diagnostic[] };
export function assertNoRubySource(text: string): void;
```

### Design rules baked in

- **`extends` requires a `Ref`.** `tsClass({ extends: "ApplicationRecord" })`
  is a type error. `Ref` is branded with a module-private `unique
symbol`, so it cannot be constructed structurally — the only ways
  to obtain one are `ref("Name", "package")` or the `.refs[alias]`
  field of an `ImportResult` returned by `tsImport*`. This is the
  load-bearing constraint that blocks the Ruby-emission failure mode.
- **`Type` and `Body` carry refs.** `` type`Array<${userRef}>` `` and `` tsBody`return new ${userRef}();` `` propagate refs to `tsModule`'s import collector.
- **`tsModule` resolves imports.** Walks every `Ref` in declarations,
  collects the implied imports, dedupes, sorts, and emits the import
  block. Generators never write `import` lines manually.
- **`raw` is bounded.** Only for content the builder genuinely can't
  express (license headers, top-level literals). Each `raw` usage in a
  generator gets a justifying code comment.
- **`tsMethod.body` is `tsBody`, not a string.** Plain strings rejected
  at the type level; trivial one-liner literals lifted to `` tsBody`...` ``
  by convention.

## Test contract (per generator, mandatory)

Three tiers; all three required for every PR that lands or modifies a
generator:

1. **Snapshot every emitted file** — `expect(emitted).toMatchSnapshot()`
   under `__snapshots__/<generator>.snap`.
2. **Parse-without-diagnostics** — every snapshot run through `parseTs`;
   any diagnostic fails the test. Catches "snapshot looks fine but isn't
   valid TS."
3. **No-Ruby regex** — `assertNoRubySource(emitted)` on every emitted
   file, asserting against `/^\s*(class|module|def)\s+\w+($|\s+<)/m`.
   Belt-and-suspenders for the PR-2182 regression mode.

`#2` is load-bearing: snapshots cannot go stale into unparseable TS
without CI failing.

## Migration PRs

PR T1 lands alone; T2–T5 parallelize off T1.

### PR T1 — Builder infrastructure (~250 LOC)

**Source:** new.

- `packages/trailties/src/template-builder/{index,types,refs,emit-module,emit-class,emit-interface,emit-import,emit-method,ts-body}.ts`
- `packages/trailties/src/template-builder/testing.ts` — exports `parseTs`, `assertNoRubySource`.
- Unit tests:
  - Import dedup; default+named in same import; type-only.
  - Ref propagation through `type` and `tsBody`.
  - `tsBody` dedent behavior.
  - Hand-built module snapshot golden.
  - **Compile-error assertion**: a `*.test-d.ts` (or `dx-tests/`-style) file invokes `tsClass({ extends: "ApplicationRecord" })` with a `// @ts-expect-error` comment on the offending line. The file is included in the `test:types` / `trails-tsc` typecheck pass; CI fails if the error stops being emitted.

### PR T2 — Migrate model / migration / resource-route generators (~150 LOC)

**Blocked by:** PR T1.

- `packages/trailties/src/generators/rails/model/model-generator.ts`
- `packages/trailties/src/generators/rails/migration/migration-generator.ts`
- `packages/trailties/src/generators/rails/resource-route/resource-route-generator.ts`
- Per-generator `__snapshots__/` covering the attribute-type matrix.
- Per-generator test contract (snapshot + `parseTs` + `assertNoRubySource`).

### PR T3 — Migrate controller / scaffold generators (~200 LOC)

**Blocked by:** PR T1.

- `packages/trailties/src/generators/controller-generator.ts`
- `packages/trailties/src/generators/scaffold-generator.ts`
- Relocate both into `packages/trailties/src/generators/rails/` Rails layout
  in the same PR.
- Factor out controller-template prose helpers used by T4 and PR 1.14b-cont.
- Test contract as T2.

### PR T4 — AuthenticationGenerator on the builder (~200 LOC)

**Blocked by:** PR T3.

- `packages/trailties/src/generators/rails/authentication/authentication-generator.ts`
- Snapshots for all 7 emitted files (`app/models/{user,session,current}`,
  `app/controllers/{sessions,passwords,concerns/authentication}`,
  `app/mailers/passwords_mailer`).
- Mailer pieces gated on actionmailer existence; honor a `--skip-mailer`
  flag.
- ApplicationCable connection emit gated on actioncable presence:
  emit only when an `app/channels/application_cable` directory exists
  (approximates Rails' `defined?(ActionCable::Engine)` gate).
- Mandatory `assertNoRubySource` across the full emit set.

### PR T5 — DevcontainerGenerator (~250 LOC)

**Blocked by:** PR T1 (builder).

- `packages/trailties/src/generators/rails/devcontainer/devcontainer-generator.ts`
- `update_devcontainer_db_host` / `update_devcontainer_db_feature` /
  `edit_compose_yaml` ports emit `devcontainer.json` AND `compose.yaml`
  via `JSON.stringify(..., null, 2)`. The `.yaml` extension stays
  (Compose's filename convention); the contents are JSON syntax, which
  YAML 1.2 accepts as a strict superset. No YAML emitter needed.
- `update_application_system_test_case` stays a plain string replace.

## Resolved decisions

1. **Method-body source** — `tsBody` tagged template only. Plain strings
   are rejected at the type level (`Method.body: Body`). Trivial one-liners
   still go through `` tsBody`...` `` — the dedent and ref-carrying behavior
   are no-ops on a single-line input, so there's no cost.
2. **Cross-generator imports** — file-local. No shared symbol table.
3. **Non-TS output** — `JSON.stringify(..., null, 2)` for JSON,
   `devcontainer.json`, and `compose.yaml` contents (YAML 1.2 ⊇ JSON;
   Docker Compose accepts it). Dockerfile stays raw strings. The TS
   builder is never reused for non-TS content.
4. **`.tts` / `.tse` for generators** — not shipping. Re-evaluate when
   any of these is observed in practice: (a) a generator's builder
   emit exceeds ~150 LOC of structural calls and is materially harder
   to read than a templated form, (b) authors repeatedly bypass the
   builder via `{ kind: "raw" }` for prose, or (c) snapshot drift
   stops catching real regressions. None of these trip today; revisit
   the day one does.
5. **No legacy generator templates to migrate.** The existing
   `packages/trailties/src/templates/` tree holds actionview `.tse`
   view templates (e.g. `welcome/index.tse`) — out of scope here.
   The builder lives in a sibling subtree at
   `packages/trailties/src/template-builder/`, exported as
   `@blazetrails/trailties/template-builder`.

## Plan-doc cross-references

- `trailties-plan.md` Hard rule 0 mandates this doc as the authority for
  generator output.
- PRs T1–T5 are listed in `trailties-plan.md` Phase 1 as the gating /
  superseding PRs for all generator work.
- PR 1.14b-cont and 1.14d depend on this builder; their entries in the
  plan-doc point here.
