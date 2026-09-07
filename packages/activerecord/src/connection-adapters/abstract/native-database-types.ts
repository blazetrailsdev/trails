export interface NativeDatabaseType {
  name?: string;
  limit?: number;
  precision?: number;
  scale?: number;
}

export type NativeDatabaseTypes = Record<string, string | NativeDatabaseType>;
