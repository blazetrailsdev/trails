import {
  ARRAY_METHOD_TABLE,
  block as markBlock,
  Enumerator,
  rtest,
  toEnum,
} from "@blazetrails/ruby-compat";

export function extractBang<T>(array: T[], block: (item: T) => boolean): T[];
export function extractBang<T>(array: T[]): Enumerator<T>;
export function extractBang<T>(array: T[], block?: (item: T) => boolean): T[] | Enumerator<T> {
  if (block == null)
    return toEnum<T>(
      array,
      "extractBang",
      markBlock(() => array.length),
    );

  const extractedElements: T[] = [];

  array.splice(
    0,
    array.length,
    ...array.filter((element) => {
      if (rtest(block(element))) {
        extractedElements.push(element);
        return false;
      }
      return true;
    }),
  );

  return extractedElements;
}

ARRAY_METHOD_TABLE.extractBang = (self: unknown[], ...args: unknown[]) =>
  args[0] == null ? extractBang(self) : extractBang(self, args[0] as (item: unknown) => boolean);
