import { LogLevels } from "std/log/levels.ts";

import { type Handlers, type PageProps, Status } from "fresh/server.ts";

import { getCookieString, getServerSideUrl, logRequest } from "web/util.ts";

import { Layout } from "web/components/Layout.tsx";
import { type AbiEntry, ListAbi } from "web/islands/ListAbi.tsx";

export const handler: Handlers<AbiEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(getServerSideUrl("/api/abi/"), {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      logRequest(
        LogLevels.ERROR,
        req,
        ctx,
        Status.InternalServerError,
        "Failed to retrieve abi entries",
      );
      throw new Error(await res.text());
    }
    logRequest(LogLevels.INFO, req, ctx, Status.OK);
    return ctx.render(await res.json());
  },
};

export default (props: PageProps<AbiEntry[]>) => {
  return (
    <Layout title="ABI">
      <ListAbi entries={props.data} />
    </Layout>
  );
};
