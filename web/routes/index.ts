export const handler = (req: Request) =>
  Response.redirect(`${new URL(req.url).origin}/abi`);
