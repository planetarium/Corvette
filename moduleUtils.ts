import * as path from "std/path/mod.ts";

// TODO: this const should be changed to point to the root source code directory whenever this
// file is moved.
const relativeToBase = ".";
export const baseDir = path.join(
  path.dirname(path.fromFileUrl(import.meta.url)),
  relativeToBase,
);
const baseDirInternal = baseDir;

export function normalizeImports(
  url: string,
  baseDir: string = baseDirInternal,
): string {
  if (!path.isAbsolute(baseDir)) throw new Error("`baseDir` must be absolute.");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:" || url.startsWith("file:/")) {
      return parsed.toString();
    }
    parsed.pathname = path.join(baseDir, parsed.pathname.slice(1));
    return parsed.toString();
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    return "file:" + url.startsWith("/") ? url : path.join(baseDir, url);
  }
}

export async function importESOrJson(
  url: string,
  options?: ImportCallOptions & { baseDir?: string },
) {
  url = normalizeImports(url, options?.baseDir);
  let imported;
  let isJsonModule = true;

  try {
    imported = await import(url, { assert: { type: "json" }, ...options });
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    isJsonModule = false;
    imported = await import(url, options);
  }

  const hash = new URL(url).hash.slice(1);
  return isJsonModule
    ? hash ? imported["default"][hash] : imported["default"]
    : imported[hash || "default"];
}

export function getRelativeScriptPath(importMetaUrl: string) {
  return path.relative(
    Deno.cwd(),
    path.dirname(path.fromFileUrl(importMetaUrl)),
  );
}
