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
 * so the build gives each module a path under this root.
 */
export const FRAMEWORK_ROOT = "/node_modules/@blazetrails";

/**
 * The global the build wraps each rewritten `import.meta.dirname` in. The
 * runtime defines it to seat that directory, and its package's
 * `package.json`, in the virtual filesystem, and to answer the directory.
 */
export const SEAT_FRAMEWORK_DIR = "__trailsSeatFrameworkDir";
