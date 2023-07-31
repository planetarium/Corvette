import { Handlers, PageProps } from "fresh/server.ts";
import { Layout } from "~/components/Layout.tsx";
import { ListSources, type SourceEntry } from "~/islands/ListSources.tsx";
import { getCookieString, getServerSideUrl } from "~/util.ts";

export const handler: Handlers<SourceEntry[]> = {
  async GET(req, ctx) {
    const res = await fetch(getServerSideUrl("/api/sources/"), {
      credentials: "include",
      headers: { cookie: getCookieString(req) },
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
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
