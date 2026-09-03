const yaml = await import("yaml").catch(() => {
  const missing = (): never => {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(
      "The `yaml` package is required to read or write YAML. Install it with `npm install yaml`.",
    );
  };
  return { parse: missing, stringify: missing } as unknown as typeof import("yaml");
});

export const parse: typeof import("yaml").parse = yaml.parse;
export const stringify: typeof import("yaml").stringify = yaml.stringify;
