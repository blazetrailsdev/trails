declare module "*.tse" {
  const render: (context: unknown, locals: Record<string, unknown>) => unknown;
  export default render;
}
