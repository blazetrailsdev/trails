declare module "@blazetrails/ruby-compat" {
  export function hashDelete(hash: object, key: unknown, block?: (key: never) => unknown): unknown;
  export function compact<T>(ary: readonly T[]): T[];
  export function uniq<T>(ary: readonly T[], block?: (e: T) => unknown): T[];
  export class Hash {}
}
