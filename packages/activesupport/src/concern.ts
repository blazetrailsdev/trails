/**
 * Concern — a pattern for mixins mirroring Rails ActiveSupport::Concern.
 *
 * Handles `included` blocks, class methods, instance methods, and
 * dependency resolution.
 */

export interface ConcernDefinition {
  dependencies?: ConcernMixin[];
  included?: (base: any) => void;
  classMethods?: Record<string, Function>;
  instanceMethods?: Record<string, Function>;
  /**
   * prepend: true — methods are installed such that they shadow existing
   * prototype methods while still being able to call the original via the
   * explicit `_super_<name>` property on the instance. Mirrors Rails'
   * Module#prepend semantics where prepended methods wrap existing ones.
   */
  prepend?: boolean;
}

export interface ConcernMixin {
  __concern: true;
  definition: ConcernDefinition;
}

const INCLUDED_CONCERNS = Symbol("includedConcerns");

/**
 * Define a concern (mixin with lifecycle support).
 */
export function concern(definition: ConcernDefinition): ConcernMixin {
  return { __concern: true, definition };
}

/**
 * Include a concern into a class. Handles dependency resolution,
 * included blocks, and method mixing.
 */
export function includeConcern(klass: any, mixin: ConcernMixin): void {
  // Track which concerns have been included to avoid duplicates
  if (!klass[INCLUDED_CONCERNS]) {
    klass[INCLUDED_CONCERNS] = new Set<ConcernMixin>();
  }
  const included: Set<ConcernMixin> = klass[INCLUDED_CONCERNS];

  if (included.has(mixin)) return;
  included.add(mixin);

  const def = mixin.definition;

  // Resolve dependencies first
  if (def.dependencies) {
    for (const dep of def.dependencies) {
      includeConcern(klass, dep);
    }
  }

  // Mix instance methods into prototype
  if (def.instanceMethods) {
    for (const [name, fn] of Object.entries(def.instanceMethods)) {
      if (def.prepend && klass.prototype[name]) {
        // Save the original method under _super_<name> so the prepended
        // method can call it. Mirrors Module#prepend wrap semantics.
        const original = klass.prototype[name];
        klass.prototype[`_super_${name}`] = original;
      }
      klass.prototype[name] = fn;
    }
  }

  // Mix class methods as static methods
  if (def.classMethods) {
    for (const [name, fn] of Object.entries(def.classMethods)) {
      klass[name] = fn;
    }
  }

  // Run included block
  if (def.included) {
    def.included(klass);
  }
}

/**
 * Check if a class has included a specific concern.
 */
export function hasConcern(klass: any, mixin: ConcernMixin): boolean {
  const included: Set<ConcernMixin> | undefined = klass[INCLUDED_CONCERNS];
  return included?.has(mixin) ?? false;
}
