#!/usr/bin/env node
/* global WebSocket, console, process */

const endpoint = process.argv[2] || "ws://127.0.0.1:9222/session";
const socket = new WebSocket(endpoint);
const pending = new Map();
let nextID = 1;

function command(method, params = {}) {
  const id = nextID++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function printableRemoteValue(remoteValue) {
  if (!remoteValue || typeof remoteValue !== "object") return remoteValue;
  if ("value" in remoteValue) return remoteValue.value;
  return remoteValue.type;
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.type === "error") {
    waiter.reject(
      new Error(`${message.error}: ${message.message || "unknown error"}`),
    );
  } else {
    waiter.resolve(message.result);
  }
});

socket.addEventListener("open", async () => {
  try {
    const session = await command("session.new", {
      capabilities: {
        alwaysMatch: {
          acceptInsecureCerts: true,
          "moz:firefoxOptions": {},
        },
      },
    });
    console.log(
      JSON.stringify(
        {
          browserName: session.capabilities?.browserName,
          browserVersion: session.capabilities?.browserVersion,
        },
        null,
        2,
      ),
    );

    const { contexts = [] } = await command("browsingContext.getTree");
    const queue = [...contexts];
    const flat = [];
    while (queue.length) {
      const context = queue.shift();
      flat.push(context);
      queue.push(...(context.children || []));
    }

    const diagnostics = [];
    for (const context of flat) {
      try {
        const result = await command("script.evaluate", {
          expression: `({
            href: String(globalThis.location?.href || ""),
            title: String(globalThis.document?.title || ""),
            hasZotero: typeof globalThis.Zotero !== "undefined",
            hasPlugin: Boolean(globalThis.Zotero?.ContextTranslate)
          })`,
          target: { context: context.context },
          awaitPromise: true,
          resultOwnership: "none",
          serializationOptions: {
            maxObjectDepth: 2,
            maxDomDepth: 0,
          },
        });
        const values = {};
        for (const [key, value] of result.result?.value || []) {
          values[key] = printableRemoteValue(value);
        }
        diagnostics.push({ context: context.context, ...values });
      } catch (error) {
        diagnostics.push({
          context: context.context,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    console.log(JSON.stringify(diagnostics, null, 2));
    await command("session.end");
    socket.close();
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    socket.close();
    process.exitCode = 1;
  }
});

socket.addEventListener("error", (event) => {
  console.error(event.message || "WebSocket connection failed");
  process.exitCode = 1;
});
