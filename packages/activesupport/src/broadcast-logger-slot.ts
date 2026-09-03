export let BroadcastLoggerClass: (new (...args: any[]) => { broadcasts: any[] }) | null = null;

export function _setBroadcastLoggerClass(klass: new (...args: any[]) => any): void {
  BroadcastLoggerClass = klass;
}
