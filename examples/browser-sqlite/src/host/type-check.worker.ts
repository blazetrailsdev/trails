import { typeProblems } from "./type-check.ts";

const declarations = import("virtual:trails-declarations").then((m) => m.default);

self.onmessage = async (event: MessageEvent<Record<string, string>>) => {
  self.postMessage(typeProblems(await declarations, event.data));
};
