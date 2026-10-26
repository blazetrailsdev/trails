/// <reference no-default-lib="true"/>
/* eslint-disable @typescript-eslint/no-empty-object-type -- the global interfaces a noLib program requires */
interface Array<T> {
  length: number;
  [n: number]: T;
}
interface ReadonlyArray<T> {
  readonly length: number;
  readonly [n: number]: T;
}
interface Boolean {}
interface CallableFunction {}
interface Function {}
interface IArguments {}
interface NewableFunction {}
interface Number {}
interface Object {}
interface RegExp {}
interface String {
  readonly length: number;
}
interface Map<K, V> {
  get(key: K): V | undefined;
  delete(key: K): boolean;
}
interface Set<T> {
  has(value: T): boolean;
  delete(value: T): boolean;
}
type Record<K extends string | number | symbol, T> = { [P in K]: T };
