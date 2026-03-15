import {
  CliConfig,
  CliError,
  DEFAULT_MCP_URL,
  DEFAULT_PROTOCOL_VERSION,
  DEFAULT_SERVER_NAME,
  KeyValuePair,
  UsageError,
  formatJson,
  loadBodyFile,
  parseKeyValue,
  resolveConfig,
  resolveJsonBody,
} from "./core.js";
import { KNOWN_TOOLS, KNOWN_TOOLS_BY_NAME } from "./knownTools.js";
import {
  FetchLike,
  McpClient,
  McpHttpError,
  McpProtocolError,
  McpToolCallResult,
  McpToolDefinition,
} from "./mcp.js";

const HELP_TEXT = `mcd - CLI for the McDonald's China MCP server

Usage:
  mcd config [options]
  mcd info [options]
  mcd tools [options]
  mcd tools --known
  mcd call <toolName> [options]
  mcd rpc <method> [options]

Shared options:
  --token <token>
  --url <url>
  --protocol-version <version>
  --server-name <name>
  --header key=value
  --json '{"foo":"bar"}'
  --body-file <path>
  --raw
  --verbose
  --known
  --help
`;

interface WritableLike {
  write(chunk: string): unknown;
}

interface ParsedFlags extends Partial<CliConfig> {
  header: KeyValuePair[];
  raw: boolean;
  verbose: boolean;
  known: boolean;
  help: boolean;
  json?: string;
  bodyFile?: string;
}

interface ParsedArgs {
  positional: string[];
  flags: ParsedFlags;
}

interface RunCliOptions {
  argv: string[];
  env: NodeJS.ProcessEnv;
  stdout: WritableLike;
  stderr: WritableLike;
  fetchImpl: FetchLike;
}

function createStdWriter(stream: WritableLike): (line: string) => unknown {
  return (line) => stream.write(`${line}\n`);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: ParsedFlags = {
    header: [],
    raw: false,
    verbose: false,
    known: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    if (token === "--raw") {
      flags.raw = true;
      continue;
    }
    if (token === "--verbose") {
      flags.verbose = true;
      continue;
    }
    if (token === "--known") {
      flags.known = true;
      continue;
    }
    if (token === "--help") {
      flags.help = true;
      continue;
    }

    const next = argv[index + 1];
    if (next == null) {
      throw new UsageError(`Missing value for ${token}.`);
    }

    switch (token) {
      case "--token":
        flags.token = next;
        break;
      case "--url":
        flags.url = next;
        break;
      case "--protocol-version":
        flags.protocolVersion = next;
        break;
      case "--server-name":
        flags.serverName = next;
        break;
      case "--json":
        flags.json = next;
        break;
      case "--body-file":
        flags.bodyFile = next;
        break;
      case "--header":
        flags.header.push(parseKeyValue(next, "--header"));
        break;
      default:
        throw new UsageError(`Unknown flag "${token}".`);
    }

    index += 1;
  }

  return {
    positional,
    flags,
  };
}

function renderToolsTable(
  tools: Array<Pick<McpToolDefinition, "name"> & Partial<McpToolDefinition>>,
): string {
  const rows = tools.map((tool) => ({
    name: tool.name,
    title: tool.title ?? "",
    description: tool.description ?? "",
  }));

  const widths = {
    name: Math.max(...rows.map((row) => row.name.length), 4),
    title: Math.max(...rows.map((row) => row.title.length), 5),
  };

  const header = [
    "NAME".padEnd(widths.name),
    "TITLE".padEnd(widths.title),
    "DESCRIPTION",
  ].join("  ");

  const lines = rows.map((row) =>
    [
      row.name.padEnd(widths.name),
      row.title.padEnd(widths.title),
      row.description,
    ].join("  "),
  );

  return [header, ...lines].join("\n");
}

function printConfig(out: (line: string) => unknown, config: CliConfig): void {
  out(
    formatJson({
      mcpServers: {
        [config.serverName]: {
          type: "streamablehttp",
          url: config.url,
          headers: {
            Authorization: `Bearer ${config.token}`,
          },
        },
      },
    }),
  );
}

function formatToolResult(result: McpToolCallResult): Record<string, unknown> {
  return {
    content: result.content ?? [],
    structuredContent: result.structuredContent ?? null,
    isError: result.isError ?? false,
    meta: result._meta ?? null,
  };
}

function createClient({
  flags,
  env,
  fetchImpl,
  log,
}: {
  flags: ParsedFlags;
  env: NodeJS.ProcessEnv;
  fetchImpl: FetchLike;
  log: (line: string) => unknown;
}): {
  config: CliConfig;
  client: McpClient;
} {
  const config = resolveConfig({ flags, env });
  return {
    config,
    client: new McpClient({
      url: config.url,
      token: config.token,
      protocolVersion: config.protocolVersion,
      clientInfo: {
        name: "mcd-mcp-cli",
        version: "0.1.0",
      },
      fetchImpl,
      extraHeaders: flags.header,
      verbose: flags.verbose,
      log,
    }),
  };
}

