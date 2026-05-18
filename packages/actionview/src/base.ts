/**
 * Standalone view context. Phase 0.5 stub — just enough surface for
 * actionpack `debug-view.ts` to extend, mixin chains in `metal/live` and
 * `metal/helpers` to compile, and the `action_view` on-load callback to
 * wire `defaultFormats` / `streamingCompletionOnException`. Real Base
 * (assigns, output buffer, view renderer, with_view_paths) lands in
 * Phase 4.
 *
 * @internal stub - real impl in Phase 4
 */

export class Base {
  /** @internal stub - real impl in Phase 4 */
  static streamingCompletionOnException = `"><script>window.location = "/500.html"</script></html>`;

  /** @internal stub - real impl in Phase 4 */
  static defaultFormats: string[] = ["html", "text", "js", "css", "xml", "json"];

  /** @internal stub - real impl in Phase 4 */
  static empty(): Base {
    return new Base();
  }
}
