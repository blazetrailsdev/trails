import { Basic } from "./line-editor/basic.js";

export function readline(
  prompt: string,
  options: Record<string, unknown> = {},
): Promise<string | null> {
  return new (bestAvailable()!)(prompt, options).readline();
}

export function bestAvailable(): typeof Basic | undefined {
  return [Basic].find((klass) => klass.isAvailable());
}
