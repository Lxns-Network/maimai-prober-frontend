function asciiText(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    if (byte > 127) throw new Error("数值字段包含非 ASCII 字节");
    text += String.fromCharCode(byte);
  }
  return text;
}

export function decimalFloat32Bits(bytes: Uint8Array): number {
  const text = asciiText(bytes);
  if (/^[\t\n\v\f\r ]*[+-]?(?:0x|inf|nan)/i.test(text))
    throw new Error("不支持的浮点数写法（十六进制、inf 或 nan）");
  const m = /^[\t\n\v\f\r ]*([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?/.exec(text);
  if (!m) throw new Error("浮点数字段无法解析");
  const negative = m[1] === "-";
  const fraction = m[3] ?? m[4] ?? "";
  const digits = (m[2] ?? "") + fraction;
  const sign = negative ? 0x80000000 : 0;
  let n = BigInt(digits);
  let d = 1n;
  if (!n) return sign >>> 0;
  const power = Number(m[5] ?? 0) - fraction.length;
  if (!Number.isSafeInteger(power) || Math.abs(power) > 4096)
    throw new Error("浮点数指数超出支持范围");
  if (power >= 0) n *= 10n ** BigInt(power);
  else d = 10n ** BigInt(-power);
  let exponent = n.toString(2).length - d.toString(2).length;
  if (exponent >= 0 ? n < d << BigInt(exponent) : n << BigInt(-exponent) < d) exponent--;
  const shift = exponent < -126 ? 149 : 23 - exponent;
  const num = shift >= 0 ? n << BigInt(shift) : n;
  const den = shift < 0 ? d << BigInt(-shift) : d;
  let q = num / den;
  const twice = (num % den) * 2n;
  if (twice > den || (twice === den && q & 1n)) q++;
  if (exponent < -126) throw new Error("浮点数下溢超出支持范围");
  if (q === 1n << 24n) {
    q >>= 1n;
    exponent++;
  }
  if (exponent > 127) throw new Error("浮点数上溢");
  return (sign | ((exponent + 127) << 23) | Number(q - (1n << 23n))) >>> 0;
}

export function decimalInt32(bytes: Uint8Array): number {
  const m = /^[\t\n\v\f\r ]*([+-]?\d+)/.exec(asciiText(bytes));
  if (!m) throw new Error("整数字段无法解析");
  const n = BigInt(m[1]);
  if (n < -2147483648n || n > 2147483647n) throw new Error("整数字段超出 32 位范围");
  return Number(n);
}
