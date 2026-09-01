import type { Base } from "./base.js";

/**
 * Zero-import slot for `ActionView::Base`, per CLAUDE.md's "Call-time constant
 * resolution (Ruby autoload → the zero-import slot)".
 *
 * `Handlers::ERB#call` names `ActionView::Base.annotate_rendered_view_with_filenames`
 * inside its body (`template/handlers/erb.rb:86-89`), which Ruby resolves when
 * the method runs. An ESM `import` of `base.js` from the handler is eager, and
 * `template.rb:178`'s `extend Template::Handlers` port constructs the handler
 * at `template.ts` class-static time — so that edge closes the cycle
 * `tse.ts → base.ts → lookup-context.ts → resolver.ts → template.ts → tse.ts`
 * and entering it at `template/handlers/tse.js` reads `Tse` in TDZ.
 *
 * @internal
 */
export let _Base: typeof Base | undefined;

/** @internal */
export function _setBase(base: typeof Base): void {
  _Base = base;
}
