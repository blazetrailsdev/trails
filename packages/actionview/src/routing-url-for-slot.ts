export interface PolymorphicBuilder {
  handleStringCall(target: unknown, name: string): string;
  handleClassCall(target: unknown, klass: unknown): string;
  handleModelCall(target: unknown, record: unknown): string;
}

export interface UrlForImplementation {
  urlFor(this: unknown, options?: unknown): string;
  urlOptions(this: unknown): Record<string, unknown>;
  optimizeRoutesGeneration(this: unknown): boolean;
  polymorphicPath(this: unknown, record: unknown, options: Record<string, unknown>): string;
  polymorphicUrl(this: unknown, record: unknown, options: Record<string, unknown>): string;
  isParameters(value: unknown): boolean;
  helperMethodBuilder: { path(): PolymorphicBuilder; url(): PolymorphicBuilder };
}

export let _UrlFor: UrlForImplementation | undefined;

export function _setUrlFor(value: UrlForImplementation): void {
  _UrlFor = value;
}
