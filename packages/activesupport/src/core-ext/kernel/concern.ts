import { concern as moduleConcern } from "../module/concerning.js";

type ModuleBody = Record<string, unknown>;

export function concern(
  topic: string,
  moduleDefinition: (this: ModuleBody, mod: ModuleBody) => void,
): ModuleBody {
  return moduleConcern.call(Object, topic, moduleDefinition);
}
