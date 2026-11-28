declare module "virtual:trails-package-urls" {
  const urls: Record<string, string>;
  export default urls;
}

declare module "virtual:trails-declarations" {
  const files: Record<string, string>;
  export default files;
}

declare module "virtual:trails-type-check-url" {
  /** The type checker's module, in the main graph's chunks, so it shares their TypeScript. */
  const url: string;
  export default url;
}
