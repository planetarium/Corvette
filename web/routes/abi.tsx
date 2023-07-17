import { Handlers, PageProps } from "fresh/server.ts";
import Layout from "~/components/Layout.tsx";
import ListAbi, { type AbiEntry } from "~/islands/ListAbi.tsx";

interface AbiResponse {
  [hash: string]: Omit<AbiEntry, "hash">;
}

const fetchAbis = (): Promise<AbiResponse> => {
  return fetch("http://localhost:8000/abi", {
    method: "POST",
  }).then((res) => res.json());
};

const toAbiEntries = (resp: AbiResponse): AbiEntry[] => {
  return Object.entries(resp).map(([hash, values]) => ({
    hash,
    ...values,
  }));
};

export const handler: Handlers<AbiEntry[]> = {
  async GET(_req, ctx) {
    return await ctx.render(toAbiEntries(await fetchAbis()));
  },
};

export default (props: PageProps<AbiEntry[]>) => {
  return (
    <Layout title="ABI">
      <ListAbi entries={props.data} />
    </Layout>
  );
};
