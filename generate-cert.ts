import * as path from "https://deno.land/std@0.193.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.193.0/fs/mod.ts";
import { generate } from "https://deno.land/x/selfsignedeno@v2.1.1-deno/index.js";

import { baseDir } from "./moduleUtils.ts";

if (await exists(path.join(baseDir, "dev.key"))) Deno.exit(0);

const { private: privateKey, cert } = generate(
  [{ name: "commonName", value: "localhost" }],
  { keySize: 4096, days: 3650 },
);
await Deno.writeTextFile(path.join(baseDir, "dev.key"), privateKey);
await Deno.writeTextFile(path.join(baseDir, "dev.crt"), cert);
