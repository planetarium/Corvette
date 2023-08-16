import { parse } from "std/flags/mod.ts";
import * as path from "std/path/mod.ts";

import {
  clean as cleanSemver,
  satisfies as satisfiesSemver,
} from "https://deno.land/x/semver@v1.4.0/mod.ts";

import { baseDir } from "../moduleUtils.ts";
import { getSchema } from "../prismaSchemaUtils.ts";

const IncompatibleImportRegex =
  /(import\s[\s\S]+\sfrom\s+)(?:(')(.+)(?<!\.ts)(')|(")(.+)(?<!\.ts)("))([\s\S]*?(?:;|\n))/g;
const IncompatibleExportRegex =
  /(export\s[\s\S]+\sfrom\s+)(?:(')(.+)(?<!\.ts)(')|(")(.+)(?<!\.ts)("))([\s\S]*?(?:;|\n))/g;
const ConvertCompatibleImportExportPattern = "$1$2$5$3$6.d.ts$4$7$8";

const PrismaVersionSpecifier = cleanSemver("4.16.2")!;

async function patch(sourcePath: string, pattern: RegExp) {
  let sourceCode: string;
  try {
    sourceCode = await Deno.readTextFile(sourcePath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return;
    throw e;
  }
  if (sourceCode.match(pattern) == null) return;
  try {
    await Deno.writeTextFile(
      sourcePath,
      sourceCode.replace(
        pattern,
        ConvertCompatibleImportExportPattern,
      ),
    );
  } catch (e) {
    console.error(`Failed to patch Prisma Client at ${sourcePath}: ${e}`);
  }
}

const params = parse(Deno.args, { string: ["schema"], collect: ["generator"] });
let schema: string | undefined = undefined;
try {
  schema = await getSchema({ useParams: true });
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) throw e;
}
const generatedPaths = (params.generator || ["client"]).reduce(
  (acc, generator) => {
    if (typeof (generator) !== "string") return acc;
    const match = schema?.match(
      new RegExp(
        `generator\\s+${generator}\\s*\\{[\\s\\S]*?output\\s*=\\s*"([\\s\\S]+?)"[\\s\\S]*?\\}`,
      ),
    );
    if (match == null) return acc;
    return [
      ...(acc as string[]),
      path.join(baseDir, "prisma", match[1].trim()),
    ];
  },
  [],
) as string[];

const packageJsonPath = path.join(baseDir, "package.json");
let packageJson: {
  devDependencies: { prisma: string };
  dependencies: { "@prisma/client": string };
};
let currentPrismaVersion: string | null;
let currentPrismaClientVersion: string | null;
let clearCache: boolean;
try {
  packageJson = JSON.parse(await Deno.readTextFile(packageJsonPath));
  currentPrismaVersion = cleanSemver(packageJson.devDependencies.prisma);
  currentPrismaClientVersion = cleanSemver(
    packageJson.dependencies["@prisma/client"],
  );
  clearCache = currentPrismaVersion === null ||
    currentPrismaClientVersion === null ||
    !satisfiesSemver(currentPrismaVersion, PrismaVersionSpecifier) ||
    !satisfiesSemver(currentPrismaClientVersion, PrismaVersionSpecifier);
  if (clearCache) {
    packageJson.devDependencies.prisma = PrismaVersionSpecifier;
    packageJson.dependencies["@prisma/client"] = PrismaVersionSpecifier;
  }
} catch (e) {
  if (e instanceof Deno.errors.NotFound) {
    packageJson = {
      devDependencies: { prisma: PrismaVersionSpecifier },
      dependencies: { "@prisma/client": PrismaVersionSpecifier },
    };
    clearCache = true;
  }
  throw e;
}

if (clearCache) {
  const yarnLockPath = path.join(baseDir, "yarn.lock");
  try {
    await Deno.writeFile(yarnLockPath, new Uint8Array());
  } catch (e) {
    console.error(`Failed to empty ${yarnLockPath}.`);
    throw e;
  }

  for (
    const pathToDelete of [
      ...generatedPaths,
      path.join(baseDir, "node_modules"),
    ]
  ) {
    try {
      await Deno.remove(pathToDelete, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        console.error(`Failed to delete ${pathToDelete}.`);
        throw e;
      }
    }
  }
}

if (
  currentPrismaVersion !==
    packageJson.devDependencies.prisma ||
  currentPrismaClientVersion !==
    packageJson.dependencies["@prisma/client"]
) {
  if (!clearCache) {
    packageJson.devDependencies.prisma = currentPrismaVersion!;
    packageJson.dependencies["@prisma/client"] = currentPrismaClientVersion!;
  }
  try {
    await Deno.writeTextFile(
      packageJsonPath,
      JSON.stringify(packageJson, undefined, 2),
    );
  } catch (e) {
    console.error(`Failed to edit ${packageJsonPath}.`);
    throw e;
  }
}

const exitCode = (await new Deno.Command("deno", {
  args: [
    "run",
    "--allow-read",
    "--allow-env",
    "--allow-write",
    "--allow-run",
    "--allow-ffi",
    "--allow-sys",
    "--allow-net",
    `npm:prisma@${PrismaVersionSpecifier}`,
    ...Deno.args,
  ],
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  cwd: Deno.cwd(),
  uid: Deno.uid() !== null ? Deno.uid()! : undefined,
  gid: Deno.gid() !== null ? Deno.gid()! : undefined,
}).spawn().status).code;

await Promise.all(generatedPaths.map((generatedPath) =>
  Promise.all([
    patch(path.join(generatedPath, "index.d.ts"), IncompatibleImportRegex),
    patch(
      path.join(generatedPath, "runtime", "library.d.ts"),
      IncompatibleExportRegex,
    ),
    patch(
      path.join(generatedPath, "runtime", "data-proxy.d.ts"),
      IncompatibleExportRegex,
    ),
    patch(
      path.join(generatedPath, "edge.d.ts"),
      IncompatibleExportRegex,
    ),
  ])
));

Deno.exit(exitCode);
