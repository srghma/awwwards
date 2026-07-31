import { appendFileSync, writeFileSync } from "node:fs";

export interface X6Logger {
  filePath: string;
  logApiCall(opts: {
    operation: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    requestBody?: unknown;
    status?: number;
    responseBody?: unknown;
    error?: unknown;
  }): void;
}

export const createX6Logger = (filePath: string): X6Logger => {
  try {
    writeFileSync(filePath, `=== x6 API Log Started at ${new Date().toISOString()} ===\n\n`);
  } catch (e) {
    console.warn(`Could not initialize log file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    filePath,
    logApiCall(opts) {
      const timestamp = new Date().toISOString();
      const border = "=".repeat(60);
      const lines = [
        border,
        `[${timestamp}] OPERATION: ${opts.operation}`,
        `REQUEST: ${opts.method} ${opts.url}`,
      ];
      if (opts.headers) {
        lines.push(`REQUEST HEADERS: ${JSON.stringify(opts.headers)}`);
      }
      if (opts.requestBody !== undefined) {
        lines.push(`REQUEST BODY:\n${typeof opts.requestBody === "string" ? opts.requestBody : JSON.stringify(opts.requestBody, null, 2)}`);
      }
      if (opts.status !== undefined) {
        lines.push(`RESPONSE STATUS: ${opts.status}`);
      }
      if (opts.responseBody !== undefined) {
        const formatted = typeof opts.responseBody === "string"
          ? (opts.responseBody.startsWith("{") || opts.responseBody.startsWith("[")
            ? (() => { try { return JSON.stringify(JSON.parse(opts.responseBody), null, 2); } catch { return opts.responseBody; } })()
            : opts.responseBody)
          : JSON.stringify(opts.responseBody, null, 2);
        lines.push(`RESPONSE BODY:\n${formatted}`);
      }
      if (opts.error !== undefined) {
        lines.push(`ERROR: ${opts.error instanceof Error ? opts.error.stack || opts.error.message : String(opts.error)}`);
      }
      lines.push(border + "\n");
      try {
        appendFileSync(filePath, lines.join("\n"));
      } catch {
        // Ignore write failures
      }
    },
  };
};
