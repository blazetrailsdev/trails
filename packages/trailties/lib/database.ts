import { presence } from "@blazetrails/activesupport";
import { env } from "@blazetrails/ruby-compat";

export function resolveEnv(): string {
  return presence(env.TRAILS_ENV) ?? presence(env.RACK_ENV) ?? "development";
}

export interface DatabaseConfigModule {
  [key: string]: unknown;
  schemaFormat?: string;
}
