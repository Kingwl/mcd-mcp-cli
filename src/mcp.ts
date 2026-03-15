import { CliError } from "./core.js";

export interface JsonRpcErrorShape {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccess<Result> {
  jsonrpc: "2.0";
  id: number | string | null;
  result: Result;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number | string | null;
  error: JsonRpcErrorShape;
}

export type JsonRpcResponse<Result> =
  | JsonRpcSuccess<Result>
  | JsonRpcFailure;

function isJsonRpcSuccess<Result>(
  value: JsonRpcResponse<Result>,
): value is JsonRpcSuccess<Result> {
  return "result" in value;
}

export interface McpToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpToolCallResult {
  content?: unknown[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: unknown;
}

export interface InitializeResult {
  protocolVersion?: string;
  capabilities?: unknown;
  serverInfo?: unknown;
}

export interface SseEvent {
  event: string;
  id: string | null;
  retry: number | null;
  data: string;
  json: unknown;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseSsePayload(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  const chunks = text.split(/\r?\n\r?\n/);

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    const dataLines: string[] = [];
    let eventName = "message";
    let eventId: string | null = null;
    let retry: number | null = null;

    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue;
      }

      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const rawValue = separator === -1 ? "" : line.slice(separator + 1);
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

      if (field === "data") {
        dataLines.push(value);
      } else if (field === "event") {
        eventName = value;
      } else if (field === "id") {
        eventId = value;
      } else if (field === "retry") {
        retry = Number(value);
      }
    }

    const data = dataLines.join("\n");
    const event: SseEvent = {
      event: eventName,
      id: eventId,
      retry,
      data,
      json: data ? tryParseJson(data) : null,
    };

    if (event.data || event.id || event.retry != null) {
      events.push(event);
    }
  }

  return events;
}

function isJsonRpcResponse<Result>(
  message: unknown,
  id: number,
): message is JsonRpcResponse<Result> {
  if (!isRecord(message)) {
    return false;
  }

  return (
    message.jsonrpc === "2.0" &&
    "id" in message &&
    message.id === id &&
    ("result" in message || "error" in message)
  );
}

export class McpProtocolError extends CliError {
  readonly details: unknown;

  constructor(message: string, details: unknown = null) {
    super(message, 1);
    this.details = details;
  }
}

export class McpHttpError extends CliError {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body = "") {
    super(message, 1);
    this.status = status;
    this.body = body;
  }
}

interface McpClientOptions {
  url: string;
  token: string;
  protocolVersion: string;
  clientInfo: {
    name: string;
    version: string;
  };
  fetchImpl: FetchLike;
  extraHeaders?: Array<{ key: string; value: string }>;
  verbose?: boolean;
  log?: (message: string) => void;
}

export class McpClient {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly extraHeaders: Array<{ key: string; value: string }>;
  private readonly verbose: boolean;
  private readonly log: (message: string) => void;
  private readonly clientInfo: {
    name: string;
    version: string;
  };
  private requestId = 1;
  private sessionId: string | null = null;
  private negotiatedProtocolVersion: string;
  private serverInfo: unknown = null;
  private serverCapabilities: unknown = null;

  constructor({
    url,
    token,
    protocolVersion,
    clientInfo,
    fetchImpl,
    extraHeaders = [],
    verbose = false,
    log = () => {},
  }: McpClientOptions) {
    this.url = url;
    this.token = token;
    this.negotiatedProtocolVersion = protocolVersion;
    this.clientInfo = clientInfo;
    this.fetchImpl = fetchImpl;
    this.extraHeaders = extraHeaders;
    this.verbose = verbose;
    this.log = log;
  }

  private buildHeaders({
    includeProtocolVersion,
    includeSession = true,
  }: {
    includeProtocolVersion: boolean;
    includeSession?: boolean;
  }): Headers {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json, text/event-stream");
    headers.set("Authorization", `Bearer ${this.token}`);

    for (const { key, value } of this.extraHeaders) {
      headers.set(key, value);
    }

    if (includeProtocolVersion) {
      headers.set("MCP-Protocol-Version", this.negotiatedProtocolVersion);
    }

    if (includeSession && this.sessionId) {
      headers.set("Mcp-Session-Id", this.sessionId);
    }

    return headers;
  }

  private nextId(): number {
    const id = this.requestId;
    this.requestId += 1;
    return id;
  }

  async initialize(): Promise<{
    protocolVersion: string;
    serverInfo: unknown;
    capabilities: unknown;
    sessionId: string | null;
  }> {
    if (this.serverInfo) {
      return {
        protocolVersion: this.negotiatedProtocolVersion,
        serverInfo: this.serverInfo,
        capabilities: this.serverCapabilities,
        sessionId: this.sessionId,
      };
    }

    const result = await this.sendRequest<InitializeResult>("initialize", {
      protocolVersion: this.negotiatedProtocolVersion,
      capabilities: {},
      clientInfo: this.clientInfo,
    });

    if ("result" in result.response) {
      this.negotiatedProtocolVersion =
        result.response.result.protocolVersion ?? this.negotiatedProtocolVersion;
      this.serverInfo = result.response.result.serverInfo ?? null;
      this.serverCapabilities = result.response.result.capabilities ?? null;
    }

    await this.sendNotification("notifications/initialized");

    return {
      protocolVersion: this.negotiatedProtocolVersion,
      serverInfo: this.serverInfo,
      capabilities: this.serverCapabilities,
      sessionId: this.sessionId,
    };
  }

