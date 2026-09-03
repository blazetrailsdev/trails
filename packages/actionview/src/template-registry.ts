// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TemplateRegistry {}

export type TemplateLocals<T> = [T] extends [never] ? Record<string, unknown> : T;
