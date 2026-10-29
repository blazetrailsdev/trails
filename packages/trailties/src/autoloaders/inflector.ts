import { camelize } from "@blazetrails/activesupport";

const overrides: Record<string, string> = {};

export const Inflector = {
  camelize(basename: string, _abspath: string): string {
    return (Object.hasOwn(overrides, basename) ? overrides[basename] : null) ?? camelize(basename);
  },

  inflect(newOverrides: Record<string, string>): void {
    Object.assign(overrides, newOverrides);
  },
};
