import assert from "node:assert/strict";
import { createServer } from "node:net";
import { after, describe, it } from "node:test";
import { pingRedis } from "../src/health/redis-health.js";

const servers: Array<{ close: () => void }> = [];

after(() => {
  for (const server of servers) server.close();
});

async function fakeRedisServer(response: string): Promise<number> {
  const server = createServer((socket) => {
    socket.on("data", () => socket.write(response));
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return address.port;
}

describe("redis readiness ping", () => {
  it("resolves when Redis replies PONG", async () => {
    const port = await fakeRedisServer("+PONG\r\n");
    await pingRedis(`redis://127.0.0.1:${port}`, 500);
  });

  it("rejects when Redis returns an error", async () => {
    const port = await fakeRedisServer("-NOAUTH Authentication required.\r\n");
    await assert.rejects(() => pingRedis(`redis://127.0.0.1:${port}`, 500));
  });
});
