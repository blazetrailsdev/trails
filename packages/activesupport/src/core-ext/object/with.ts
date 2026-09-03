export function objectWith<T extends object, R>(
  obj: T,
  attrs: Partial<Record<Extract<keyof T, string>, unknown>>,
  fn: (obj: T) => R,
): R {
  const saved: Partial<T> = {};
  const existed: Record<string, boolean> = {};
  const applied: string[] = [];
  let errored = false;

  try {
    for (const [key, value] of Object.entries(attrs)) {
      const hadKey = key in obj;
      existed[key] = hadKey;
      saved[key as keyof T] = obj[key as keyof T];
      obj[key as keyof T] = value as T[keyof T];
      applied.push(key);
    }
    return fn(obj);
  } catch (e) {
    errored = true;
    throw e;
  } finally {
    for (const key of applied) {
      if (errored) {
        try {
          if (existed[key]) {
            obj[key as keyof T] = saved[key as keyof T] as T[keyof T];
          } else {
            delete (obj as Record<string, unknown>)[key];
          }
        } catch {}
      } else {
        if (existed[key]) {
          obj[key as keyof T] = saved[key as keyof T] as T[keyof T];
        } else {
          delete (obj as Record<string, unknown>)[key];
        }
      }
    }
  }
}
