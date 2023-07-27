FROM denoland/deno:alpine-1.35.2 as common
WORKDIR /Corvette
COPY . .
RUN apk add npm && \
  corepack enable && \
  cat prisma/schema.prisma | \
  awk '/generator[[:space:]]+[^[:space:]]+[[:space:]]*\{/{ print; print "  binaryTargets = [\"native\", \"linux-musl-openssl-3.0.x\"]"; next }1' | \
  awk '/datasource[[:space:]]+[^[:space:]]+[[:space:]]*\{/{ flag=1 } /}/ { flag=0 } (flag && /provider[[:space:]]*=/) { print "  provider = \"postgresql\""; next } (flag && /directUrl[[:space:]]*=/) { next } { print }' \
  > prisma/schema.prisma.new && \
  mv prisma/schema.prisma.new prisma/schema.prisma && \
  deno task prisma format && \
  deno task prisma-generate

FROM common as observer
RUN deno cache observer.ts
# --unsafely-ignore-certificate-errors should be included to use data proxy
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--allow-ffi", "observer.ts" ]

FROM common as emitter
RUN deno cache emitter.ts
# --unsafely-ignore-certificate-errors should be included to use data proxy
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--allow-ffi", "emitter.ts" ]

FROM common as api
ENV API_URL="http://0.0.0.0:8000"
EXPOSE 8000
# --unsafely-ignore-certificate-errors should be included to use data proxy
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-net", "--allow-ffi", "api.ts" ]

FROM common as web-builder
WORKDIR /Corvette/web
ARG DENO_DEPLOYMENT_ID
RUN apk add git && \
  echo "DENO_DEPLOYMENT_ID=$(git rev-parse HEAD | cut -c -7)-$(date -u +%Y%m%d%H%M%S)" > .env && \
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
RUN awk '/datasource[[:space:]]+[^[:space:]]+[[:space:]]*\{/{ print; print "directUrl = env(\"DIRECT_URL\")" }' \
  prisma/schema.prisma > prisma/schema.prisma.new && \
  mv prisma/schema.prisma.new prisma/schema.prisma && \
  deno run --allow-env --allow-read --allow-write --allow-run dataproxy.ts generate
EXPOSE 8088
ENTRYPOINT [ "deno", "run", "--allow-env", "--allow-read", "--allow-write", "--allow-net", "--allow-run", "--unsafely-ignore-certificate-errors=localhost", "dataproxy.ts" ]
