const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UMASK = 0x80000000;
const LMASK = 0x7fffffff;
const FIXNUM_MAX = (1n << 62n) - 1n;

/** `vendor/ruby/v3.3.11/missing/mt19937.c:62` `struct MT`. */
interface MT {
  state: Uint32Array;
  next: number;
  left: number;
}

/** `vendor/ruby/v3.3.11/random.c:117` `rb_random_mt_t`: the generator and its `seed`. */
interface RandomMT {
  mt: MT | null;
  seed: bigint;
}

const defaultRand: RandomMT = { mt: null, seed: 0n };

function twist(u: number, v: number): number {
  return (((u & UMASK) | (v & LMASK)) >>> 1) ^ (v & 1 ? MATRIX_A : 0);
}

/** `vendor/ruby/v3.3.11/missing/mt19937.c:76` `init_genrand`. */
function initGenrand(mt: MT, s: number): void {
  mt.state[0] = s >>> 0;
  for (let j = 1; j < N; j++) {
    const prev = mt.state[j - 1] ^ (mt.state[j - 1] >>> 30);
    mt.state[j] = Math.imul(1812433253, prev) + j;
  }
  mt.left = 1;
  mt.next = N;
}

/** `vendor/ruby/v3.3.11/missing/mt19937.c:95` `init_by_array`. */
function initByArray(mt: MT, initKey: Uint32Array, keyLength: number): void {
  initGenrand(mt, 19650218);
  let i = 1;
  let j = 0;
  let k = N > keyLength ? N : keyLength;
  for (; k; k--) {
    const prev = mt.state[i - 1] ^ (mt.state[i - 1] >>> 30);
    mt.state[i] = (mt.state[i] ^ Math.imul(prev, 1664525)) + initKey[j] + j;
    i++;
    j++;
    if (i >= N) {
      mt.state[0] = mt.state[N - 1];
      i = 1;
    }
    if (j >= keyLength) j = 0;
  }
  for (k = N - 1; k; k--) {
    const prev = mt.state[i - 1] ^ (mt.state[i - 1] >>> 30);
    mt.state[i] = (mt.state[i] ^ Math.imul(prev, 1566083941)) - i;
    i++;
    if (i >= N) {
      mt.state[0] = mt.state[N - 1];
      i = 1;
    }
  }
  mt.state[0] = 0x80000000;
}

/** `vendor/ruby/v3.3.11/missing/mt19937.c:121` `next_state`. */
function nextState(mt: MT): void {
  const p = mt.state;
  mt.left = N;
  mt.next = 0;
  let k = 0;
  for (; k < N - M; k++) p[k] = p[k + M] ^ twist(p[k], p[k + 1]);
  for (; k < N - 1; k++) p[k] = p[k + M - N] ^ twist(p[k], p[k + 1]);
  p[k] = p[k + M - N] ^ twist(p[k], p[0]);
}

/** `vendor/ruby/v3.3.11/missing/mt19937.c:137` `genrand_int32`. */
function genrandInt32(mt: MT): number {
  if (--mt.left <= 0) nextState(mt);
  let y = mt.state[mt.next++];
  y ^= y >>> 11;
  y ^= (y << 7) & 0x9d2c5680;
  y ^= (y << 15) & 0xefc60000;
  y ^= y >>> 18;
  return y >>> 0;
}

/** `vendor/ruby/v3.3.11/random.c:97` `int_pair_to_real_exclusive`. */
function intPairToRealExclusive(a: number, b: number): number {
  a >>>= 5;
  b >>>= 6;
  return (a * 67108864 + b) * (1 / 9007199254740992);
}

/** `vendor/ruby/v3.3.11/random.c:1035`-style 32-bit words, least significant first. */
function absintWords(x: bigint): number[] {
  const words: number[] = [];
  for (let v = x < 0n ? -x : x; v > 0n; v >>= 32n) words.push(Number(v & 0xffffffffn));
  return words;
}

/** `vendor/ruby/v3.3.11/random.c:366` `rand_init`. */
function randInit(r: RandomMT, seed: bigint): void {
  const mt: MT = { state: new Uint32Array(N), next: 0, left: 0 };
  const buf = absintWords(seed);
  let len = buf.length;
  if (len <= 1) {
    initGenrand(mt, len ? buf[0] : 0);
  } else {
    if (buf[len - 1] === 1) len--;
    initByArray(mt, Uint32Array.from(buf), len);
  }
  r.mt = mt;
}

/** `vendor/ruby/v3.3.11/random.c:729` `make_seed_value`. */
function makeSeedValue(ptr: number[]): bigint {
  if (ptr[ptr.length - 1] <= 1) ptr.push(1);
  return ptr.reduceRight((acc, w) => (acc << 32n) | BigInt(w), 0n);
}

