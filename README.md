<div align="center">
  
# Corvette
*scouts for events you are looking for on networks compatible with Ethereum
JSON-RPC API.*
</div>

Corvette is an EVM event monitoring and indexing service, written for Deno
TypeScript runtime for effortless deployments.


## Prerequistes

To run Corvette, you must have Deno and Node.js with corepack enabled installed
(for Prisma client generation, until Prisma supports Deno natively.)

* Install instructions for Deno:
  https://deno.land/manual/getting_started/installation
  * Deno is essentially a single binary executable.
* Install instructions for Node.js:
  https://nodejs.org/en/download/package-manager
  * After installing Node.js, you have to enable `corepack` to have `yarn`
    available: https://nodejs.org/api/corepack.html#enabling-the-feature
  * Depending on your OS, your Node.js installation may not have `corepack`
    included. In that case, you must install `yarn` separately with your
    package manager.

If you intend to run the components without `deno task dev`, you must apply the
database migrations to your DB. Adjust the database provider in
`prisma/prisma/schema.prisma`, copy the configuration from the example
`.env.example` to `.env`, and configure `DATABASE_URL` accordingly. Only SQLite
and PostgreSQL has been tested at the moment.

After database configuration, run `deno task prisma db push`. Your database
will be populated with required tables.


## Running the application for development

A convenience script (`dev.ts`) for running all the components (except for web
at the moment) is provided, along with a deno task (`deno task dev`) that runs
this script with required permissions. After configuring `.env`, start the
components with `deno task dev`. The database will automatically be connected
with the default configuration. The script will also launch an instance of an
embedded AMQP broker (https://deno.land/x/lop/mod.ts) and a webhook receiver
for development (`testWebhookReceiver.ts`) on http://localhost:8888.

The web component can be started with `deno task dev-web`.

The components will be started using the configuration defined in `.env` file
by default. The configuration may also be overrided by providing the
environment variables in the command line (such as
`BLOCK_FINALITY=finalized deno task dev`.)


## Running components independently & for production

The components (`observer.ts`, `emitter.ts`, `api.ts`, `web/main.ts`) can be
started independently, by calling them with `deno run`. Refer to `Dockerfile`
for each components' minimum required permissions. Also, multiple instances
of the same components sharing the same network, DB, and message queue may also
be run simultaneously to achieve failsafe and/or load balancing.

Before running the components, you must generate the Prisma client. You must do
this each time you change the `prisma/prisma/schema.prisma` file or Prisma
version. Generate the client with `deno task prisma generate`. You must also
prepare the database and configure the components accordingly.

You also need an AMQP 0-9-1 compliant message broker (such as RabbitMQ.) For
testing, you may also use [lop](https://deno.land/x/lop/mod.ts), which is run
when running the application with `deno task dev`:
`deno run -A https://deno.land/x/lop/mod.ts`.

To configure each of the components with different configurations, you may need
multiple copies of the application directory, or you may also provide the
configuration as environment variables.

You can run each components like the following:
`deno run -A observer.ts`.


## Building docker images and running with docker-compose

You may also run the application with Docker. A `Dockerfile` along with
`docker-compose.yml` is provided for suggesting image building procedures and
container composition. You may build the images with `docker compose build`.
A `VERSION` environment variable can be specified to set the version metadata
and the tag version for the images. The images will be built with the tag
`ghcr.io/planetarium/corvette-*`.

Then, you may run the containers from the images with `docker compose up`. By
default, an instance of `PostgreSQL` and `RabbitMQ` will be brought up along
with the components, with the data in `docker-compose-data` directory.

You may also see and modify the composition of the containers in
`docker-compose.yml` file. A prebuilt docker image of each of the versions and
commits in the `main` branch will be available in the [GitHub Container
Registry](
https://github.com/orgs/planetarium/packages?ecosystem=container):

* https://github.com/planetarium/Corvette/pkgs/container/corvette-observer
* https://github.com/planetarium/Corvette/pkgs/container/corvette-emitter
* https://github.com/planetarium/Corvette/pkgs/container/corvette-api
* https://github.com/planetarium/Corvette/pkgs/container/corvette-web

To use these images with the provided `docker-compose.yml` file, remove the
`build` sections of each of the containers and replace the tag with the
published tags. Note that these containers are made to use PostgreSQL for the
database.
