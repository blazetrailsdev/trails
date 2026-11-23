# Home page example

The slice of a trails blog that the [blazetrails.dev](https://blazetrails.dev) home page shows. Each file uses
several frameworks: the `Post` model uses Active Record, Active Storage, Action Text, Active Record encryption,
Turbo broadcasts and an Active Job callback. The job delivers an Action Mailer email, and the controller and
view are Action Pack and Action View.

This is not a runnable app, and CI does not typecheck it. To typecheck it locally:

```sh
pnpm --filter @blazetrails/example-homepage typecheck
```

## Type-only declarations

`ApplicationRecord` declares `hasOneAttached`, `hasRichText` and `broadcastsTo`, and `PostMailer` declares its
class-level `published`. These are types only. At boot the engines' load hooks install the class methods on
`ActiveRecord::Base` (`packages/turbo/lib/engine.ts`), and `ActionMailer::Base.method_missing` answers mailer
actions. Neither reaches a model's or mailer's static type yet. The story
`engine-installed-base-class-methods-are-untyped` tracks removing these declarations.

## The home page's compiler errors

The two errors in the home page hero come from scratch edits of this app: a typo in `PostsController#publish`, and
a `render` in the `PostMailer#published` email that passes `posts/byline` the wrong local. `hero/` holds the edited
controller, the edited view and the error each reports (`hero/errors.json`), and the page reads all three from there.
`pnpm check:hero` copies `app` twice, applies one edit to each copy, compiles it (`trails-tsc-views build`, then
`tsc`), maps the view's error back to its `.tse` line and column through the generated source map, and fails unless
each copy reports exactly the error in `errors.json`. The CI Website job runs it after the build.
