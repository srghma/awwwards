import { parseArgs } from "node:util";

export interface ScraperConfig {
  headless: boolean;
  connectUrl: string | null;
  reuseExisting: boolean;
  remoteDebuggingPort: number;
  userDataDir: string | null;
  workerId: string;
  windowIndex: number;
  pages: number;
  type: "sotd" | "nominees";
  targetUrl: string | null;
  refresh: boolean;
  continueExisting: boolean;
  fromEnd: boolean;
}

/**
 * Functional parser for CLI arguments using standard parseArgs.
 */
export const parseConfig = (args: string[]): ScraperConfig => {
  const positionalUrl = args.find(arg => arg.startsWith("http")) ?? null;
  const parseArgsInput = positionalUrl ? args.filter(arg => arg !== positionalUrl) : args;
  const { values } = parseArgs({
    args: parseArgsInput,
    options: {
      headless: {
        type: "boolean",
        default: false,
      },
      "no-headless": {
        type: "boolean",
      },
      connect: {
        type: "string",
      },
      "reuse-existing": { type: "boolean", default: false },
      "remote-debugging-port": { type: "string" },
      "user-data-dir": { type: "string" },
      "worker-id": { type: "string" },
      "window-index": { type: "string", default: "0" },
      url: {
        type: "string",
      },
      pages: {
        type: "string",
        default: "9999",
      },
      type: {
        type: "string",
        default: "sotd",
      },
      refresh: {
        type: "boolean",
        default: false,
      },
      continue: {
        type: "boolean",
        default: false,
      },
      "from-end": {
        type: "boolean",
        default: false,
      },
    },
    strict: false,
  });

  // Handle the headless and no-headless combination
  let headless = values.headless === true;
  if (values["no-headless"] === true) {
    headless = false;
  }

  const connectUrl = typeof values.connect === "string" ? values.connect : null;
  const remoteDebuggingPort = Math.max(1, parseInt(
    typeof values["remote-debugging-port"] === "string"
      ? values["remote-debugging-port"]
      : process.env["CHROME_REMOTE_DEBUGGING_PORT"] ?? process.env["AWWWARDS_REMOTE_DEBUGGING_PORT"] ?? "9222",
    10,
  ) || 9222);
  const pages = Math.max(1, parseInt(typeof values.pages === "string" ? values.pages : "1", 10) || 1);

  const typeInput = (typeof values.type === "string" ? values.type.toLowerCase() : "sotd");
  const type: "sotd" | "nominees" = typeInput === "nominees" || typeInput === "nominee" ? "nominees" : "sotd";

  return {
    headless,
    connectUrl,
    reuseExisting: values["reuse-existing"] === true,
    remoteDebuggingPort,
    userDataDir: typeof values["user-data-dir"] === "string" ? values["user-data-dir"] : null,
    workerId: typeof values["worker-id"] === "string" && values["worker-id"] ? values["worker-id"] : `worker-${process.pid}`,
    windowIndex: Math.max(0, parseInt(typeof values["window-index"] === "string" ? values["window-index"] : "0", 10) || 0),
    pages,
    type,
    targetUrl: typeof values.url === "string" ? values.url : positionalUrl,
    refresh: values.refresh === true,
    continueExisting: values.continue === true,
    fromEnd: values["from-end"] === true,
  };
};
