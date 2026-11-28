const declarations = import("virtual:trails-declarations").then((m) => m.default);
let checker: Promise<typeof import("./type-check.ts")> | undefined;

self.onmessage = async (
  event: MessageEvent<{ checker: string; files: Record<string, string> }>,
) => {
  checker ??= import(/* @vite-ignore */ event.data.checker);
  const { typeProblems } = await checker;
  self.postMessage(typeProblems(await declarations, event.data.files));
};
