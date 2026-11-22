declare module "memjs" {
  export class Client {
    static create(serversStr?: string, options?: Record<string, unknown>): Client;
    options: Record<string, unknown>;
    get(key: string): Promise<{ value: Uint8Array | null; flags: unknown }>;
    set(
      key: string,
      value: string | Uint8Array,
      options?: { expires?: number | null },
    ): Promise<boolean>;
    delete(key: string): Promise<boolean>;
    flush(): Promise<unknown>;
    stats(): Promise<unknown>;
    quit(): void;
  }
}
