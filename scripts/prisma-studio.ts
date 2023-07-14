import { load as load_env } from "https://deno.land/std@0.194.0/dotenv/mod.ts";

const env = await load_env();
const studio = new Deno.Command("npx", {
  args: [
    "prisma",
    "studio",
  ],
  env: {
    "DATABASE_URL": env.DIRECT_URL,
  },
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
}).spawn();
studio.ref();