/** `vendor/ruby/v3.3.11/random.c:1355` `random_seed`: `DEFAULT_SEED_CNT` (4) entropy words. */
function randomSeed(): bigint {
  const buf = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x1_0000_0000));
  return makeSeedValue(buf);
}

/** `vendor/ruby/v3.3.11/random.c:143` `rand_mt_start`. */
function randMtStart(r: RandomMT): MT {
  if (r.mt == null) {
    r.seed = randomSeed();
    randInit(r, r.seed);
  }
  return r.mt!;
}

/** `vendor/ruby/v3.3.11/random.c:989` `make_mask`. */
function makeMask(x: bigint): bigint {
  x = x | (x >> 1n);
  x = x | (x >> 2n);
  x = x | (x >> 4n);
  x = x | (x >> 8n);
  x = x | (x >> 16n);
  x = x | (x >> 32n);
  return x;
}

/** `vendor/ruby/v3.3.11/random.c:1003` `limited_rand`, whose `limit` is INCLUSIVE. */
function limitedRand(mt: MT, limit: bigint): bigint {
  if (!limit) return 0n;
  const mask = makeMask(limit);

  if (0xffffffffn < limit) {
    retry: for (;;) {
      let val = 0n;
      for (let i = 1n; 0n <= i; i--) {
        if ((mask >> (i * 32n)) & 0xffffffffn) {
          val |= BigInt(genrandInt32(mt)) << (i * 32n);
          val &= mask;
          if (limit < val) continue retry;
        }
      }
      return val;
    }
  }

  let val: bigint;
  do {
    val = BigInt(genrandInt32(mt)) & mask;
  } while (limit < val);
  return val;
}

/** `vendor/ruby/v3.3.11/random.c:1035` `limited_big_rand`. */
function limitedBigRand(mt: MT, limit: bigint): bigint {
  const limArray = absintWords(limit);
  const len = limArray.length;
  const rndArray = new Array<number>(len).fill(0);

  retry: for (;;) {
    let mask = 0;
    let boundary = true;
    for (let i = len - 1; 0 <= i; i--) {
      let r = 0;
      const lim = limArray[i];
      mask = mask ? 0xffffffff : Number(makeMask(BigInt(lim)));
      if (mask) {
        r = (genrandInt32(mt) & mask) >>> 0;
        if (boundary) {
          if (lim < r) continue retry;
          if (r < lim) boundary = false;
        }
      }
      rndArray[i] = r;
    }
    return rndArray.reduceRight((acc, w) => (acc << 32n) | BigInt(w), 0n);
  }
}

/** `vendor/ruby/v3.3.11/random.c:1375` `rand_int`, `restrictive` false. */
function randInt(mt: MT, vmax: bigint): bigint | null {
  if (-FIXNUM_MAX - 1n <= vmax && vmax <= FIXNUM_MAX) {
    let max = vmax;
    if (!max) return null;
    if (max < 0n) max = -max;
    return limitedRand(mt, max - 1n);
  }
  if (vmax === 0n) return null;
  if (vmax < 0n) vmax = -vmax;
  vmax = vmax - 1n;
  if (vmax <= FIXNUM_MAX) {
    const max = vmax;
    if (max === -1n) return null;
    return limitedRand(mt, max);
  }
  return limitedBigRand(mt, vmax);
}

/**
 * `vendor/ruby/v3.3.11/random.c:1684` `rb_f_rand` over the default MT19937
 * generator: a non-nil, non-zero `max` draws an Integer through `rand_int`, and
 * every other argument falls through to `random_real`, a Float in `[0, 1)`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function kernelRand(max?: number | bigint | null): number | bigint {
  const mt = randMtStart(defaultRand);
  if (max != null) {
    const vmax = BigInt(max);
    if (vmax !== 0n) {
      const v = randInt(mt, vmax);
      if (v != null) return typeof max === "bigint" ? v : Number(v);
    }
  }
  return intPairToRealExclusive(genrandInt32(mt), genrandInt32(mt));
}

/**
 * `vendor/ruby/v3.3.11/random.c:970` `rb_f_srand`: reseeds the default
 * generator and answers the previous seed.
 *
 * @noRailsEquivalent PERMANENT
 */
export function kernelSrand(number?: number | bigint): bigint {
  randMtStart(defaultRand);
  const seed = number === undefined ? randomSeed() : BigInt(number);
  const old = defaultRand.seed;
  randInit(defaultRand, seed);
  defaultRand.seed = seed;
  return old;
}
