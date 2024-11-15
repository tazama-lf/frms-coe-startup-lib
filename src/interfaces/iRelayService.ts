export interface IRelay {
  relay: (data: Uint8Array) => Promise<void>;
}
