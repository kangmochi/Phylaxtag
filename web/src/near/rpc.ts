import type { AppConfig } from "../config";
import { parseLosslessJson } from "./parse";

interface RpcError {
  message?: string;
  data?: unknown;
}

export async function rpcView(config: AppConfig, method: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "phylaxtag",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: config.contractId,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }
  const body = (await response.json()) as { result?: { result?: number[] | string }; error?: RpcError };
  if (body.error) {
    const detail = typeof body.error.data === "string" ? body.error.data : body.error.message;
    throw new Error(detail || "RPC view failed");
  }
  const raw = body.result?.result;
  if (raw === undefined) {
    throw new Error("RPC view returned no result");
  }
  return parseLosslessJson(decodeResult(raw));
}

function decodeResult(raw: number[] | string): string {
  if (typeof raw === "string") {
    const binary = atob(raw);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return new TextDecoder().decode(Uint8Array.from(raw));
}
