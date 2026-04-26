import { Digest } from "./digest.js";

/**
 * Mirrors: ActiveSupport::Digest.hexdigest
 * Returns the MD5 hex digest of `data`, truncated to 32 chars.
 * Uses Digest.hashDigestClass so it respects any app-level digest override.
 */
export function hexdigest(data: string): string {
  return Digest.hexdigest(data);
}
