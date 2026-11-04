# zeitwerk — Claude guide

Rules that bind only inside `packages/zeitwerk`. The repo-wide rules, the
fidelity standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md), which also keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.
A `§ "…"` reference below names a section of the root file unless it names
one in this file.

## `Module#autoload` is a build step (`Zeitwerk::Loader#define_autoload`)

`define_autoload` calls `Module#autoload`
(`vendor/zeitwerk/v2.7.2/lib/zeitwerk/loader.rb:542`), which binds a name and
runs `require` synchronously at first reference. JS has no hook on an unresolved
identifier and no synchronous `import()`. **The asynchrony goes at the load, and
the walk's result can be built ahead of time.** In development and test the walk
runs in process at `setup`. `trails build` (`trails-tsc-views build-autoload`)
boots the application through `setup_main_autoloader`, with each loader's
`setup` and `eager_load` stubbed so no application file is imported, runs the
same walk, and writes `manifest.json`, `imports.generated.js` and `constants.generated.d.ts` to
`.trails/autoload/<tag>/` for each loader, with paths relative to
`Loader#manifestRoot`, the application root. Every path names the file the walk
found: Node runs a `.ts` file as it stands, and a bundler resolves it.
The digest leaves the tag out, so an untagged loader's manifest still matches
when it is named by path. A namespace's load is what reveals the constants below it in
Ruby, so the step seats an empty module for each namespace and descends.
`Loader#manifest`, a parsed manifest or a path to one, makes `setup` fill
`autoloads`, `namespace_dirs` and `shadowed_files` from its rows, and a digest that differs from
the running configuration raises. With a manifest set up, `ls`, `dir?` and
`File.exist?` answer from its rows, so the eager load variants, `load_file`,
`cpath_expected_at` and `all_expected_cpaths` read no directory; a path the walk
left out (hidden, not code) is unknown there, so
`load_file` and `cpath_expected_at` raise "does not exist" for it and
`eager_load_dir` raises "is not a directory". An ignored path the walk expanded
is recorded, so those answer as Ruby does for it. A reload walks the file
system, as `setup` does, so it sees what changed since the build. New names
the step needs carry `@noRailsEquivalent PERMANENT` against this section. This is a genuine language
shortcoming, ratified repo-wide by RFC 0213.

**`Loader#importer` is the import the loader uses for a file.** `require`
loads a file with an `imports` thunk when one is set, else
`importer(url.href)`, else its own `import(url.href)`. A host whose
application code runs in a module graph of its own must set it: under vitest
a test imports `app/models/story.ts` through vite's graph, while
`@blazetrails/zeitwerk` is an externalized dependency whose own `import()` is
Node's, so the class the loader seats is a second module instance the test
never touched. `trails new`'s `config/environment.ts` sets
`loader.importer = (url) => import(url)` on every loader before
`Trails.initialize()`; that `import()` is written in the application, so it
resolves in whichever graph loaded the application. The URL carries the reload
generation, so a reload goes through it too. trails' own suite cannot see the
second instance, because its vitest config aliases every package to its
source; trailmap's suite is what found it. `@noRailsEquivalent PERMANENT`.
