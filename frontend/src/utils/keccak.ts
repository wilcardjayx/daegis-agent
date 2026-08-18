/**
 * keccak256 — Ethereum keccak (original Keccak padding, 0x01 domain), pure TS,
 * zero dependencies. This is the DAegis vanilla site's PROVEN implementation
 * (docs/keccak.js) ported verbatim, not a reimplementation. It is verified in
 * the repo against the empty-string vector and both real on-chain reasonHashes;
 * the site uses it to check each published reasoning against the on-chain hash
 * in the browser: keccak256(utf8(reasoning)) === reasonHash.
 *
 * BigInt lanes are chosen for legibility over speed — the page hashes a handful
 * of short strings, never a hot path.
 */

const MASK = (1n << 64n) - 1n;

const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rho rotation offsets, indexed by lane = x + 5*y.
const RHO: number[] = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

function rol(x: bigint, n: bigint): bigint {
  return ((x << n) | (x >> (64n - n))) & MASK;
}

function keccakF(s: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // theta
    const C: bigint[] = new Array(5);
    for (let x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    const D: bigint[] = new Array(5);
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1n);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] ^= D[x];

    // rho + pi
    const B: bigint[] = new Array(25).fill(0n);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      B[y + 5 * ((2 * x + 3 * y) % 5)] = rol(s[x + 5 * y], BigInt(RHO[x + 5 * y]));
    }

    // chi
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      s[x + 5 * y] = B[x + 5 * y] ^ ((~B[((x + 1) % 5) + 5 * y] & MASK) & B[((x + 2) % 5) + 5 * y]);
    }

    // iota
    s[0] ^= RC[round];
  }
}

// pad10*1 with Ethereum's 0x01 domain start (NOT SHA3's 0x06).
function pad(bytes: Uint8Array, rate: number): Uint8Array {
  const padLen = rate - (bytes.length % rate); // always 1..rate
  const out = new Uint8Array(bytes.length + padLen);
  out.set(bytes);
  out[bytes.length] ^= 0x01;
  out[out.length - 1] ^= 0x80; // if padLen === 1 these OR into 0x81 on one byte
  return out;
}

/** keccak256(string | Uint8Array) -> "0x…" 32-byte hex. Strings are UTF-8 encoded. */
export function keccak256(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const rate = 136; // (1600 - 2*256) / 8 bytes
  const padded = pad(bytes, rate);
  const s: bigint[] = new Array(25).fill(0n);

  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 0; b < 8; b++) lane |= BigInt(padded[off + i * 8 + b]) << BigInt(8 * b);
      s[i] ^= lane;
    }
    keccakF(s);
  }

  const out = new Uint8Array(32); // first 4 lanes = 256 bits
  for (let i = 0; i < 4; i++) {
    const lane = s[i];
    for (let b = 0; b < 8; b++) out[i * 8 + b] = Number((lane >> BigInt(8 * b)) & 0xffn);
  }
  let hex = '0x';
  for (let i = 0; i < 32; i++) hex += out[i].toString(16).padStart(2, '0');
  return hex;
}

// ---- small address helpers used across the UI ----

export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

export function formatAddress(address: string, start = 6, end = 4): string {
  if (!address || address.length < start + end) return address;
  return `${address.slice(0, start)}…${address.slice(-end)}`;
}

export function padAddress32(address: string): string {
  return address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}
