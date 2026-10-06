# trailties: the Thor port

Thor `v1.3.2` is ported in full under `packages/trailties/src/thor/`, mirroring
`vendor/thor/v1.3.2/lib/thor/`. It is not a package of its own: api-compare's
`PACKAGE_DIR_OVERRIDES.thor` maps the `thor` parity package onto that directory,
and `eslint/thor-import-boundary.mjs` keeps the rest of trailties from reaching
into it except through its entry points.

The plan this file used to hold predates the port and is superseded by
RFC `0171-thor-port` in the tasks repo, which owns the remaining work
(`pnpm tasks list | grep 0171`).

## Carve-outs

The authoritative list of Thor files with no trails counterpart, each with its
reason, is [`scripts/parity/unported-files/thor.ts`](../../scripts/parity/unported-files/thor.ts):

| Thor file                 | Why it is not ported                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `runner.rb`               | The `thor` executable that installs and runs Thorfiles; railties never reaches it.            |
| `rake_compat.rb`          | Rake-task-to-Thor bridging; railties does not use it.                                         |
| `shell/html.rb`           | No terminal.                                                                                  |
| `shell/lcs_diff.rb`       | Needs the `diff-lcs` gem, which is not vendored; `show_diff` falls back to `Basic#show_diff`. |
| `line_editor/readline.rb` | Completion and history; `LineEditor.best_available` answers `Basic`.                          |

Everything else is ported, including `line_editor.rb` and
`line_editor/basic.rb` (railties' `app_base.rb` and the credentials commands
prompt through `ask` / `yes?`, and `file_collision` is built on `ask`),
`shell/terminal.rb`, the column, table and wrapped printers, and
`core_ext/hash_with_indifferent_access.rb`.

## Settled shapes

Two Thor-wide deviations are ratified in [CLAUDE.md](../../CLAUDE.md):
"Thor commands register through an explicit `methodAdded`" and "Thor dispatch
is async".
