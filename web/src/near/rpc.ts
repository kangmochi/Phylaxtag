import type { AppConfig } from "../config";
import { parseLosslessJson } from "./parse";

interface RpcError {
  message?: string;
  data?: unknown;
}

/** Default second node, used only when the first one fails (task B1). */
export const DEFAULT_FALLBACK_RPC = "https://rpc.testnet.fastnear.com";

export const NETWORK_MESSAGE = "We could not reach the NEAR testnet. Check your connection and try again.";

/** An error a different node could fix: network failure, 429, 5xx, or a deprecated node. */
export class RpcTransportError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "RpcTransportError";
    this.retryable = retryable;
  }
}

function looksDeprecated(text: string): boolean {
  return /DEPRECATED/i.test(text);
}

async function postView(url: string, body: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    throw new RpcTransportError(NETWORK_MESSAGE, true);
  }

  const text = await response.text().catch(() => "");

  if (response.status === 429) {
    throw new RpcTransportError("The NEAR node is rate limiting requests. Trying another node.", true);
  }
  if (looksDeprecated(text)) {
    throw new RpcTransportError("This NEAR node is deprecated. Trying another node.", true);
  }
  if (!response.ok) {
    throw new RpcTransportError(`The NEAR node returned HTTP ${response.status}.`, response.status >= 500);
  }

  let parsed: { result?: { result?: number[] | string }; error?: RpcError };
  try {
    parsed = JSON.parse(text) as { result?: { result?: number[] | string }; error?: RpcError };
  } catch {
    throw new RpcTransportError("The NEAR node returned a response we could not read. Trying another node.", true);
  }

  if (parsed.error) {
    const detail = typeof parsed.error.data === "string" ? parsed.error.data : parsed.error.message;
    // A contract error (a panic) is not fixed by asking another node.
    throw new Error(detail || "RPC view failed");
  }
  const raw = parsed.result?.result;
  if (raw === undefined) {
    throw new Error("RPC view returned no result");
  }
  return parseLosslessJson(decodeResult(raw));
}

/**
 * Call VITE_RPC_URL first, then VITE_RPC_FALLBACK_URL once, only for failures
 * another node could fix (network error, HTTP 429/5xx, deprecated node).
 */
export async function rpcView(
  config: AppConfig,
  method: string,
  args: Record<string, unknown>,
  contractId: string = config.contractId,
): Promise<unknown> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: "phylaxtag",
    method: "query",
    params: {
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: method,
      args_base64: btoa(JSON.stringify(args)),
    },
  });

  const urls: string[] = [];
  for (const url of [config.rpcUrl, config.rpcFallbackUrl ?? DEFAULT_FALLBACK_RPC]) {
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }

  let lastError: Error = new Error("RPC view failed");
  for (const [index, url] of urls.entries()) {
    try {
      return await postView(url, body);
    } catch (caught) {
      lastError = caught instanceof Error ? caught : new Error(String(caught));
      const retryable = caught instanceof RpcTransportError ? caught.retryable : false;
      if (!retryable || index === urls.length - 1) {
        break;
      }
    }
  }
  throw lastError;
}

function decodeResult(raw: number[] | string): string {
  if (typeof raw === "string") {
    const binary = atob(raw);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return new TextDecoder().decode(Uint8Array.from(raw));
}
