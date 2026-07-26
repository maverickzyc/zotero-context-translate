#!/usr/bin/env node
/* global Buffer, console, process */

import net from "node:net";

class MarionetteClient {
  constructor(port = 2828) {
    this.port = port;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.nextID = 1;
    this.pending = new Map();
  }

  async connect({ bindWindow = true } = {}) {
    await new Promise((resolve, reject) => {
      this.socket = net.createConnection(
        { port: this.port, host: "127.0.0.1" },
        resolve,
      );
      this.socket.once("error", reject);
      this.socket.on("data", (data) => this.onData(data));
    });
    await this.request("WebDriver:NewSession", {
      acceptInsecureCerts: true,
      "moz:windowless": true,
    });
    if (!bindWindow) return;
    const handles = await this.request("WebDriver:GetWindowHandles");
    const handle = Array.isArray(handles) ? handles[0] : handles?.value?.[0];
    if (!handle) {
      throw new Error("Zotero did not expose a chrome window handle");
    }
    await this.request("WebDriver:SwitchToWindow", { handle });
  }

  onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (true) {
      const separator = this.buffer.indexOf(58);
      if (separator < 0) return;
      const length = Number.parseInt(
        this.buffer.subarray(0, separator).toString(),
        10,
      );
      if (!Number.isFinite(length)) {
        throw new Error("Invalid Marionette packet length");
      }
      const start = separator + 1;
      if (this.buffer.length < start + length) return;
      const payload = JSON.parse(
        this.buffer.subarray(start, start + length).toString(),
      );
      this.buffer = this.buffer.subarray(start + length);
      if (!Array.isArray(payload)) continue;
      const [, id, error, result] = payload;
      const waiter = this.pending.get(id);
      if (!waiter) continue;
      this.pending.delete(id);
      if (error) {
        waiter.reject(
          new Error(
            `${error.error || "Marionette error"}: ${
              error.message || JSON.stringify(error)
            }\n${error.stacktrace || ""}`,
          ),
        );
      } else {
        waiter.resolve(result);
      }
    }
  }

  request(command, params = {}) {
    const id = this.nextID++;
    const payload = JSON.stringify([0, id, command, params]);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(`${Buffer.byteLength(payload)}:${payload}`);
    });
  }

  async setChromeContext() {
    await this.request("Marionette:SetContext", { value: "chrome" });
  }

  async evaluate(script, args = []) {
    const result = await this.request("WebDriver:ExecuteScript", {
      script,
      args,
      newSandbox: false,
      sandbox: null,
      filename: "zotero-context-translate-debug",
      line: 1,
      debug: false,
    });
    return result?.value;
  }

  async installTemporaryAddon(addonPath) {
    const result = await this.request("Addon:Install", {
      path: addonPath,
      temporary: true,
      allowPrivateBrowsing: false,
    });
    return result?.value;
  }

  async close() {
    try {
      await this.request("WebDriver:DeleteSession");
    } finally {
      this.socket?.end();
    }
  }
}

const installIndex = process.argv.indexOf("--install");
const installPath =
  installIndex >= 0 ? process.argv[installIndex + 1] : undefined;
const client = new MarionetteClient(2828);
try {
  await client.connect({ bindWindow: !installPath });
  if (installPath) {
    const addonID = await client.installTemporaryAddon(installPath);
    console.log(JSON.stringify({ installed: addonID }, null, 2));
    process.exitCode = addonID ? 0 : 1;
  } else {
    await client.setChromeContext();
    const result = await client.evaluate(`
      return {
        zoteroVersion: Zotero.version,
        pluginLoaded: Boolean(Zotero.ContextTranslate),
        pluginVersion: Zotero.ContextTranslate?.data?.config?.version || null,
        initialized: Boolean(Zotero.ContextTranslate?.data?.initialized),
        apiNames: Object.keys(Zotero.ContextTranslate?.api || {}),
        windowTitle: Zotero.getMainWindow()?.document?.title || ""
      };
    `);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
}
