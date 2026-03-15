# mcd-mcp-cli

面向麦当劳中国远程 MCP Server 的 CLI 和 OpenClaw plugin。

实现依据是文档 [麦当劳MCP平台](https://open.mcd.cn/mcp/doc) 中描述的接入方式：

- MCP URL: `https://mcp.mcd.cn`
- 鉴权: `Authorization: Bearer YOUR_MCP_TOKEN`
- 协议: Streamable HTTP
- 当前兼容的 MCP 版本上限: `2025-06-18`

## 功能

- 作为 CLI 调用麦当劳 MCP server
- 作为 OpenClaw plugin 暴露 `mcd_*` tools
- 支持列出工具、调用工具、输出 MCP Client 配置

## 环境要求

- Node.js `>=18`

## 安装

```bash
pnpm add -g mcd-mcp-cli
mcd --help
```

也可以在仓库内直接使用：

```bash
pnpm install
pnpm run build
node ./bin/mcd.js --help
```

## 配置

优先级：命令行参数 > 环境变量 > 默认值。

环境变量：

- `MCD_MCP_TOKEN`
- `MCD_TOKEN`
- `MCD_MCP_URL`，默认 `https://mcp.mcd.cn`
- `MCD_MCP_PROTOCOL_VERSION`，默认 `2025-06-18`
- `MCD_MCP_SERVER_NAME`，默认 `mcd-mcp-cli`

CLI 参数：

- `--token <token>`
- `--url <url>`
- `--protocol-version <version>`
- `--server-name <name>`
- `--header key=value`
- `--json '{"foo":"bar"}'`
- `--body-file <path>`
- `--raw`
- `--verbose`

## dotenv

CLI 启动时会自动加载当前工作目录下的 `.env`。

- [.env.example](./.env.example)
- [.env](./.env)

你只需要把 `.env.example` 的内容参考着填进 `.env`，至少设置：

```bash
MCD_MCP_TOKEN=你的_mcp_token
```

如果 `.env` 和命令行参数同时存在，仍然遵循：

命令行参数 > `.env` / 环境变量 > 默认值

## OpenClaw Plugin

```bash
openclaw plugins install mcd-mcp-cli
```

本地开发调试时，仍然可以使用本地目录安装：

```bash
pnpm run build
openclaw plugins install -l .
```

安装后，在 OpenClaw 配置里启用：

```json
{
  "plugins": {
    "entries": {
      "mcd-mcp-cli": {
        "enabled": true,
        "config": {
          "token": "YOUR_MCD_MCP_TOKEN",
          "url": "https://mcp.mcd.cn",
          "protocolVersion": "2025-06-18"
        }
      }
    }
  }
}
```

OpenClaw 暴露的工具名使用 snake_case，并带 `mcd_` 前缀，例如：

- `mcd_now_time_info`
- `mcd_campaign_calendar`
- `mcd_query_meals`
- `mcd_delivery_create_address`
- `mcd_mcp_call`

默认可用：

- `mcd_create_order`
- `mcd_auto_bind_coupons`
- `mcd_mall_create_order`

默认仍建议按白名单控制的工具：

- `mcd_delivery_create_address`
- `mcd_mcp_call`

`tools.allow` 和 `agents.list[].tools.allow` 都是 OpenClaw 的工具白名单：

- `tools.allow`
  - 全局白名单，对所有 agent 生效。
- `agents.list[].tools.allow`
  - 某个 agent 自己的白名单，只对该 agent 生效。

常见做法是：

- 全局只放常用工具
- 仅把确实想限制的工具放到特定 agent 的 allowlist 里

全局白名单示例：

```json
{
  "plugins": {
    "entries": {
      "mcd-mcp-cli": {
        "enabled": true,
        "config": {
          "token": "YOUR_MCD_MCP_TOKEN",
          "url": "https://mcp.mcd.cn",
          "protocolVersion": "2025-06-18"
        }
      }
    }
  },
  "tools": {
    "allow": [
      "mcd_now_time_info",
      "mcd_campaign_calendar",
      "mcd_query_meals",
      "mcd_query_meal_detail",
      "mcd-mcp-cli"
    ]
  }
}
```

按 agent 精细控制示例：

```json
{
  "plugins": {
    "entries": {
      "mcd-mcp-cli": {
        "enabled": true,
        "config": {
          "token": "YOUR_MCD_MCP_TOKEN",
          "url": "https://mcp.mcd.cn",
          "protocolVersion": "2025-06-18"
        }
      }
    }
  },
  "agents": {
    "list": [
      {
        "id": "planner",
        "tools": {
          "allow": [
            "mcd_now_time_info",
            "mcd_campaign_calendar",
            "mcd_query_meals"
          ]
        }
      },
      {
        "id": "order-agent",
        "tools": {
          "allow": [
            "mcd_now_time_info",
            "mcd_query_meals",
            "mcd_calculate_price",
            "mcd_delivery_create_address"
          ]
        }
      }
    ]
  }
}
```

## CLI

命令：

```text
mcd config [options]
mcd info [options]
mcd tools [options]
mcd tools --known
mcd call <toolName> [options]
mcd rpc <method> [options]
```

常用示例：

```bash
mcd config --token "$MCD_MCP_TOKEN"
```

```bash
mcd info --token "$MCD_MCP_TOKEN"
```

```bash
mcd tools --token "$MCD_MCP_TOKEN"
```

```bash
mcd call now-time-info --token "$MCD_MCP_TOKEN"
```

```bash
mcd call campaign-calendar \
  --token "$MCD_MCP_TOKEN" \
  --json '{"specifiedDate":"2025-12-09"}'
```

```bash
mcd call delivery-create-address \
  --token "$MCD_MCP_TOKEN" \
  --json '{"city":"南京市","contactName":"李明","phone":"16666666666","address":"清竹园9号楼","addressDetail":"2单元508"}'
```

```bash
mcd rpc tools/list --token "$MCD_MCP_TOKEN"
```

## MCP 配置 JSON

```json
{
  "mcpServers": {
    "mcd-mcp-cli": {
      "type": "streamablehttp",
      "url": "https://mcp.mcd.cn",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

## 已知工具

当前内置的已知工具包括：

```text
list-nutrition-foods
delivery-query-addresses
delivery-create-address
query-store-coupons
query-meals
query-meal-detail
calculate-price
create-order
query-order
campaign-calendar
available-coupons
auto-bind-coupons
query-my-coupons
query-my-account
mall-points-products
mall-product-detail
mall-create-order
now-time-info
```
