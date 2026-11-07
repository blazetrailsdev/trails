import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export function constSetPath<T>(path: string, value: T): T {
  const segments = path.split("::");
  const name = segments.pop()!;
  let mod = TopLevel as Record<string, object>;
  for (const segment of segments) {
    mod = (Object.hasOwn(mod, segment) ? mod[segment] : constSet(mod, segment, {})) as Record<
      string,
      object
    >;
  }
  return constSet(mod, name, value);
}
