import { hashDelete } from "@blazetrails/ruby-compat";

interface CheckableHost {
  value(): unknown;
  isChecked(value: unknown): boolean;
}

export const Checkable = {
  isInputChecked(this: CheckableHost, options: Record<string, unknown>): boolean {
    if (Object.hasOwn(options, "checked")) {
      const checked = hashDelete(options, "checked");
      return checked === true || checked === "checked";
    } else {
      return this.isChecked(this.value());
    }
  },
};
