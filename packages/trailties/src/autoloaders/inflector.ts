import { camelize } from "@blazetrails/activesupport";

const _overrides: Record<string, string> = {};

export const Inflector = {
  camelize(basename: string, _abspath: string): string {
    return (
      (Object.hasOwn(_overrides, basename) ? _overrides[basename] : null) ?? camelize(basename)
    );
  },

  inflect(overrides: Record<string, string>): void {
    Object.assign(_overrides, overrides);
  },
};
