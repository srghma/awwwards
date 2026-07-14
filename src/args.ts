import { parseArgs } from "node:util";

export interface ScraperConfig {
  headless: boolean;
  connectUrl: string | null;
  pages: number;
  type: "sotd" | "nominees";
}

/**
 * Functional parser for CLI arguments using standard parseArgs.
 */
export const parseConfig = (args: string[]): ScraperConfig => {
  const { values } = parseArgs({
    args,
    options: {
      headless: {
        type: "boolean",
        default: true,
      },
      "no-headless": {
        type: "boolean",
      },
      connect: {
        type: "string",
      },
      pages: {
        type: "string",
        default: "1",
      },
      type: {
        type: "string",
        default: "sotd",
      },
    },
    strict: false,
  });

  // Handle the headless and no-headless combination
  let headless = values.headless === false ? false : true;
  if (values["no-headless"] === true) {
    headless = false;
  }

  const connectUrl = typeof values.connect === "string" ? values.connect : null;
  const pages = Math.max(1, parseInt(typeof values.pages === "string" ? values.pages : "1", 10) || 1);

  const typeInput = (typeof values.type === "string" ? values.type.toLowerCase() : "sotd");
  const type: "sotd" | "nominees" = typeInput === "nominees" || typeInput === "nominee" ? "nominees" : "sotd";

  return {
    headless,
    connectUrl,
    pages,
    type,
  };
};
