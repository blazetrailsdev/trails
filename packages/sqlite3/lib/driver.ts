export type SqliteBindValue = null | string | number | bigint | boolean | Uint8Array;

export type SqliteBinds = readonly SqliteBindValue[] | { readonly [name: string]: SqliteBindValue };
