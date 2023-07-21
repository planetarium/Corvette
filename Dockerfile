FROM denoland/deno:alpine-1.35.2 as common-builder
WORKDIR /Corvette
COPY . .
RUN deno task prisma-generate

FROM denoland/deno:distroless-1.35.2 as common
WORKDIR /Corvette
COPY --from=common-builder /Corvette /Corvette

# temporary --unsafely-ignore-certificate-errors due to having to use dataproxy
FROM common as observer
RUN deno cache observer.ts
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--unsafely-ignore-certificate-errors", "observer.ts" ]

FROM common as emitter
RUN deno cache emitter.ts
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--unsafely-ignore-certificate-errors", "emitter.ts" ]

FROM common as api
RUN deno cache api.ts
EXPOSE 8000
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--unsafely-ignore-certificate-errors", "api.ts" ]

FROM denoland/deno:distroless-1.35.2 as web
WORKDIR /Corvette
COPY . .
RUN deno cache web/main.ts
EXPOSE 3000
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "web/main.ts" ]

FROM common-builder as dataproxy-builder
RUN apk add openssl && \
  openssl req -x509 -nodes -days 3650 -subj  "/CN=localhost" -newkey rsa:4096 -keyout dev.key -out dev.crt && \
  awk '/datasource[[:space:]]+[^[:space:]]+[[:space:]]*\{/{ print; print "  provider = \"postgresql\""; flag=1; noprint=1 } /}/ { flag=0 } (!flag || !/provider[[:space:]]*=/) { if (!noprint) print; noprint=0 }' \
  prisma/schema.prisma > /schema.prisma

FROM common-builder as dataproxy
COPY --from=dataproxy-builder /Corvette/dev.key /Corvette/dev.crt /Corvette/
COPY --from=dataproxy-builder /schema.prisma /Corvette/prisma/schema.prisma
RUN ls /Corvette/generated && false && deno run --allow-env --allow-read --allow-write --allow-run dataproxy.ts generate
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-write", "--allow-net", "--unsafely-ignore-certificate-errors", "dataproxy.ts" ]
