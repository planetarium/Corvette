FROM denoland/deno:alpine-1.35.2 as common
WORKDIR /Corvette
COPY . .
RUN apk add npm && \
  corepack enable && \
  awk '/generator[[:space:]]+[^[:space:]]+[[:space:]]*\{/{ print; print "  binaryTargets = [\"native\", \"linux-musl\"]"; next }1' \
  prisma/schema.prisma > prisma/schema.prisma.new && \
  awk '/datasource[[:space:]]+[^[:space:]]+[[:space:]]*\{/{ print; print "  provider = \"postgresql\""; flag=1; noprint=1 } /}/ { flag=0 } (!flag || !/provider[[:space:]]*=/) { if (!noprint) print; noprint=0 }' \
  prisma/schema.prisma.new > prisma/schema.prisma && \
  rm prisma/schema.prisma.new && \
  deno task prisma-generate

# temporary --unsafely-ignore-certificate-errors due to having to use dataproxy
FROM common as observer-builder
RUN deno cache observer.ts

FROM denoland/deno:distroless-1.35.2 as observer
WORKDIR /Corvette
COPY --from=observer-builder /Corvette /Corvette
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--unsafely-ignore-certificate-errors", "observer.ts" ]

FROM common as emitter-builder
RUN deno cache emitter.ts

FROM denoland/deno:distroless-1.35.2 as emitter
WORKDIR /Corvette
COPY --from=emitter-builder /Corvette /Corvette
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--unsafely-ignore-certificate-errors", "emitter.ts" ]

FROM common as api-builder
RUN deno cache api.ts

FROM denoland/deno:distroless-1.35.2 as api
WORKDIR /Corvette
COPY --from=api-builder /Corvette /Corvette
ENV API_URL="http://0.0.0.0:8000"
EXPOSE 8000
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--unsafely-ignore-certificate-errors", "api.ts" ]

FROM common as web-builder
WORKDIR /Corvette/web
ARG DENO_DEPLOYMENT_ID
RUN apk add git && \
  echo "DENO_DEPLOYMENT_ID=$(git rev-parse HEAD | cut -c -7)-$(date +%s)" > .env && \
  [ ! -z "$DENO_DEPLOYMENT_ID" ] && echo "DENO_DEPLOYMENT_ID=$DENO_DEPLOYMENT_ID" > .env ; \
  deno cache main.ts && \
  deno cache ../scripts/run-with-env.ts

FROM denoland/deno:distroless-1.35.2 as web
WORKDIR /Corvette/web
COPY --from=web-builder /Corvette /Corvette
ENV WEBUI_URL="http://0.0.0.0:3000"
EXPOSE 3000
ENTRYPOINT [ "deno", "run", "--allow-read", "--allow-env", "--allow-sys", "--allow-run", "../scripts/run-with-env.ts", "deno", "run", "--allow-env", "--allow-read", "--allow-write", "--allow-net", "--allow-run", "main.ts" ]

FROM alpine:3.18.2 as dataproxy-builder
WORKDIR /Corvette
RUN apk add openssl && \
  openssl req -x509 -nodes -days 3650 -subj  "/CN=localhost" -newkey rsa:4096 -keyout dev.key -out dev.crt

FROM common as dataproxy
COPY --from=dataproxy-builder /Corvette/dev.key /Corvette/dev.crt /Corvette/
RUN apk add libssl1.1 && \
  deno run --allow-env --allow-read --allow-write --allow-run dataproxy.ts generate
EXPOSE 8088
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-write", "--allow-net", "--allow-run", "--unsafely-ignore-certificate-errors=localhost", "dataproxy.ts" ]
