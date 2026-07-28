# POC: chat using NATS + WebSockets

A small chat where every message is pushed through a pipeline of independent
services before being fanned out to the other clients.

## Quick start

```sh
docker compose build
docker compose up
```

then go to http://localhost:3000/. Add a hash to pick a channel, e.g.
http://localhost:3000/#lobby.

## How it works

```
browser ──ws──► server ──JetStream──► service_happy ──JetStream──► service_capslock_mode
   ▲                                                                        │
   └──────────────────── core NATS (channel.<name>) ◄───────────────────────┘
```

* **`server`** — WebSocket gateway. Subscribes each connection to
  `channel.<name>` on core NATS, and pushes chat messages into the JetStream
  pipeline.
* **`service_happy` / `service_capslock_mode`** — pipeline steps. Each consumes
  its own `service.<name>` subject, transforms the payload and forwards it to
  the next step. The last step publishes the result to `channel.<name>`, where
  every connected client picks it up.
* **`client`** — static page served by nginx.

Two kinds of delivery are used on purpose: chat fan-out is ephemeral, so it
goes over **core NATS**; the service pipeline needs at-least-once handoff, so it
goes over **JetStream** with durable consumers and explicit acks.

`"hello"` therefore comes back as `"HELLO 🙂"`.

## NATS Streaming (STAN) → JetStream

This POC originally used NATS Streaming. Both the server and the client
libraries have since been renamed or retired:

| Old | New | Status |
| --- | --- | --- |
| `nats` (npm) | [`@nats-io/transport-node`](https://www.npmjs.com/package/@nats-io/transport-node) | old package **deprecated**, "package moved" |
| `node-nats-streaming` (npm) | [`@nats-io/jetstream`](https://www.npmjs.com/package/@nats-io/jetstream) | NATS Streaming reached **end of life** |
| `nats-streaming` (Docker image) | `nats` + `--jetstream` | image marked **DEPRECATED** |
| `websocket` (npm) | [`ws`](https://www.npmjs.com/package/ws) | maintained alternative |

Practical consequences:

* There is no cluster id any more, so `CLUSTER_NAME` is gone.
* Durable subscriptions became durable **consumers** on a stream. The `SERVICES`
  stream captures `service.>` and each service owns a consumer filtered on its
  own subject.
* JetStream needs storage, hence the `nats-data` volume.

## Configuration

| Variable | Component | Default | Description |
| --- | --- | --- | --- |
| `NATS_SERVERS` | server, services | `nats://localhost:4222` | Comma-separated NATS URLs |
| `SERVER_PORT` | server | `3001` | WebSocket / health port |
| `CHANNEL_NAME` | services | `service.<name>` | Subject the service consumes |
| `WEBSOCKET_URL` | client | *(derived from page URL)* | Gateway URL used by the browser |

`WEBSOCKET_URL` is written into a generated `config.js` when the client
container starts.

## Development

The repository is an npm workspace, so a single install covers every component:

```sh
npm install
```

### Tests

```sh
npm test         # everything
npm run test:unit  # pure logic only, no Docker needed
npm run test:e2e   # full stack against a real NATS server
```

Unit tests cover subject validation, pipeline routing, the WebSocket protocol
and the client helpers. The end-to-end suite starts a throwaway JetStream
server in Docker, boots the gateway and both services in-process, and drives
them through a real WebSocket connection.

If Docker is unavailable the end-to-end suite is skipped. Point it at an
existing broker instead with:

```sh
NATS_TEST_URL=nats://127.0.0.1:4222 npm run test:e2e
```

### Layout

```
shared/    NATS plumbing + pipeline routing shared by the services
server/    WebSocket gateway
services/  pipeline steps (one directory each)
client/    static web client
test/      end-to-end suite
testing/   helpers for the end-to-end suite
```

Adding a pipeline step means creating a service directory with a `transform.js`
and adding its name to `DEFAULT_PIPELINE` in
[`server/chat-server.js`](server/chat-server.js).
