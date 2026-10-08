const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const normalize = (input) =>
  String(input ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

export function decodeBase58(text) {
  let acc = 0n;
  for (const ch of text) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) return null;
    acc = acc * 58n + BigInt(digit);
  }
  const bytes = [];
  while (acc > 0n) {
    bytes.push(Number(acc & 0xffn));
    acc >>= 8n;
  }
  for (const ch of text) {
    if (ch !== '1') break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

export const hasAddressShape = (text) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);
export const decodesTo32 = (text) => decodeBase58(text)?.length === 32;
export const isAddressShaped = (text) => hasAddressShape(text) && decodesTo32(text);
export const isStated = (record) =>
  record.state === 'stated' && typeof record.value === 'string' && record.value.length > 0;
export const sameAddress = (a, b) => a === b;

export function checkAddress(input, record) {
  const text = normalize(input);
  if (!text) return { verdict: 'empty' };
  if (!isAddressShaped(text)) return { verdict: 'not-address' };
  if (!isStated(record)) return { verdict: 'unstated', state: record.state };
  return { verdict: sameAddress(text, record.value) ? 'match' : 'mismatch' };
}

export function isSignatureShaped(input) {
  const text = normalize(input);
  return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(text) && decodeBase58(text)?.length === 64;
}
