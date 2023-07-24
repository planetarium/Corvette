import { DirectDatabaseUrlEnvKey } from "../constants.ts";
import { combinedEnv } from "../runHelpers.ts";

new Deno.Command("npx", {
  args: [
    "prisma",
    "studio",
  ],
  env: {
    "DATABASE_URL": combinedEnv[DirectDatabaseUrlEnvKey],
  },
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
}).spawn().ref();
