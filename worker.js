/* Pure browser-side secp256k1 + Keccak-256. No network, storage, or dependencies. */
const MASK_64 = (1n << 64n) - 1n;
const FIELD = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = {
  x: 55066263022277343669578718895168534326250603453777594175500187360389116729240n,
  y: 32670510020758816978083085130507043184471273380659243275938904335757337482424n,
};
const INFINITY = { x: 0n, y: 1n, z: 0n };

function mod(value, modulo = FIELD) {
  const result = value % modulo;
  return result < 0n ? result + modulo : result;
}

function modPow(base, exponent, modulo = FIELD) {
  let result = 1n;
  base = mod(base, modulo);
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulo;
    base = (base * base) % modulo;
    exponent >>= 1n;
  }
  return result;
}

function inverse(value) {
  return modPow(value, FIELD - 2n);
}

function jacobianDouble(point) {
  if (point.z === 0n || point.y === 0n) return INFINITY;
  const yy = mod(point.y * point.y);
  const yyyy = mod(yy * yy);
  const s = mod(4n * point.x * yy);
  const m = mod(3n * point.x * point.x);
  const x = mod(m * m - 2n * s);
  const y = mod(m * (s - x) - 8n * yyyy);
  const z = mod(2n * point.y * point.z);
  return { x, y, z };
}

function jacobianAdd(first, second) {
  if (first.z === 0n) return second;
  if (second.z === 0n) return first;
  const z1z1 = mod(first.z * first.z);
  const z2z2 = mod(second.z * second.z);
  const u1 = mod(first.x * z2z2);
  const u2 = mod(second.x * z1z1);
  const s1 = mod(first.y * second.z * z2z2);
  const s2 = mod(second.y * first.z * z1z1);
  const h = mod(u2 - u1);
  const r = mod(s2 - s1);
  if (h === 0n) return r === 0n ? jacobianDouble(first) : INFINITY;
  const hh = mod(h * h);
  const hhh = mod(h * hh);
  const u1hh = mod(u1 * hh);
  const x = mod(r * r - hhh - 2n * u1hh);
  const y = mod(r * (u1hh - x) - s1 * hhh);
  const z = mod(h * first.z * second.z);
  return { x, y, z };
}

function baseTable() {
  const table = [INFINITY, { x: G.x, y: G.y, z: 1n }];
  for (let i = 2; i < 16; i += 1) table.push(jacobianAdd(table[i - 1], table[1]));
  return table;
}

const BASE_TABLE = baseTable();

function scalarMultiply(scalar) {
  let point = INFINITY;
  const nibbles = scalar.toString(16).padStart(64, '0');
  for (const nibble of nibbles) {
    point = jacobianDouble(jacobianDouble(jacobianDouble(jacobianDouble(point))));
    const digit = Number.parseInt(nibble, 16);
    if (digit) point = jacobianAdd(point, BASE_TABLE[digit]);
  }
  return point;
}

function publicKey(scalar) {
  const point = scalarMultiply(scalar);
  const zInverse = inverse(point.z);
  const z2 = mod(zInverse * zInverse);
  const z3 = mod(z2 * zInverse);
  const x = mod(point.x * z2);
  const y = mod(point.y * z3);
  return `${x.toString(16).padStart(64, '0')}${y.toString(16).padStart(64, '0')}`;
}

const ROUND_CONSTANTS = [
  1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n,
  0x8000000an, 0x8000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800an,
  0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n,
  0x8000000080008008n,
];
const ROTATION = [
  [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
];

function rotateLeft(value, shift) {
  if (shift === 0) return value;
  const bits = BigInt(shift);
  return ((value << bits) | (value >> (64n - bits))) & MASK_64;
}

function keccakF(state) {
  for (const roundConstant of ROUND_CONSTANTS) {
    const c = new Array(5).fill(0n);
    for (let x = 0; x < 5; x += 1) c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    for (let x = 0; x < 5; x += 1) {
      const d = c[(x + 4) % 5] ^ rotateLeft(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) state[x + 5 * y] = (state[x + 5 * y] ^ d) & MASK_64;
    }
    const b = new Array(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft(state[x + 5 * y], ROTATION[x][y]);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y])) & MASK_64;
      }
    }
    state[0] = (state[0] ^ roundConstant) & MASK_64;
  }
}

function bytesToLane(bytes, offset) {
  let lane = 0n;
  for (let index = 0; index < 8; index += 1) lane |= BigInt(bytes[offset + index] || 0) << BigInt(index * 8);
  return lane;
}

function keccak256(bytes) {
  const rate = 136;
  const paddedLength = Math.ceil((bytes.length + 1) / rate) * rate;
  const padded = new Uint8Array(paddedLength || rate);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  const state = new Array(25).fill(0n);
  for (let block = 0; block < padded.length; block += rate) {
    for (let index = 0; index < rate / 8; index += 1) state[index] ^= bytesToLane(padded, block + index * 8);
    keccakF(state);
  }
  const output = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) output[index] = Number((state[Math.floor(index / 8)] >> BigInt((index % 8) * 8)) & 0xffn);
  return output;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function checksumAddress(address) {
  const lower = address.toLowerCase().replace(/^0x/, '');
  const hash = bytesToHex(keccak256(new TextEncoder().encode(lower)));
  let checksummed = '0x';
  for (let index = 0; index < lower.length; index += 1) checksummed += Number.parseInt(hash[index], 16) >= 8 ? lower[index].toUpperCase() : lower[index];
  return checksummed;
}

function randomScalar() {
  const bytes = new Uint8Array(32);
  do {
    crypto.getRandomValues(bytes);
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    if (value > 0n && value < ORDER) return { value, hex: bytesToHex(bytes) };
  } while (true);
}

function makeAddress(scalar) {
  const digest = keccak256(hexToBytes(publicKey(scalar)));
  return checksumAddress(`0x${bytesToHex(digest.slice(-20))}`);
}

let running = false;
let attempts = 0;
let target = '';
let position = 'prefix';

function reportProgress() {
  if (attempts > 0) self.postMessage({ type: 'progress', attempts });
  attempts = 0;
}

function searchBatch() {
  const batchSize = 16;
  for (let index = 0; index < batchSize && running; index += 1) {
    const scalar = randomScalar();
    const address = makeAddress(scalar.value);
    const normalizedAddress = address.slice(2).toLowerCase();
    attempts += 1;
    const matched = position === 'prefix' ? normalizedAddress.startsWith(target) : normalizedAddress.endsWith(target);
    if (matched) {
      self.postMessage({ type: 'found', address, privateKey: `0x${scalar.hex}`, attempts });
      running = false;
      attempts = 0;
      return;
    }
  }
  reportProgress();
  if (running) setTimeout(searchBatch, 0);
}

self.addEventListener('message', event => {
  if (event.data.type === 'start') {
    target = event.data.target;
    position = event.data.position;
    attempts = 0;
    running = true;
    searchBatch();
  } else if (event.data.type === 'stop') {
    running = false;
    reportProgress();
  }
});
