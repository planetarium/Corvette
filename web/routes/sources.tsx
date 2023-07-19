import { Handlers, PageProps } from "fresh/server.ts";
import { Layout } from "~/components/Layout.tsx";
import { ListSources, type SourceEntry } from "~/islands/ListSources.tsx";

const fetchSources = (): Promise<SourceEntry[]> => {
  // TODO: configuration
  return fetch("http://localhost:8000/sources", {
    method: "POST",
  }).then((res) => res.json());
};

export const handler: Handlers<SourceEntry[]> = {
  async GET(_req, ctx) {
    return await ctx.render(await fetchSources());
  },
};

export default (props: PageProps<SourceEntry[]>) => {
  return (
    <Layout title="Event Sources">
      <ListSources entries={props.data} />
    </Layout>
  );
};
