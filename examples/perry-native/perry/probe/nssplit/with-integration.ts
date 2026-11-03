export namespace WithIntegrationRouting {
  export namespace ClassMethods { export function withRouting(): string { return "nested"; } }
  export function withRouting(): string { return "nested-outer"; }
}
