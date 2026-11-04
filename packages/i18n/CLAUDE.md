# i18n — Claude guide

Rules that bind only inside `packages/i18n`. The repo-wide rules, the
fidelity standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md), which also keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.
A `§ "…"` reference below names a section of the root file unless it names
one in this file.

## A translation lookup is synchronous; the load is an awaited step (`I18n.translate`)

`I18n.translate` (`vendor/i18n/v1.14.8/lib/i18n.rb:212-226`) is a synchronous
hash walk over a loaded translation table, and `Backend::Simple#lookup` lazily
loads that table inside the lookup — `init_translations unless initialized?`
(`vendor/i18n/v1.14.8/lib/i18n/backend/simple.rb:93-94`). The load is I/O; the
walk is not. **trails puts the asynchrony at the load and nowhere else:**

```text
async — the I/O:  setLoadPath (:127), reloadBang (:139), eagerLoadBang (:144)
sync  — the walk: translate (:150), translateBang (:174), localize (:235)
```

This is the shape of § "An adapter file is loaded by an awaited step": the
awaited step happens once, and every reader afterwards is as synchronous as
Ruby's. A `load_path` set after boot, or a development reload, is awaited where
Rails lazily loads inside the first lookup.

**`translate` is never made async.** It has 30 call sites across five
packages — the command that lists them, with the member each sits in, is in
the decision history — and **every member they sit in is synchronous today**.
The count is not the reason, the shapes are. Each of these returns a String
where Rails returns a String, and an async `translate` makes it return a
`Promise`:

- `ActiveModel::Error#message` and `#full_message`
  (`packages/activemodel/src/error.ts:235`, `:258`), which are **getters**,
  over the statics they call (`:87`, `:148`). `Errors#full_messages`
  (`errors.ts:233`), `#messages_for` (`:241`) and `#to_hash` (`:296`) read
  them, and `as_json` reads `to_hash`.
- `ActiveModel::Translation#human_attribute_name`
  (`packages/activemodel/src/translation.ts:60`) and `Name#human`
  (`naming.ts:220`), which name a model and its attributes everywhere one is
  rendered.
- `Inflector#ordinal` / `#ordinalize`
  (`packages/activesupport/src/inflector.ts:256`, `:260`), `Array#to_sentence`
  (`array-utils.ts:63`), `NumberConverter`'s `i18n_format_options` /
  `translate_number_value_with_default`
  (`number-helper/number-converter.ts:155`, `:177`) and
  `HtmlSafeTranslation.translate` (`html-safe-translation.ts:11`).
- Every helper that renders a translated string:
  `ActionView::Helpers::TranslationHelper#translate` / `#localize`
  (`packages/actionview/src/helpers/translation-helper.ts:40`, `:101`),
  `#time_tag` (`date-helper.ts:223`), `DateTimeSelector`'s private
  `translated_month_names` / `translated_date_order` (`:510`, `:566`),
  `weekday_options_for_select` (`form-options-helper.ts:271`), and
  `AbstractController::Translation#localize`
  (`packages/actionpack/src/abstract-controller/translation.ts:56`).

Two validator constructors translate as well (`activemodel/validations.ts:339`,
`activerecord/validations.ts:29`), and a JS constructor cannot await at all.

So an async `translate` does not make i18n async; it makes **ActiveModel's
error messages and ActiveSupport's string helpers** async, at a more prominent
surface than the one it fixes. § "Serialization's dual sync/async hash" already
refused that trade in this direction for `as_json`, for the same reason, and
this section is the same ruling for `translate`.

**The dual-shape return does not apply here.** `thenableHash` works because a
Hash can be a Proxy. A Proxy cannot be a string primitive, so a thenable
translation breaks `` `Name ${error.message}` `` and `error.message.length`.
There is no third shape.

As a consequence:

- **`I18n::Backend::Cache` is permanently unported**
  (`vendor/i18n/v1.14.8/lib/i18n/backend/cache.rb:79-111`). Its `_fetch`
  (`:93-99`) reads a cache store inside the lookup, and every
  `ActiveSupport::Cache` store's `read` / `write` is async
  (`packages/activesupport/src/cache/store.ts`). It is an opt-in mixin — an
  application includes it into a backend and sets `cache_store` itself — so not
  porting it costs behaviour no default configuration has. Its
  `unported-files` row cites this section.
- **A prewarmed in-process copy of the cache store is not the answer.** An
  invented copy, plus a store `write` started and not awaited, was rejected by
  the repo owner on 2026-10-20: it answers a stale entry when another process
  wrote one, and a failed write cannot reach the `translate` caller. Do not
  re-file it.
- A Rails test that depends on a lookup reaching a cache store is parked as
  `it.skip` under a `PERMANENT-SKIP:` line citing this section. The one
  instance is `translate caching backend`
  (`vendor/rails/v8.0.2/actionview/test/template/translation_helper_test.rb:390-410`),
  at `packages/actionview/src/template/translation-helper.test.ts`. Its body is
  empty rather than Rails', because that body names two things the port does
  not define: `I18n::Backend::Cache`, which this section leaves unported, and
  the `I18n.cache_store` accessor it is configured through (`cache.rb:44-74`,
  with no counterpart in `packages/i18n/src/i18n.ts`). Its
  `ActiveSupport::Cache.lookup_store(:memory_store)` call does resolve
  (`packages/activesupport/src/cache.ts:16`), so the two i18n names are the
  whole blocker. The receipt carries the citation instead.
- `Backend::KeyValue` is unaffected, because the gem already requires a
  synchronous store there: Ruby's store answers `[]`, `[]=` and `keys`
  (`vendor/i18n/v1.14.8/lib/i18n/backend/key_value.rb:26-30`), and the ported
  `Store` interface is those three methods, synchronous
  (`packages/i18n/src/backend/key-value.ts:17-21`). A store whose reads are
  async does not satisfy that interface, in Ruby or here. How such a store
  would be adapted is not decided by this section.

This is a genuine language shortcoming — JS has no synchronous await — and it
is ratified repo-wide here by the repo owner on 2026-10-21. A new instance is
not a new decision to argue, and there is no story to make `translate` async.
