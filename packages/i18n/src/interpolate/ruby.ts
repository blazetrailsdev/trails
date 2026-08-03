/**
 * Mirrors: i18n/lib/i18n/interpolate/ruby.rb
 *
 * Only the pattern list is ported here — `Config#interpolation_patterns`
 * defaults to a copy of it. `I18n.interpolate` itself lands with the
 * interpolation story.
 *
 * The Ruby patterns are anchored on Ruby's `%{}` / `%<>` sprintf syntax and
 * carry no flags; the JS equivalents keep the same source, with the capture
 * groups in the same positions.
 */
export const DEFAULT_INTERPOLATION_PATTERNS: readonly RegExp[] = Object.freeze([
  /%%/,
  /%\{([\w|]+)\}/,
  /%<(\w+)>([^\d]*?\d*\.?\d*[bBdiouxXeEfgGcps])/,
]);
