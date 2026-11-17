import { ArrayInquirer } from "../../array-inquirer.js";

export function inquiry<T extends string | symbol>(
  this: T[],
): ArrayInquirer<T> & Record<string, () => boolean> {
  return new ArrayInquirer<T>(...this) as any;
}
