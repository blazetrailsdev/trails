# actiontext — Claude guide

Rules that bind only inside `packages/actiontext`. The repo-wide rules are in
the root [CLAUDE.md](../../CLAUDE.md).

## `RichText`'s `blank?` / `present?` / `empty?` read a loaded plain text

`RichText` delegates `blank?`, `empty?` and `present?` to `to_plain_text`
(`vendor/rails/v8.0.2/actiontext/app/models/action_text/rich_text.rb:89`), which
renders each attachment and so reaches a GlobalID lookup. That is async here,
and `Base` declares `isBlank` / `isPresent` sync, as activesupport's
`isBlank(record)` reads them. So the three predicates are sync and read the
plain text the last `await richText.toPlainText()` computed for a `body` with
the same HTML, and `before_save` awaits it after `canonicalized`, so a saved
record answers them (ActiveStorage's presence validation of `embeds`' record
reads `blank?`). A `nil` body answers blank with no load, and any other unloaded body
raises `RuntimeError`, as `attached/one.rb`'s unloaded attachment does
(packages/activestorage/CLAUDE.md). `has_rich_text`'s `store_if_blank: false`
writer reads `name?` through the same predicate on the loaded association, and
the async `isName` awaits the association and its plain text first. Ruled by
the operator on 2026-11-13.
