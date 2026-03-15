import { expect, test } from "@rstest/core";

import {
  DEFAULT_MCP_URL,
  DEFAULT_PROTOCOL_VERSION,
  DEFAULT_SERVER_NAME,
  parseKeyValue,
  resolveConfig,
  resolveJsonBody,
} from "../src/core.js";
import { KNOWN_TOOLS } from "../src/knownTools.js";
import { parseSsePayload } from "../src/mcp.js";

test("resolveConfig reads token/url/protocol defaults and env aliases", () => {
  const resolved = resolveConfig({
    flags: {},
    env: {
      MCD_TOKEN: "abc123",
    } as NodeJS.ProcessEnv,
  });

  expect(resolved).toEqual({
    token: "abc123",
    url: DEFAULT_MCP_URL,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    serverName: DEFAULT_SERVER_NAME,
  });
});

test("resolveConfig prefers flags over env", () => {
  const resolved = resolveConfig({
    flags: {
      token: "flag-token",
      url: "https://example.com/mcp",
      protocolVersion: "2025-03-26",
      serverName: "custom-server",
    },
    env: {
      MCD_MCP_TOKEN: "env-token",
      MCD_MCP_URL: "https://env.example.com/mcp",
      MCD_MCP_PROTOCOL_VERSION: "2025-06-18",
      MCD_MCP_SERVER_NAME: "env-server",
    } as NodeJS.ProcessEnv,
  });

  expect(resolved).toEqual({
    token: "flag-token",
    url: "https://example.com/mcp",
    protocolVersion: "2025-03-26",
    serverName: "custom-server",
  });
});

test("resolveJsonBody parses JSON and supports defaults", () => {
  const normalized = resolveJsonBody({
    inlineJson: '{ "count": 1, "skuId": 10997 }',
    bodyFileContent: null,
    defaultValue: {},
  });

  expect(normalized).toEqual({
    count: 1,
    skuId: 10997,
  });

  const fallback = resolveJsonBody({
    inlineJson: null,
    bodyFileContent: null,
    defaultValue: {},
  });

  expect(fallback).toEqual({});
});

test("parseKeyValue validates KEY=VALUE pairs", () => {
  expect(parseKeyValue("foo=bar", "--header")).toEqual({
    key: "foo",
    value: "bar",
  });
});

test("parseSsePayload extracts JSON-RPC messages from SSE", () => {
  const events = parseSsePayload(
    [
      "id: 1",
      "event: message",
      'data: {"jsonrpc":"2.0","method":"notifications/message","params":{"ok":true}}',
      "",
      'data: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}',
      "",
    ].join("\n"),
  );

  expect(events).toHaveLength(2);
  expect(events[0]?.id).toBe("1");
  expect((events[1]?.json as { id: number }).id).toBe(2);
});

test("known tools match the PDF list count", () => {
  expect(KNOWN_TOOLS).toHaveLength(18);
  expect(KNOWN_TOOLS.some((tool) => tool.name === "now-time-info")).toBe(true);
  expect(
    KNOWN_TOOLS.some((tool) => tool.name === "delivery-create-address"),
  ).toBe(true);
});
