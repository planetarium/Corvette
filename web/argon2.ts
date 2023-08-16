import {
  decode as decodeBase64,
  encode as encodeBase64,
} from "std/encoding/base64.ts";

import {
  type ArgonOptions,
  ArgonWorker,
} from "https://deno.land/x/argon2ian@2.0.1/src/async.ts";

const worker = new ArgonWorker();
const encoder = new TextEncoder();

const variants = ["argon2d", "argon2i", "argon2id"] as const;
const variantsMap = new Map(variants.map((v, i) => [v, i as 0 | 1 | 2]));

const defaultOptions = {
  variant: 2, // argon2id
  m: 1 << 16,
  t: 3,
  p: 1,
  // https://github.com/valpackett/argon2ian/blob/trunk/src/argon2.ts#L35
} satisfies ArgonOptions;

const generateSalt = (size = 16) => {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  return buf;
};

const encodeHashString = (params: VerifyParams) => {
  const { hash, salt, options } = params;
  if (!options.variant || !options.m || !options.t || !options.p) {
    throw new Error("Required options not provided.");
  }

  const sections = [
    variants[options.variant],
    "v=19", // argon2ian2 uses argon2 version 0x13
    `m=${options.m},t=${options.t},p=${options.p}`,
    encodeBase64(salt),
    encodeBase64(hash),
  ] as const;

  return `$${sections.join("$")}`;
};

const decodeHashString = (encoded: string): VerifyParams => {
  const [_0, variantStr, _v, paramsStr, salt, hash] = encoded.split("$");
  const params = paramsStr.split(",").reduce((acc, curr) => {
    const [k, v] = curr.split("=");
    acc[k] = parseInt(v, 10);
    return acc;
  }, {} as { [k: string]: number });

  return {
    hash: decodeBase64(hash),
    salt: decodeBase64(salt),
    options: {
      variant: variantsMap.get(variantStr as (typeof variants)[number]),
      ...params,
    },
  };
};

interface HashParams {
  salt?: string | Uint8Array;
  options?: ArgonOptions;
}

export const hash = async (
  password: string | Uint8Array,
  params: HashParams = {},
) => {
  await worker.ready;

  const options = { ...defaultOptions, ...params.options };

  const salt = params.salt != null
    ? typeof params.salt === "string"
      ? encoder.encode(params.salt)
      : params.salt
    : generateSalt();

  password = typeof password === "string" ? encoder.encode(password) : password;

  const hash = await worker.hash(password, salt, options);

  return encodeHashString({ hash, salt, options });
};

interface VerifyParams {
  hash: Uint8Array;
  salt: Uint8Array;
  options: ArgonOptions;
}

export const verify = async (
  password: string | Uint8Array,
  params: VerifyParams | string,
) => {
  await worker.ready;

  if (typeof params === "string") params = decodeHashString(params);

  password = typeof password === "string" ? encoder.encode(password) : password;

  return params.hash ===
    (await worker.hash(password, params.salt, params.options));
};
