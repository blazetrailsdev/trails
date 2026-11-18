import { StringInquirer } from "../../string-inquirer.js";

export function inquiry(this: string): StringInquirer & Record<string, () => boolean> {
  return new StringInquirer(this) as any;
}
