import { Digest } from "./digest.js";

export function hexdigest(data: string): string {
  return Digest.hexdigest(data);
}
