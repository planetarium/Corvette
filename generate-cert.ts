import { exists } from "https://deno.land/std@0.193.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.193.0/path/mod.ts";
import { ConsoleHandler } from "https://deno.land/std@0.196.0/log/handlers.ts";
import {
  getLogger,
  setup as setupLog,
} from "https://deno.land/std@0.196.0/log/mod.ts";

import { generate } from "https://deno.land/x/selfsignedeno@v2.1.1-deno/index.js";

import { baseDir } from "./moduleUtils.ts";
import { defaultLogFormatter } from "./logUtils.ts";

setupLog({
  handlers: {
    console: new ConsoleHandler("DEBUG", { formatter: defaultLogFormatter }),
  },

  loggers: {
    ["generate-cert"]: {
      level: "DEBUG",
      handlers: ["console"],
    },
  },
});

const logger = getLogger("generate-cert");

const keyPath = path.join(baseDir, "dev.key");
const certPath = path.join(baseDir, "dev.crt");
if (await exists(keyPath)) {
  logger.info(
    `${keyPath} exists, not generating new self-signed TLS certificate.`,
  );
  Deno.exit(0);
}

const CN = "localhost";
const keySize = 4096;
const days = 3650;
logger.info(
  `Generating self-signed TLS certificate for CN ${CN} at ${keyPath}, keysize ${keySize}, valid for ${days} days.`,
);
const { private: privateKey, cert } = generate(
  [{ name: "commonName", value: CN }],
  { keySize, days },
);
await Deno.writeTextFile(keyPath, privateKey);
await Deno.writeTextFile(certPath, cert);
