import { expect, test } from "@rstest/core";

import { runCli } from "../src/cli.js";

function createMemoryStream(): {
  write(chunk: string): void;
  toString(): string;
} {
  let output = "";
  return {
    write(chunk: string) {
      output += chunk;
    },
    toString() {
      return output;
    },
  };
}

function createEnv(): NodeJS.ProcessEnv {
  return {
    MCD_MCP_TOKEN: "token-123",
  };
}

function createJsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

test("config prints streamablehttp JSON config", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const exitCode = await runCli({
    argv: ["config"],
    env: {},
    stdout,
    stderr,
    fetchImpl: async () => createJsonResponse({}),
  });

  expect(exitCode).toBe(0);
  expect(stdout.toString()).toContain('"type": "streamablehttp"');
  expect(stdout.toString()).toContain(
    '"Authorization": "Bearer YOUR_MCP_TOKEN"',
  );
});

test("tools --known prints offline tool list", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const exitCode = await runCli({
    argv: ["tools", "--known"],
    env: {},
    stdout,
    stderr,
    fetchImpl: async () => createJsonResponse({}),
  });

  expect(exitCode).toBe(0);
  expect(stdout.toString()).toContain("list-nutrition-foods");
  expect(stdout.toString()).toContain("now-time-info");
  expect(stderr.toString()).toBe("");
});

test("info initializes MCP session and prints server info", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const requests: Array<{
    method?: string;
    body: Record<string, unknown> | null;
  }> = [];

  const fetchImpl = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push({
      method: init?.method,
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null,
    });

    if (requests.length === 1) {
      return createJsonResponse(
        {
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "mcd", version: "1.0.2" },
          },
        },
        {
          "Mcp-Session-Id": "session-1",
        },
      );
    }

    return new Response("", { status: 202 });
  };

  const exitCode = await runCli({
    argv: ["info"],
    env: createEnv(),
    stdout,
    stderr,
    fetchImpl,
  });

  expect(exitCode).toBe(0);
  expect(requests).toHaveLength(3);
  expect(requests[0]?.body?.method).toBe("initialize");
  expect(requests[1]?.body?.method).toBe("notifications/initialized");
  expect(requests[2]?.method).toBe("DELETE");
  expect(stdout.toString()).toContain('"sessionId": "session-1"');
});

test("tools lists remote tools after initialize", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  let step = 0;

  const fetchImpl = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    step += 1;
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;

    if (step === 1) {
      return createJsonResponse(
        {
          jsonrpc: "2.0",
          id: body?.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "mcd", version: "1.0.2" },
          },
        },
        {
          "Mcp-Session-Id": "session-1",
        },
      );
    }

    if (step === 2) {
      return new Response("", { status: 202 });
    }

    if (step === 3) {
      return createJsonResponse({
        jsonrpc: "2.0",
        id: body?.id,
        result: {
          tools: [
            {
              name: "now-time-info",
              title: "当前时间信息查询工具",
              description: "返回当前时间",
            },
          ],
        },
      });
    }

    return new Response("", { status: 204 });
  };

  const exitCode = await runCli({
    argv: ["tools"],
    env: createEnv(),
    stdout,
    stderr,
    fetchImpl,
  });

  expect(exitCode).toBe(0);
  expect(stdout.toString()).toContain("now-time-info");
  expect(stdout.toString()).toContain("当前时间信息查询工具");
});

test("call invokes tools/call with JSON args", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const payloads: Array<Record<string, unknown>> = [];

  const fetchImpl = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    if (body) {
      payloads.push(body);
    }

    if (body?.method === "initialize") {
      return createJsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mcd", version: "1.0.2" },
        },
      });
    }

    if (body?.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }

    if (body?.method === "tools/call") {
      return createJsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [{ type: "text", text: "ok" }],
          isError: false,
        },
      });
    }

    return new Response("", { status: 204 });
  };

  const exitCode = await runCli({
    argv: [
      "call",
      "campaign-calendar",
      "--json",
      '{"specifiedDate":"2025-12-09"}',
    ],
    env: createEnv(),
    stdout,
    stderr,
    fetchImpl,
  });

  expect(exitCode).toBe(0);
  const toolCall = payloads.find((payload) => payload.method === "tools/call");
  expect(toolCall?.params).toEqual({
    name: "campaign-calendar",
    arguments: {
      specifiedDate: "2025-12-09",
    },
  });
  expect(stdout.toString()).toContain('"text": "ok"');
});

test("call returns non-zero when tool result isError=true", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const fetchImpl = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;

    if (body?.method === "initialize") {
      return createJsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mcd", version: "1.0.2" },
        },
      });
    }

    if (body?.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }

    if (body?.method === "tools/call") {
      return createJsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [{ type: "text", text: "failed" }],
          isError: true,
        },
      });
    }

    return new Response("", { status: 204 });
  };

  const exitCode = await runCli({
    argv: ["call", "delivery-create-address", "--json", "{}"],
    env: createEnv(),
    stdout,
    stderr,
    fetchImpl,
  });

  expect(exitCode).toBe(1);
  expect(stderr.toString()).toContain("returned isError=true");
  expect(stderr.toString()).toContain("delivery-create-address");
});

test("rpc prints JSON-RPC result payload", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const fetchImpl = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;

    if (body?.method === "initialize") {
      return createJsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mcd", version: "1.0.2" },
        },
      });
    }

    if (body?.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }

    if (body?.method === "tools/list") {
      return createJsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [],
        },
      });
    }

    return new Response("", { status: 204 });
  };

  const exitCode = await runCli({
    argv: ["rpc", "tools/list"],
    env: createEnv(),
    stdout,
    stderr,
    fetchImpl,
  });

  expect(exitCode).toBe(0);
  expect(stdout.toString()).toContain('"tools": []');
});

test("missing token returns config error", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const exitCode = await runCli({
    argv: ["info"],
    env: {},
    stdout,
    stderr,
    fetchImpl: async () => createJsonResponse({}),
  });

  expect(exitCode).toBe(2);
  expect(stderr.toString()).toContain("Missing MCP token");
});

test("SSE JSON-RPC response is supported", async () => {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const fetchImpl = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;

    if (body?.method === "initialize") {
      return createJsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mcd", version: "1.0.2" },
        },
      });
    }

    if (body?.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }

    if (body?.method === "tools/call") {
      return new Response(
        [
          "event: message",
          'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":50}}',
          "",
          `data: {"jsonrpc":"2.0","id":${body.id},"result":{"content":[{"type":"text","text":"sse ok"}],"isError":false}}`,
          "",
        ].join("\n"),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        },
      );
    }

    return new Response("", { status: 204 });
  };

  const exitCode = await runCli({
    argv: ["call", "now-time-info"],
    env: createEnv(),
    stdout,
    stderr,
    fetchImpl,
  });

  expect(exitCode).toBe(0);
  expect(stdout.toString()).toContain("sse ok");
});
