# actionpack — Claude guide

Rules that bind inside `packages/actionpack`, and the action-name rule that
actionview and trailties follow from here. The repo-wide rules are in the root
[CLAUDE.md](../../CLAUDE.md), which keeps every heading below as a pointer so
code citations of the form `CLAUDE.md, "Section title"` resolve.

## `ParamsWrapper::ClassMethods#inherited` runs at a subclass's first `_wrapper_options` read

Rails' `inherited` (`actionpack/lib/action_controller/metal/params_wrapper.rb:244-251`)
runs when a controller subclass is defined: when the inherited options' `format`
is non-empty it dups them, sets `klass` to the subclass and assigns them. The
own-property guard is `deferInherited` (`metal/params-wrapper.ts`), which wraps
the `_wrapperOptions` class reader on `Base` and `API`: a subclass's first read
runs `inheritedParamsWrapper`, the ported body, once.

One ordering differs. A subclass defined while its parent's `format` is empty,
and first read after the parent calls `wrap_parameters`, gets its own dup, where
Rails' definition-time call was a no-op and leaves it on the parent's options. A
subclass read before the parent enables wrapping stays on the parent's options,
as in Rails. `params-wrapper.trails.test.ts` pins both.

## An action's name is its method's name (`AbstractController::Base#action_methods`)

In Rails the action IS the method: `def next_bundle` defines the action
`next_bundle`, and one string names both in a route, a test, a callback's
`only:` list and a log line. A JS method is camelCase
(`docs/ruby-ts-conventions.md`), so the method is `nextBundle`, and the port has
to choose which spelling an action goes by.

**The action goes by its method's name, and only that.** `action_methods`
answers the method names as they are declared, `process` records the name it is
given and looks up the method of exactly that name, and nothing on the dispatch
path converts a spelling. So `to: "stories#nextBundle"`, `get("nextBundle")`,
`only: "nextBundle"` and `action_name === "nextBundle"`. The underscored name
`next_bundle` names no action unless a method is literally called that.

This was briefly the other way (trails#8573 made `action_name` the Rails name
and mapped it to the method); the repo owner reversed it. An application names
its own methods, and should not have to name them in a spelling they do not
have. Two spellings for one action, with a conversion between them somewhere,
was the alternative, and was rejected in favour of one rule.

**What lives in a file is kebab-case.** A template's file name and a
lazy-lookup locale key are the action's name in kebab-case: the action
`nextBundle` renders `next-bundle.html.tse` and scopes `t(".title")` by
`controller.next-bundle.title`. File names in a trails application are
kebab-case throughout (`stories-controller.ts`, `rfc-pages/`), and a view or a
locale entry named for an action is one more of them. The repo owner set this.

Rails passes `action_name` to these lookups unchanged, because there the action
is already spelled as its file is. Here the name is converted, with
`dasherize(underscore(name))`, where an action name is turned into a file name
or a locale key, and nowhere else. Each site carries
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
`local_prefixes`, `view_paths.rb:75-77`, returns `[controller_path]`) returns
the controller path dasherized, namespaces kept: `Admin::StoryPagesController`
renders from `admin/story-pages/`, beside `admin/story-pages-controller.ts`.
It carries `@inventedArm dasherize — PERMANENT`. `controller_path` itself is
unchanged and stays underscored: it names the controller in routes and URL
generation, where a hyphen is not legal. The controller generator writes the
kebab-case directory, the view compiler maps a controller to it, and
`RouteInfo#viewPath` (`trails unused_routes`) looks for a route's template in
it, dasherizing the route's controller as it already does the action.

Two more sites name that directory and follow it. The scaffold's view generator
(`trailties/src/generators/tse/scaffold/scaffold-generator.ts`; Rails'
`erb/scaffold/scaffold_generator.rb` writes to `controller_file_path`) writes
to the dasherized `controllerFilePath()`; `controllerFilePath` and
`controllerI18nScope` themselves stay underscored. And a record rendered by
itself (`render(lineItem)`) is looked up through `partialPath`
(`actionview/src/renderer/abstract-renderer.ts`; Rails' `partial_path`,
`renderer/abstract_renderer.rb`), which dasherizes the directory part of the
record's `to_partial_path` and leaves the partial's own name alone:
`line_items/line_item` is found at `line-items/_line_item`. `to_partial_path`
is unchanged, as `controller_path` is. `partialPath` carries
`@inventedArm dasherize — PERMANENT`; the scaffold generator's methods are not
compared against Rails' and carry no receipt.

A controller's implied layout follows the directory. `_impliedLayoutName`
(`actionview/src/layouts.ts`; Rails' `_implied_layout_name`, `layouts.rb:345-347`,
returns `controller_path`) returns the controller path dasherized, so
`Admin::StoryPagesController` looks for `layouts/admin/story-pages`. It
carries no `@inventedArm` receipt, and must not be given one: the arm-throw gate
does not compare that declaration and fails a tag on it as stale
(`_impliedLayoutName: dasherize (declaration not compared)`). This paragraph is
its record until story
`invented-arm-receipt-is-rejected-on-declarations-the-comparison-omits`
makes the pair comparable; the tag goes on then and this note comes out. A layout the application names itself
(`layout "line_items"`, `render layout: "line_items"`) is looked up as written.

`trails-tsc`'s view compiler follows the same rule when it works out which
template a controller's `render` call names (`trails-tsc/src/build-views.ts`):
the enclosing method's name, or a literal `action:`, in kebab-case; a literal
`template:` as written.

The conversion is at these sites and not inside the template resolver, because
the resolver is also handed names an application wrote out in full
(`render template: "shared/line-item"`, `render partial: "line-item"`), which
are looked up as written. Only the caller knows that the string in its hand is
an action's name.

Consequences for a ported test: where Rails' test says `get :hello_world`, the
port says `get("helloWorld")`, the fixture it renders implicitly is
`hello-world.html.erb`, and an assertion on a string that embeds the action
name (a log line, a generated URL) expects the method's spelling. A template
named explicitly (`render template: "test/hello_world"`) is looked up as
written.

This is ratified repo-wide here by the repo owner.
