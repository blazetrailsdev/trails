// re-export the moved namespace, so consumers' paths are unchanged
export { WithIntegrationRouting } from "./with-integration.js";
// and keep the top-level same-named namespace here
export namespace ClassMethods { export function withRouting(): string { return "toplevel"; } }
export function withRouting(): string { return "bare"; }