async function resolveParams(
  flags: ParsedFlags,
  defaultValue: unknown,
): Promise<unknown> {
  const bodyFileContent = flags.bodyFile
    ? await loadBodyFile(flags.bodyFile)
    : null;
  return resolveJsonBody({
    inlineJson: flags.json ?? null,
    bodyFileContent,
    defaultValue,
  });
}

function printRaw(
  out: (line: string) => unknown,
  rawEnabled: boolean,
  value: unknown,
  rawBody: string,
): void {
  if (rawEnabled && rawBody) {
    out(rawBody);
    return;
  }

  out(formatJson(value));
}

function printKnownHint(
  err: (line: string) => unknown,
  toolName: string,
): void {
  const tool = KNOWN_TOOLS_BY_NAME.get(toolName);
  if (!tool) {
    return;
  }
  err(formatJson(tool));
}

function printVerbose(
  err: (line: string) => unknown,
  config: CliConfig,
): void {
  err(`URL: ${config.url}`);
  err(`Protocol Version: ${config.protocolVersion}`);
}

async function withClientLifecycle<T>(
  client: McpClient,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } finally {
    await client.close();
  }
}

function getConfigDefaults(env: NodeJS.ProcessEnv): CliConfig {
  return {
    token: env.MCD_MCP_TOKEN ?? env.MCD_TOKEN ?? "",
    url: env.MCD_MCP_URL ?? DEFAULT_MCP_URL,
    protocolVersion:
      env.MCD_MCP_PROTOCOL_VERSION ?? DEFAULT_PROTOCOL_VERSION,
    serverName: env.MCD_MCP_SERVER_NAME ?? DEFAULT_SERVER_NAME,
  };
}

export async function runCli({
  argv,
  env,
  stdout,
  stderr,
  fetchImpl,
}: RunCliOptions): Promise<number> {
  const out = createStdWriter(stdout);
  const err = createStdWriter(stderr);

  try {
    const { positional, flags } = parseArgs(argv);
    const command = positional[0];

    if (!command || flags.help) {
      out(HELP_TEXT.trimEnd());
      return 0;
    }

    if (command === "config") {
      const config = resolveConfig({
        flags: {
          ...getConfigDefaults(env),
          ...flags,
        },
        env,
        allowPlaceholderToken: true,
      });
      printConfig(out, config);
      return 0;
    }

    if (command === "tools" && flags.known) {
      if (flags.raw) {
        out(formatJson(KNOWN_TOOLS));
      } else {
        out(renderToolsTable(KNOWN_TOOLS));
      }
      return 0;
    }

    if (!["info", "tools", "call", "rpc"].includes(command)) {
      throw new UsageError(`Unknown command "${command}".`);
    }

    const { config, client } = createClient({
      flags,
      env,
      fetchImpl,
      log: err,
    });

    if (flags.verbose) {
      printVerbose(err, config);
    }

    return await withClientLifecycle(client, async () => {
      if (command === "info") {
        const info = await client.initialize();
        out(
          formatJson({
            url: config.url,
            negotiatedProtocolVersion: info.protocolVersion,
            sessionId: info.sessionId,
            serverInfo: info.serverInfo,
            capabilities: info.capabilities,
          }),
        );
        return 0;
      }

      if (command === "tools") {
        const tools = await client.listTools();
        if (flags.raw) {
          out(formatJson(tools));
        } else {
          out(renderToolsTable(tools));
        }
        return 0;
      }

      if (command === "call") {
        if (positional.length < 2) {
          throw new UsageError("Usage: mcd call <toolName> [options]");
        }

        const toolName = positional[1];
        const args = (await resolveParams(flags, {})) as Record<
          string,
          unknown
        >;
        const result = await client.callTool(toolName, args);
        printRaw(
          out,
          flags.raw,
          formatToolResult(result.response.result),
          result.rawBody,
        );

        if (result.response.result.isError === true) {
          err(`Tool "${toolName}" returned isError=true.`);
          printKnownHint(err, toolName);
          return 1;
        }

        return 0;
      }

      if (positional.length < 2) {
        throw new UsageError("Usage: mcd rpc <method> [options]");
      }

      const method = positional[1];
      const params = await resolveParams(flags, null);
      const result = await client.rpc(method, params ?? undefined);
      printRaw(out, flags.raw, result.response.result, result.rawBody);
      return 0;
    });
  } catch (error) {
    if (error instanceof McpHttpError) {
      err(error.message);
      if (error.body) {
        err(error.body);
      }
      return 1;
    }

    if (error instanceof McpProtocolError) {
      err(error.message);
      if (error.details) {
        err(formatJson(error.details));
      }
      return 1;
    }

    if (error instanceof CliError) {
      err(error.message);
      return error.exitCode;
    }

    if (error instanceof Error) {
      err(error.message);
      return 1;
    }

    err(String(error));
    return 1;
  }
}
