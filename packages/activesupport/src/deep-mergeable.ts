import { isModuleIncluded } from "@blazetrails/ruby-compat";

type MergeBlock = (key: unknown, thisVal: unknown, otherVal: unknown) => unknown;

export interface DeepMergeableHost {
  mergeBang(other: unknown, block: MergeBlock): this;
  deepMerge(other: unknown, block?: MergeBlock): this;
  deepMergeBang(other: unknown, block?: MergeBlock): this;
  isDeepMerge(other: unknown): boolean;
}

export const DeepMergeable = {
  deepMerge<T extends DeepMergeableHost>(this: T, other: unknown, block?: MergeBlock): T {
    const dup = Object.assign(Object.create(Object.getPrototypeOf(this)) as T, this);
    return dup.deepMergeBang(other, block);
  },

  deepMergeBang<T extends DeepMergeableHost>(this: T, other: unknown, block?: MergeBlock): T {
    return this.mergeBang(other, (key, thisVal, otherVal) => {
      if (
        thisVal != null &&
        isModuleIncluded((thisVal as object).constructor as { prototype: object }, DeepMergeable) &&
        (thisVal as DeepMergeableHost).isDeepMerge(otherVal)
      ) {
        return (thisVal as DeepMergeableHost).deepMerge(otherVal, block);
      } else if (block) {
        return block(key, thisVal, otherVal);
      } else {
        return otherVal;
      }
    });
  },

  isDeepMerge(this: DeepMergeableHost, other: unknown): boolean {
    return other instanceof (this.constructor as abstract new (...args: never[]) => unknown);
  },
};
