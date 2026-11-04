# Any RegExp panics in a stdlib-linked binary: the intrinsic atom is in the image twice

**perry 0.5.1663, built from `main` at `a1ae27ee5`** (Linux x86_64, LLVM 22.1.8,
from-source, all 20 archives, GC-effects sidecars regenerated last).

A program that links `perry-stdlib` aborts on its first `RegExp` use:

    thread '<unnamed>' panicked at crates/perry-runtime/src/regex/instance.rs:262:10:
    realm has installed the RegExp intrinsic

## Root cause (measured, not inferred)

`intrinsic_prototype()` reads `RegExp.prototype` from the global by **atom
pointer identity**:

```rust
// private_storage_cache.rs, IntrinsicPrivateReadSite::read
own_private_value(object, STRING_TAG | self.atom.string as u64, self.atom.hash)
```

`self.atom.string` is an `ImageString` placed in the `perry_strings` link
section with `#[used(linker)]`. **`perry-stdlib` statically embeds its own copy
of `perry-runtime`** (`perry-runtime = { features = ["stdlib"] }`), so linking
`libperry_runtime.a` *and* `libperry_stdlib.a` puts that image string in the
binary twice. Counting the spelling in the two probe binaries:

| binary | `[[RegExpPrototype]]` atoms | `[[RegExpMatcher]]` atoms | result |
| --- | --- | --- | --- |
| `plain.ts` — runtime-only link | **1** | 1 | works |
| `withstdlib.ts` — with stdlib | **2** | 2 | panics |

With two copies, the key word recorded on the global object and the word the
read site compares are different pointers, so the layout probe misses, `read()`
returns `None`, and the `.expect()` aborts. The `StaticAtom` *symbols* are weak
(`V`) and the linker unifies them by name, but the image strings they point at
are section data and both survive.

The archives also define **8967 strong symbols in common**; perry's own
`strip-dedup` pass addresses 20 of them (`[strip-dedup] libperry_runtime.a:
localized 20 stdlib-stub symbol(s) so perry-stdlib wins the link (#5000)`), and
those 20 are all `js_ws_*` WebSocket stubs.

## The four cases

| link mode | RegExp | result |
| --- | --- | --- |
| runtime-only | top-level literal | works (`plain.ts`) |
| with stdlib | none | works (`noregex.ts`) |
| with stdlib | top-level literal | panic (`withstdlib.ts`) |
| with stdlib | created in a function, called later | panic (`lazyregex.ts`) |

Not an ordering problem, and not about which code runs first: the intrinsic is
never findable in a stdlib-linked realm. `plain.ts` and `withstdlib.ts` differ
by one `fetch()` call — enough to flip `Linking (runtime-only)...` to
`Linking (with stdlib)...`.

## Reproduce

    perry compile withstdlib.ts -o ws && ./ws     # panics
    perry compile plain.ts      -o p  && ./p      # prints "match: true"

11 lines, no dependencies, no trails code.

## Ruled out

- **A stale archive cache.** `~/.cache/perry/libs` moved aside; identical panic.
- **The auto-optimized feature set.** `PERRY_NO_AUTO_OPTIMIZE=1`, which falls
  back to the prebuilt full stdlib and unwind runtime, panics identically.
- **`strip-dedup` localizing the installer.** Its 20 symbols are `js_ws_*` only.
- **The runtime's `stdlib` feature being behavioural.** It gates exactly one
  item, `pub mod stdlib_stubs` (`lib.rs:354`) — a symbol-suppression gate, as
  its own Cargo.toml comment says.

## Why it has not been seen

The identity-based read arrived in `0ce7ab212` (2026-10-16, "intrinsic private
reads compare a static atom"), 2366 commits before `a1ae27ee5`. The prebuilt
archives cached on this machine from the last released perry contain **zero**
copies of the spelling — they predate the mechanism entirely — so a user on a
published release cannot hit it yet.

(An earlier draft of this file named `ef799c0d6` "realm intrinsics: one entry per
builtin…" as the suspect. That was wrong: it changed where RegExp *lookups* read
from, but the atom and the identity comparison come from `0ce7ab212`.)

## Fix directions

Any one of these would close it; the first looks cheapest:

1. **Do not link `libperry_runtime.a` when `libperry_stdlib.a` is linked** —
   stdlib already contains the runtime, which is why the symbols collide.
2. Dedupe `perry_strings` by spelling when seeding the atom table, so one
   spelling yields one atom whatever the section holds.
3. Make the intrinsic read compare spelling+hash rather than pointer identity on
   the miss path, so a duplicated image cannot change the answer.

## Why it matters here

It blocks AOT-compiling a trails application outright. The boot graph compiles
and links — 1934 modules, a 229MB binary — then aborts before a single module
initialises, because trails uses regular expressions throughout and needs
`fetch` (so stdlib) for `ruby-compat`'s open-uri.
