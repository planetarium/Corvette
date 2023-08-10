import { LogLevels } from "std/log/levels.ts";

import { type Handlers, type PageProps, Status } from "fresh/server.ts";

import { getCookieString, getServerSideUrl, logRequest } from "~/util.ts";

import { Layout } from "~/components/Layout.tsx";
import { ListSources, type SourceEntry } from "~/islands/ListSources.tsx";

export const handler: Handlers<SourceEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(getServerSideUrl("/api/sources/"), {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      logRequest(
        LogLevels.ERROR,
        req,
        ctx,
        Status.InternalServerError,
        "Failed to retrieve source entries",
      );
      throw new Error(await res.text());
    }
    logRequest(LogLevels.INFO, req, ctx, Status.OK);
    return ctx.render(await res.json());
  },
};

export default (props: PageProps<SourceEntry[]>) => {
  return (
    <Layout title="Event Sources">
      <ListSources entries={props.data} />
    </Layout>
  );
};
