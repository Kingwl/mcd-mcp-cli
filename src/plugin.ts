import {
  DEFAULT_MCP_URL,
  DEFAULT_PROTOCOL_VERSION,
  type CliConfig,
  formatJson,
} from "./core.js";
import { KNOWN_TOOLS, type KnownTool } from "./knownTools.js";
import {
  McpClient,
  McpHttpError,
  McpProtocolError,
  type FetchLike,
} from "./mcp.js";

const PLUGIN_ID = "mcd-mcp-cli";

type JsonSchema = Record<string, unknown>;

interface OpenClawToolResult {
  content: Array<Record<string, unknown>>;
  structuredContent?: unknown;
  isError?: boolean;
}

interface OpenClawToolDefinition<Params = Record<string, unknown>> {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute: (toolCallId: string, params: Params) => Promise<OpenClawToolResult>;
}

interface OpenClawPluginApi {
  config?: unknown;
  registerTool: (
    tool: OpenClawToolDefinition,
    options?: {
      optional?: boolean;
    },
  ) => void;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function getPluginEntryConfig(config: unknown): Partial<CliConfig> {
  const plugins = getNestedRecord(config, "plugins");
  const entries = getNestedRecord(plugins, "entries");
  const pluginEntry = entries?.[PLUGIN_ID];
  const entryRecord = isRecord(pluginEntry) ? pluginEntry : null;
  const pluginConfig = getNestedRecord(entryRecord, "config");

  return {
    token:
      (typeof pluginConfig?.token === "string" && pluginConfig.token) ||
      process.env.MCD_MCP_TOKEN ||
      process.env.MCD_TOKEN ||
      "",
    url:
      (typeof pluginConfig?.url === "string" && pluginConfig.url) ||
      process.env.MCD_MCP_URL ||
      DEFAULT_MCP_URL,
    protocolVersion:
      (typeof pluginConfig?.protocolVersion === "string" &&
        pluginConfig.protocolVersion) ||
      process.env.MCD_MCP_PROTOCOL_VERSION ||
      DEFAULT_PROTOCOL_VERSION,
    serverName: PLUGIN_ID,
  };
}

function getFetch(): FetchLike {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("Global fetch is not available in this OpenClaw runtime.");
  }

  return globalThis.fetch.bind(globalThis) as FetchLike;
}

function formatErrorContent(error: unknown): OpenClawToolResult {
  if (error instanceof McpHttpError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error.body
            ? `${error.message}\n\n${error.body}`
            : error.message,
        },
      ],
    };
  }

  if (error instanceof McpProtocolError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error.details
            ? `${error.message}\n\n${formatJson(error.details)}`
            : error.message,
        },
      ],
    };
  }

  if (error instanceof Error) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: String(error) }],
  };
}

function normalizeToolContent(result: {
  content?: unknown[];
  structuredContent?: unknown;
  isError?: boolean;
}): OpenClawToolResult {
  if (Array.isArray(result.content) && result.content.length > 0) {
    return {
      content: result.content.filter(isRecord),
      structuredContent: result.structuredContent,
      isError: result.isError,
    };
  }

  return {
    isError: result.isError,
    structuredContent: result.structuredContent,
    content: [
      {
        type: "text",
        text: formatJson(
          result.structuredContent ?? {
            success: result.isError !== true,
          },
        ),
      },
    ],
  };
}

async function executeRemoteTool(
  api: OpenClawPluginApi,
  remoteToolName: string,
  params: Record<string, unknown>,
): Promise<OpenClawToolResult> {
  const config = getPluginEntryConfig(api.config);
  const client = new McpClient({
    url: config.url ?? DEFAULT_MCP_URL,
    token: config.token ?? "",
    protocolVersion: config.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
    clientInfo: {
      name: "mcd-mcp-cli-openclaw-plugin",
      version: "0.0.5",
    },
    fetchImpl: getFetch(),
  });

  try {
    const result = await client.callTool(remoteToolName, params);
    return normalizeToolContent(result.response.result);
  } finally {
    await client.close();
  }
}

function createToolDefinition(
  api: OpenClawPluginApi,
  tool: KnownTool,
): OpenClawToolDefinition {
  return {
    name: tool.openclawName,
    description: `${tool.title}。底层调用麦当劳中国远程 MCP 工具 ${tool.name}。`,
    parameters: tool.parametersSchema,
    async execute(_toolCallId, params) {
      try {
        return await executeRemoteTool(
          api,
          tool.name,
          isRecord(params) ? params : {},
        );
      } catch (error) {
        return formatErrorContent(error);
      }
    },
  };
}

const GENERIC_TOOL: {
  name: string;
  description: string;
  parameters: JsonSchema;
} = {
  name: "mcd_mcp_call",
  description:
    "调试用通用桥接工具。按远程工具名调用麦当劳中国 MCP server，适合服务端新增工具后临时接入。",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      remoteToolName: { type: "string" },
      arguments: {
        type: "object",
        additionalProperties: true,
        default: {},
      },
    },
    required: ["remoteToolName"],
  },
};

const plugin = {
  id: PLUGIN_ID,
  name: "McDonald's China MCP",
  register(api: OpenClawPluginApi) {
    for (const tool of KNOWN_TOOLS) {
      api.registerTool(createToolDefinition(api, tool), {
        optional: tool.optional,
      });
    }

    api.registerTool(
      {
        name: GENERIC_TOOL.name,
        description: GENERIC_TOOL.description,
        parameters: GENERIC_TOOL.parameters,
        async execute(_toolCallId, params) {
          try {
            const payload = isRecord(params) ? params : {};
            const remoteToolName =
              typeof payload.remoteToolName === "string"
                ? payload.remoteToolName
                : "";
            const argumentsObject = isRecord(payload.arguments)
              ? payload.arguments
              : {};

            return await executeRemoteTool(api, remoteToolName, argumentsObject);
          } catch (error) {
            return formatErrorContent(error);
          }
        },
      },
      { optional: true },
    );
  },
};

export default plugin;
