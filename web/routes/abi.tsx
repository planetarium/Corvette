import { LogLevels } from "std/log/levels.ts";

import { Handlers, PageProps, Status } from "fresh/server.ts";

import { Layout } from "~/components/Layout.tsx";
import { type AbiEntry, ListAbi } from "~/islands/ListAbi.tsx";
import { logRequest, getCookieString, getServerSideUrl } from "~/util.ts";

export const handler: Handlers<AbiEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(getServerSideUrl("/api/abi/"), {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      logRequest(LogLevels.ERROR, req, ctx, Status.InternalServerError, "Failed to retrieve abi entries")
      throw new Error(await res.text());
    }
    logRequest(LogLevels.INFO, req, ctx, Status.OK)
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
