const registry = new Map<unknown, string>();

/** @noRailsEquivalent PERMANENT */
export function setRubyClassPath(klass: unknown, path: string): void {
  registry.set(klass, path);
}

/** @noRailsEquivalent PERMANENT — the read half of {@link setRubyClassPath}; it is what stands in for Ruby's `Module#name` (`vendor/ruby/variable.c:130` `rb_mod_name`) at `railtie.rb:173` and `railtie.rb:178`. */
export function getRubyClassPath(klass: unknown): string | undefined {
  return registry.get(klass);
}

/**
 * Ruby's `Module#name` (`vendor/ruby/variable.c:130` `rb_mod_name`), which
 * `abstract_railtie?` (`railtie.rb:173`), `railtie_name` (`railtie.rb:178`) and
 * `Configurable::ClassMethods#inherited` (`railtie/configurable.rb:14`) all
 * read. A TypeScript class name carries no namespace, so the path each Railtie
 * is defined under is declared through {@link setRubyClassPath}.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rubyClassPath(klass: { name: string }): string {
  return getRubyClassPath(klass) ?? klass.name;
}
