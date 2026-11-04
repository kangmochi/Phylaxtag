import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config";
import { NETWORK_MESSAGE, rpcView } from "./rpc";

const CONFIG: AppConfig = {
  contractId: "phylaxtag.testnet",
  rpcUrl: "https://primary.example",
  rpcFallbackUrl: "https://fallback.example",
  networkId: "testnet",
  explorerTxUrl: (hash) => `https://explorer.test/${hash}`,
};

/** A well-formed view result whose payload is the JSON number 1. */
function okBody(): string {
  return JSON.stringify({ jsonrpc: "2.0", id: "phylaxtag", result: { result: btoa("1") } });
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RPC fallback", () => {
  it("retries once on HTTP 429 and returns the second node's answer", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return Promise.resolve(url === CONFIG.rpcUrl ? jsonResponse("{}", 429) : jsonResponse(okBody()));
    });

    await expect(rpcView(CONFIG, "get_asset", { token_id: "EB-001" })).resolves.toBe(1);
    expect(calls).toEqual([CONFIG.rpcUrl, CONFIG.rpcFallbackUrl]);
  });

  it("retries once when the first node cannot be reached", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      if (url === CONFIG.rpcUrl) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve(jsonResponse(okBody()));
    });

    await expect(rpcView(CONFIG, "get_asset", { token_id: "EB-001" })).resolves.toBe(1);
    expect(calls).toEqual([CONFIG.rpcUrl, CONFIG.rpcFallbackUrl]);
  });

  it("retries once when the first node answers DEPRECATED", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      if (url === CONFIG.rpcUrl) {
        return Promise.resolve(jsonResponse("This endpoint is DEPRECATED, use another node"));
      }
      return Promise.resolve(jsonResponse(okBody()));
    });

    await expect(rpcView(CONFIG, "get_asset", { token_id: "EB-001" })).resolves.toBe(1);
    expect(calls).toEqual([CONFIG.rpcUrl, CONFIG.rpcFallbackUrl]);
  });

  it("does not retry a contract error", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return Promise.resolve(jsonResponse(JSON.stringify({ error: { data: "Token not found" } })));
    });

    await expect(rpcView(CONFIG, "get_asset", { token_id: "EB-999" })).rejects.toThrow("Token not found");
    expect(calls).toEqual([CONFIG.rpcUrl]);
  });

  it("reports a plain network message when every node fails", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    await expect(rpcView(CONFIG, "get_asset", { token_id: "EB-001" })).rejects.toThrow(NETWORK_MESSAGE);
  });

  it("tries the default second node when the config omits one", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return Promise.resolve(url === CONFIG.rpcUrl ? jsonResponse("{}", 429) : jsonResponse(okBody()));
    });

    const configWithoutFallback: AppConfig = { ...CONFIG, rpcFallbackUrl: undefined };
    await expect(rpcView(configWithoutFallback, "get_asset", { token_id: "EB-001" })).resolves.toBe(1);
    expect(calls).toEqual([CONFIG.rpcUrl, "https://rpc.testnet.fastnear.com"]);
  });
});
