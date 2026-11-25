/** The framework package specifiers an app module may import. */
export const PACKAGE_NAMES = [
  "@blazetrails/actionpack",
  "@blazetrails/actionview",
  "@blazetrails/activemodel",
  "@blazetrails/activerecord",
  "@blazetrails/activesupport",
  "@blazetrails/ruby-compat",
  "@blazetrails/trailties",
  "@blazetrails/trailties/trails",
  "@blazetrails/trailties/trailties/active-record",
  "@blazetrails/trailties/trailties/action-controller",
  "@blazetrails/trailties/trailties/action-view",
] as const;

/**
 * Where a framework module says it lives. A browser has no
 * `import.meta.dirname`, and an engine finds its root by walking up from it,
 * so the build gives each module this path and the runtime seats the
 * directory in the virtual filesystem.
 */
export const FRAMEWORK_ROOT = "/node_modules/@blazetrails";
