declare module "@blazetrails/ruby-compat" {
  export function hashDelete(hash: object, key: unknown, block?: (key: never) => unknown): unknown;
  export class Hash {}
}
