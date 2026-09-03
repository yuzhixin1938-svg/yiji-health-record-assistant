import { Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

export async function pingRedis(redisUrl: string, timeoutMs = 800): Promise<void> {
  const url = new URL(redisUrl);
  const port = url.port ? Number(url.port) : 6379;
  const host = url.hostname || "localhost";
  const password = decodeURIComponent(url.password);
  const useTls = url.protocol === "rediss:";

  await new Promise<void>((resolve, reject) => {
    const socket = useTls ? tlsConnect({ host, port, servername: host }) : new Socket();
    let settled = false;
    let buffer = "";

    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(timeoutMs, () => settle(new Error("Redis readiness check timed out")));
    socket.once("error", settle);
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("+PONG")) settle();
      if (buffer.startsWith("-")) settle(new Error("Redis readiness check failed"));
    });

    const ping = () => {
      if (password) {
        socket.write(`*2\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(password)}\r\n${password}\r\n`);
      }
      socket.write("*1\r\n$4\r\nPING\r\n");
    };

    if (useTls) socket.once("secureConnect", ping);
    else socket.connect(port, host, ping);
  });
}
