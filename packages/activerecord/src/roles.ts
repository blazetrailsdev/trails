/**
 * Role name constants — mirrors ActiveRecord::Core::ROLES.
 *
 * Centralized here to avoid circular imports between core.ts (currentRole)
 * and connection-handling.ts (preventWrites comparisons).
 */

export const WRITING_ROLE = "writing";
export const READING_ROLE = "reading";
