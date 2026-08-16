// keccak256 — Ethereum keccak (original Keccak padding, 0x01 domain), pure JS,
// zero dependencies. The browser's SubtleCrypto provides SHA-2, not keccak, so
// DAegis inlines this to verify each published reasoning against the on-chain
// reasonHash IN THE VISITOR'S BROWSER: keccak256(utf8(reasoning)) === reasonHash.
//
// BigInt lanes are chosen for legibility over speed — the page hashes a handful
// of short strings, never a hot path. Correctness is proven in keccak.test.js
// against the two real on-chain reasonHashes, so this is not "reasoned to be
// right", it is checked against production data.
(function (root) {
  "use strict";

  var MASK = (1n << 64n) - 1n;

  // Round constants for the iota step (24 rounds).
  var RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];

  // Rho rotation offsets, indexed by lane = x + 5*y.
  var RHO = [
    0, 1, 62, 28, 27,
    36, 44, 6, 55, 20,
    3, 10, 43, 25, 39,
    41, 45, 15, 21, 8,
    18, 2, 61, 56, 14
  ];

  function rol(x, n) {
    return ((x << n) | (x >> (64n - n))) & MASK;
  }

  function keccakF(s) {
    for (var round = 0; round < 24; round++) {
      // theta
      var C = new Array(5);
      for (var x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
      var D = new Array(5);
      for (var x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1n);
      for (var x = 0; x < 5; x++) for (var y = 0; y < 5; y++) s[x + 5 * y] ^= D[x];

      // rho + pi
      var B = new Array(25).fill(0n);
      for (var x = 0; x < 5; x++) for (var y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rol(s[x + 5 * y], BigInt(RHO[x + 5 * y]));
      }

      // chi
      for (var x = 0; x < 5; x++) for (var y = 0; y < 5; y++) {
        s[x + 5 * y] = B[x + 5 * y] ^ ((~B[((x + 1) % 5) + 5 * y] & MASK) & B[((x + 2) % 5) + 5 * y]);
      }

      // iota
      s[0] ^= RC[round];
    }
  }

  // pad10*1 with Ethereum's 0x01 domain start (NOT SHA3's 0x06).
  function pad(bytes, rate) {
    var padLen = rate - (bytes.length % rate); // always 1..rate
    var out = new Uint8Array(bytes.length + padLen);
    out.set(bytes);
    out[bytes.length] ^= 0x01;
    out[out.length - 1] ^= 0x80; // if padLen === 1 these OR into 0x81 on one byte
    return out;
  }

  // keccak256(Uint8Array | string) -> "0x…" 32-byte hex. Strings are UTF-8 encoded.
  function keccak256(input) {
    var bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
    var rate = 136; // (1600 - 2*256) / 8 bytes
    var padded = pad(bytes, rate);
    var s = new Array(25).fill(0n);

    for (var off = 0; off < padded.length; off += rate) {
      for (var i = 0; i < rate / 8; i++) {
        var lane = 0n;
        for (var b = 0; b < 8; b++) lane |= BigInt(padded[off + i * 8 + b]) << BigInt(8 * b);
        s[i] ^= lane;
      }
      keccakF(s);
    }

    var out = new Uint8Array(32); // first 4 lanes = 256 bits
    for (var i = 0; i < 4; i++) {
      var lane = s[i];
      for (var b = 0; b < 8; b++) out[i * 8 + b] = Number((lane >> BigInt(8 * b)) & 0xffn);
    }
    var hex = "0x";
    for (var i = 0; i < 32; i++) hex += out[i].toString(16).padStart(2, "0");
    return hex;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { keccak256: keccak256 };
  root.keccak256 = keccak256;
})(typeof self !== "undefined" ? self : this);
