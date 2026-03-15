import { readFile } from "node:fs/promises";

export const DEFAULT_MCP_URL = "https://mcp.mcd.cn";
export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_SERVER_NAME = "mcd-mcp";

export interface CliConfig {
  token: string;
  url: string;
  protocolVersion: string;
  serverName: string;
}

export interface KeyValuePair {
  key: string;
  value: string;
}

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
  }
}

export class ConfigError extends CliError {
  constructor(message: string) {
    super(message, 2);
  }
}

export function resolveConfig({
  flags,
  env,
  allowPlaceholderToken = false,
}: {
  flags: Partial<CliConfig>;
  env: NodeJS.ProcessEnv;
  allowPlaceholderToken?: boolean;
}): CliConfig {
  const token = flags.token ?? env.MCD_MCP_TOKEN ?? env.MCD_TOKEN ?? "";
  const config: CliConfig = {
    token: token || (allowPlaceholderToken ? "YOUR_MCP_TOKEN" : ""),
    url: flags.url ?? env.MCD_MCP_URL ?? DEFAULT_MCP_URL,
    protocolVersion:
      flags.protocolVersion ??
      env.MCD_MCP_PROTOCOL_VERSION ??
      DEFAULT_PROTOCOL_VERSION,
    serverName:
      flags.serverName ?? env.MCD_MCP_SERVER_NAME ?? DEFAULT_SERVER_NAME,
  };

  if (!config.token && !allowPlaceholderToken) {
    throw new ConfigError(
      "Missing MCP token. Set MCD_MCP_TOKEN or MCD_TOKEN, or pass --token.",
    );
  }

  return config;
}

export function parseKeyValue(input: string, flagName: string): KeyValuePair {
  const index = input.indexOf("=");
  if (index <= 0) {
    throw new UsageError(`${flagName} expects KEY=VALUE, got "${input}".`);
  }

  return {
    key: input.slice(0, index),
    value: input.slice(index + 1),
  };
}

export function resolveJsonBody({
  inlineJson,
  bodyFileContent,
  defaultValue,
}: {
  inlineJson: string | null;
  bodyFileContent: string | null;
  defaultValue: unknown;
}): unknown {
  if (inlineJson != null && bodyFileContent != null) {
    throw new UsageError("Use only one of --json and --body-file.");
  }

  if (inlineJson == null && bodyFileContent == null) {
    return defaultValue;
  }

  const rawJson = inlineJson ?? bodyFileContent;
  if (rawJson == null) {
    return defaultValue;
  }

  try {
    return JSON.parse(rawJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(`Invalid JSON body: ${message}`);
  }
}

export async function loadBodyFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
