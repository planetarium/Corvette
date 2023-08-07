import { LogLevels } from "std/log/levels.ts";

import { Handlers, PageProps, Status } from "fresh/server.ts";

import { Layout } from "~/components/Layout.tsx";
import { ListSources, type SourceEntry } from "~/islands/ListSources.tsx";
import { getCookieString, getServerSideUrl, logRequest } from "~/util.ts";

export const handler: Handlers<SourceEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(getServerSideUrl("/api/sources/"), {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      logRequest(LogLevels.ERROR, req, ctx, Status.InternalServerError, "Failed to retrieve source entries")
      throw new Error(await res.text());
    }
    logRequest(LogLevels.INFO, req, ctx, Status.OK)
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
