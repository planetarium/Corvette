import { Handlers, PageProps } from "fresh/server.ts";
import { Layout } from "~/components/Layout.tsx";
import { ListSources, type SourceEntry } from "~/islands/ListSources.tsx";

import { ApiUrlEnvKey } from "../../constants.ts";
import { combinedEnv } from "../../runHelpers.ts";

const fetchSources = (): Promise<SourceEntry[]> => {
  return fetch(`${combinedEnv[ApiUrlEnvKey]}/sources`, {
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
      <ListSources entries={props.data} apiUrl={combinedEnv[ApiUrlEnvKey]} />
    </Layout>
  );
};
