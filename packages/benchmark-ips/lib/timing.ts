import { Process } from "@blazetrails/ruby-compat";

const MICROSECONDS_PER_SECOND = 1_000_000;

function mean(samples: number[]): number {
  const sum = samples.reduce((a, b) => a + b);
  return sum / samples.length;
}

function variance(samples: number[], m: number | null = null): number {
  m ??= mean(samples);

  const total = samples.reduce((acc, i) => acc + (i - m) ** 2, 0);

  return total / samples.length;
}

function stddev(samples: number[], m: number | null = null): number {
  return Math.sqrt(variance(samples, m));
}

function cleanEnv(): void {}

function now(): number {
  return Process.clockGettime(Process.CLOCK_MONOTONIC, ":float_microsecond");
}

function addSecond(t: number, s: number): number {
  return t + s * MICROSECONDS_PER_SECOND;
}

function timeUs(before: number, after: number): number {
  return after - before;
}

export const Timing = {
  MICROSECONDS_PER_SECOND,
  mean,
  variance,
  stddev,
  cleanEnv,
  now,
  addSecond,
  timeUs,
};
