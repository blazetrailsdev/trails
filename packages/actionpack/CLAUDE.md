# actionpack — Claude guide

Rules that bind inside `packages/actionpack`, and the action-name rule that
actionview and trailties follow from here. The repo-wide rules are in the root
[CLAUDE.md](../../CLAUDE.md), which keeps every heading below as a pointer so
code citations of the form `CLAUDE.md, "Section title"` resolve.

## `ParamsWrapper::ClassMethods#inherited` runs at a subclass's first `_wrapper_options` read

Rails' `inherited` (`actionpack/lib/action_controller/metal/params_wrapper.rb:244-251`)
runs when a controller subclass is defined: when the inherited options' `format`
is non-empty it dups them, sets `klass` to the subclass and assigns them. The
own-property guard (root § "`inherited` is deferred to own-property memo
guards") is `deferInherited` (`metal/params-wrapper.ts`), which wraps the
`_wrapperOptions` class reader on `Base` and `API`: a subclass's first read runs
`inheritedParamsWrapper`, the ported body, once.

One ordering differs. A subclass defined while its parent's `format` is empty,
and first read after the parent calls `wrap_parameters`, gets its own dup, where
Rails' definition-time call was a no-op and leaves it on the parent's options. A
subclass read before the parent enables wrapping stays on the parent's options,
as in Rails. `params-wrapper.trails.test.ts` pins both.

## An action's name is its method's name (`AbstractController::Base#action_methods`)

In Rails the action IS the method: `def next_bundle` defines the action
`next_bundle`, and one string names both in a route, a test, a callback's
`only:` list and a log line. A JS method is camelCase, so the method is
`nextBundle`, and the port has to choose which spelling an action goes by.

**The action goes by its method's name, and only that.** `action_methods`
answers the method names as they are declared, `process` records the name it is
given and looks up the method of exactly that name, and nothing on the dispatch
path converts a spelling. So `to: "stories#nextBundle"`, `get("nextBundle")`,
`only: "nextBundle"` and `action_name === "nextBundle"`. The underscored name
`next_bundle` names no action unless a method is literally called that. The
repo owner set this (reversing trails#8573, which had made `action_name` the
Rails spelling): an application names its own methods, and two spellings for
one action with a conversion between them was rejected in favour of one rule.

**What lives in a file is kebab-case.** A template's file name and a
lazy-lookup locale key are the action's name in kebab-case: the action
`nextBundle` renders `next-bundle.html.tse` and scopes `t(".title")` by
`controller.next-bundle.title`, matching the kebab-case file names of a trails
application throughout (`stories-controller.ts`). The repo owner set this too.
The name is converted with `dasherize(underscore(name))` only where an action
name becomes a file name or a locale key, and each site carries
`@inventedArm underscore — PERMANENT` and `@inventedArm dasherize — PERMANENT`:

- `ImplicitRender#defaultRender` and `#methodForAction`
  (`action-controller/metal/implicit-render.ts`; `implicit_render.rb:38-64`)
- `EtagWithTemplateDigest#pickTemplateForEtag`
  (`action-controller/metal/etag-with-template-digest.ts`)
- `ActionView::Rendering#_processRenderTemplateOptions`
  (`actionview/src/rendering.ts`), which covers `render action:` and the action
  name used as a partial's name
- `AbstractController::Translation#translate`'s lazy-lookup scope
  (`abstract-controller/translation.ts`)
- `RouteInfo#viewPath` (`trailties/src/commands/unused-routes.ts`)

The DIRECTORY a controller's templates are looked up in is kebab-case too.
`ViewPaths::ClassMethods#localPrefixes` (`actionview/src/view-paths.ts`; Rails'
`local_prefixes`, `view_paths.rb:75-77`) returns the controller path dasherized,
namespaces kept: `Admin::StoryPagesController` renders from `admin/story-pages/`.
It carries `@inventedArm dasherize — PERMANENT`. `controller_path` itself stays
underscored: it names the controller in routes and URL generation, where a
hyphen is not legal. Three more sites follow that directory: the scaffold's view
generator (`trailties/src/generators/tse/scaffold/scaffold-generator.ts`) writes
to the dasherized `controllerFilePath()` while `controllerFilePath` and
`controllerI18nScope` stay underscored; `partialPath`
(`actionview/src/renderer/abstract-renderer.ts`) dasherizes the directory part
of a record's `to_partial_path` and leaves the partial's own name alone
(`line_items/line_item` is found at `line-items/_line_item`), carrying
`@inventedArm dasherize — PERMANENT`; and `_impliedLayoutName`
(`actionview/src/layouts.ts`; `layouts.rb:345-347`) returns the controller path
dasherized, so the implied layout is `layouts/admin/story-pages`. That last one
carries no `@inventedArm` receipt and must not be given one: the arm-throw gate
does not compare that declaration and fails a tag on it as stale. This paragraph
is its record until story
`invented-arm-receipt-is-rejected-on-declarations-the-comparison-omits` makes
the pair comparable. Because the implied name is dasherized,
`_writeLayoutMethod` tests Rails' `/\blayouts/` (`layouts.rb:286`) against the
name underscored again: a `-` ends a word where the `_` it stands for does not,
so the dasherized `render-action-with-both-layouts/basic` would read as already
under `layouts` and drop the prefix. A layout the application names itself is
looked up as written.

`trails-tsc`'s view compiler follows the same rule when it works out which
template a controller's `render` call names (`trails-tsc/src/build-views.ts`):
the enclosing method's name, or a literal `action:`, in kebab-case; a literal
`template:` as written. The conversion sits at these call sites and not inside
the template resolver, because the resolver is also handed names an application
wrote out in full (`render template: "shared/line-item"`), which are looked up
as written.

Consequences for a ported test: where Rails' test says `get :hello_world`, the
port says `get("helloWorld")`, the fixture it renders implicitly is
`hello-world.html.erb`, and an assertion on a string that embeds the action
name (a log line, a generated URL) expects the method's spelling. A template
named explicitly (`render template: "test/hello_world"`) is looked up as
written.

This is ratified repo-wide here by the repo owner.

## A `null` positional keeps its url-helper slot (`UrlHelper#handle_positional_args`)

Rails' `handle_positional_args`
(`actionpack/lib/action_dispatch/routing/route_set.rb:292-318`) removes every
`inner_options` key from `path_params`, then merges `inner_options` over the
positional values. In Ruby, `product_path(nil, "id" => "url-tested")` still
fails generation, because the String key `"id"` is not the Symbol `:id` the
positional `nil` fills
(`actionpack/test/dispatch/routing_test.rb:4981-4984`).

A Ruby Symbol is a JS string (§ "A Ruby Symbol is a JS string, never a JS
`Symbol`" in the root CLAUDE.md), so trails has one key `id` for both. One of
the two Ruby calls has to lose. The repo owner ruled on 2026-10-14 (trails#8906)
that **only a `null` positional is kept**: it claims its slot, and an option of
the same name does not override it. A non-null positional behaves as in Rails.
The cost is that `productPath(null, { id: "1" })` raises where Rails' Symbol-key
`product_path(nil, id: "1")` answers `/products/1`.

`handlePositionalArgs` carries `@inventedArm block — PERMANENT` against this
section. This is ratified here by the repo owner.