  private async sendNotification(
    method: string,
    params?: unknown,
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
    };

    if (params !== undefined) {
      payload.params = params;
    }

    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: this.buildHeaders({
        includeProtocolVersion: true,
      }),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new McpHttpError(
        `MCP notification failed with ${response.status} ${response.statusText}.`,
        response.status,
        body,
      );
    }
  }

  async sendRequest<Result>(
    method: string,
    params?: unknown,
  ): Promise<{
    response: JsonRpcResponse<Result>;
    rawBody: string;
  }> {
    const id = this.nextId();
    const payload: Record<string, unknown> = {
      jsonrpc: "2.0",
      id,
      method,
    };

    if (params !== undefined) {
      payload.params = params;
    }

    if (this.verbose) {
      this.log(`POST ${this.url}`);
      this.log(`Payload: ${JSON.stringify(payload)}`);
    }

    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: this.buildHeaders({
        includeProtocolVersion: method !== "initialize",
        includeSession: method !== "initialize",
      }),
      body: JSON.stringify(payload),
    });

    const sessionId =
      response.headers.get("Mcp-Session-Id") ??
      response.headers.get("MCP-Session-Id");
    if (sessionId) {
      this.sessionId = sessionId;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new McpHttpError(
        `MCP request failed with ${response.status} ${response.statusText}.`,
        response.status,
        text,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    let rpcResponse: JsonRpcResponse<Result> | null = null;

    if (contentType.includes("text/event-stream")) {
      const messages = parseSsePayload(text)
        .map((event) => event.json)
        .filter((message) => message != null);

      rpcResponse =
        messages.find((message) => isJsonRpcResponse<Result>(message, id)) ??
        null;

      const serverRequest = messages.find((message) => {
        if (!isRecord(message)) {
          return false;
        }

        return (
          "method" in message &&
          "id" in message &&
          message.id !== undefined &&
          !isJsonRpcResponse<Result>(message, id)
        );
      });

      if (serverRequest && isRecord(serverRequest)) {
        throw new McpProtocolError(
          `Server sent an unsupported server-to-client request: ${String(
            serverRequest.method,
          )}`,
          serverRequest,
        );
      }
    } else {
      const parsed = tryParseJson(text);
      if (isJsonRpcResponse<Result>(parsed, id)) {
        rpcResponse = parsed;
      }
    }

    if (!rpcResponse) {
      throw new McpProtocolError(
        "Server did not return a valid JSON-RPC response.",
        {
          contentType,
          body: text,
        },
      );
    }

    if ("error" in rpcResponse) {
      throw new McpProtocolError(
        `MCP error ${rpcResponse.error.code}: ${rpcResponse.error.message}`,
        rpcResponse.error,
      );
    }

    return {
      response: rpcResponse,
      rawBody: text,
    };
  }

  async listTools(): Promise<McpToolDefinition[]> {
    await this.initialize();
    const tools: McpToolDefinition[] = [];
    let cursor: unknown;

    do {
      const result = await this.sendRequest<{
        tools?: McpToolDefinition[];
        nextCursor?: unknown;
      }>("tools/list", cursor ? { cursor } : undefined);
      if (!isJsonRpcSuccess(result.response)) {
        throw new McpProtocolError("tools/list returned an error response.");
      }
      tools.push(...(result.response.result.tools ?? []));
      cursor = result.response.result.nextCursor;
    } while (cursor);

    return tools;
  }

  async callTool(
    name: string,
    argumentsObject: Record<string, unknown>,
  ): Promise<{
    response: JsonRpcSuccess<McpToolCallResult>;
    rawBody: string;
  }> {
    await this.initialize();
    return this.sendRequest<McpToolCallResult>("tools/call", {
      name,
      arguments: argumentsObject,
    }) as Promise<{
      response: JsonRpcSuccess<McpToolCallResult>;
      rawBody: string;
    }>;
  }

  async rpc(
    method: string,
    params?: unknown,
  ): Promise<{
    response: JsonRpcSuccess<unknown>;
    rawBody: string;
  }> {
    await this.initialize();
    return this.sendRequest<unknown>(method, params) as Promise<{
      response: JsonRpcSuccess<unknown>;
      rawBody: string;
    }>;
  }

  async close(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    try {
      await this.fetchImpl(this.url, {
        method: "DELETE",
        headers: this.buildHeaders({
          includeProtocolVersion: true,
        }),
      });
    } catch {
      // Best-effort cleanup only.
    }
  }
}
