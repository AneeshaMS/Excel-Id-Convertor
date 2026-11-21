export type WorkerRequest = {
  buffer: ArrayBuffer;
  fileName: string;
};

export type WorkerResponse =
  | { type: "success"; csv: string; recordCount: number; elapsedMs: number; generatedAt: string }
  | { type: "error"; message: string };
