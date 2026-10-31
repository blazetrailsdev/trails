# @blazetrails/rake — Claude guide

## FileList#to_ary reads a resolved list

`Rake::FileList#to_ary` is `to_a`, and `to_a` calls `resolve`, which globs in
line (`vendor/rake/v13.2.1/lib/rake/file_list.rb:176-185`, `:210-218`). In
trails `resolve` and `toA` are async, since the glob is async fs, but Ruby's
implicit conversion is synchronous: `rbCheckArrayType` behind `flatten`,
`Array(fl)` and splat, and `include` / `exclude`'s `fn.to_ary`
(`file_list.rb:119-120`, `:152-153`), cannot await.

**`toAry` is synchronous: it answers `@items` once the list is resolved and
raises `RuntimeError` while it is pending.** A caller awaits `fl.resolve()` first,
so `flatten(["a", await fl.resolve()])` and
`FileList.get(await inner.resolve())` are the spellings of Rails'
`["a", fl].flatten` and `FileList[inner]`, and `include` expands a nested list
at include time, with no deferred arm in `resolve_add`. `await fl.toA()` stays
the resolving read, and `toAry` carries its receipts against this section.

`is_a?(Array)` (`file_list.rb:187`) is not ported, so `claim to be a kind of
array` stays parked: `Array[Symbol.hasInstance]` would reroute every
`instanceof Array` in the process (CLAUDE.md § "Ruby protocol methods with a
different JS mechanism").

Ruled by the repo owner on 2026-10-30. A new instance is not a new decision to
argue.
