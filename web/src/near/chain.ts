export type TxPhase = "waiting" | "pending";

export interface CallRequest {
  method: string;
  args: Record<string, unknown>;
  depositYocto: string;
  gas: string;
  onPhase: (phase: TxPhase) => void;
}

export interface CallResult {
  hash: string;
  returnValue: unknown;
}

export interface Chain {
  ready(): Promise<void>;
  accountId(): string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Test build only. Production wallets ignore this. */
  useAccount(accountId: string): void;
  subscribe(listener: () => void): () => void;
  view<T>(method: string, args: Record<string, unknown>): Promise<T>;
  call(request: CallRequest): Promise<CallResult>;
}
