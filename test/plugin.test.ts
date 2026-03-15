import { expect, test } from "@rstest/core";

import plugin from "../src/plugin.js";

interface RegisteredTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
    content: Array<Record<string, unknown>>;
    structuredContent?: unknown;
    isError?: boolean;
  }>;
}

test("plugin registers mapped tools and generic bridge", () => {
  const registrations: Array<{
    tool: RegisteredTool;
    options: { optional?: boolean } | undefined;
  }> = [];

  plugin.register({
    config: {
      plugins: {
        entries: {
          "mcd-mcp-cli": {
            config: {
              token: "token-123"
            }
          }
        }
      }
    },
    registerTool(tool, options) {
      registrations.push({
        tool: tool as RegisteredTool,
        options,
      });
    },
  });

  expect(registrations.some((item) => item.tool.name === "mcd_now_time_info")).toBe(true);
  expect(registrations.some((item) => item.tool.name === "mcd_mcp_call")).toBe(true);

  const createAddress = registrations.find(
    (item) => item.tool.name === "mcd_delivery_create_address",
  );
  expect(createAddress?.options?.optional).toBe(true);

  const createOrder = registrations.find(
    (item) => item.tool.name === "mcd_create_order",
  );
  expect(createOrder?.options?.optional).toBe(false);

  const nowTime = registrations.find(
    (item) => item.tool.name === "mcd_now_time_info",
  );
  expect(nowTime?.options?.optional).toBe(false);
});

test("plugin tool executes remote MCP tool using plugin config", async () => {
  const registrations: RegisteredTool[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;

    if (body?.method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "mcd", version: "1.0.2" },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (body?.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }

    if (body?.method === "tools/call") {
      expect(body.params).toEqual({
        name: "campaign-calendar",
        arguments: {
          specifiedDate: "2025-12-09",
        },
      });

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: "ok" }],
            isError: false,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response("", { status: 204 });
  }) as typeof fetch;

  try {
    plugin.register({
      config: {
        plugins: {
          entries: {
            "mcd-mcp-cli": {
              config: {
                token: "token-123",
                url: "https://mcp.mcd.cn",
                protocolVersion: "2025-06-18",
              },
            },
          },
        },
      },
      registerTool(tool) {
        registrations.push(tool as RegisteredTool);
      },
    });

    const calendarTool = registrations.find(
      (tool) => tool.name === "mcd_campaign_calendar",
    );
    const result = await calendarTool?.execute("tool-call-1", {
      specifiedDate: "2025-12-09",
    });

    expect(result?.isError).toBe(false);
    expect(result?.content).toEqual([{ type: "text", text: "ok" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
