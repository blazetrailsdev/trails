/**
 * Internal alias for "any class constructor" used as a Map/Set key throughout
 * ActiveRecord internals (Suppressor, NoTouching, Delegation). Centralized to
 * keep the four duplicate declarations in sync.
 *
 * @internal
 */
export type AnyClass = abstract new (...args: any[]) => any;
