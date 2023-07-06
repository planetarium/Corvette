export const uint8ArrayEqual = (a: Uint8Array, b: Uint8Array) =>
  a === b
    ? true
    : a == null || b == null
    ? false
    : a.length !== b.length
    ? false
    : a.every((val, idx) => val === b[idx]);
