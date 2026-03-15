# mcd-mcp-cli

面向麦当劳中国远程 MCP Server 的 TypeScript CLI。

实现依据是文档 [麦当劳MCP平台](https://open.mcd.cn/mcp/doc) 中描述的接入方式：

- MCP URL: `https://mcp.mcd.cn`
- 鉴权: `Authorization: Bearer YOUR_MCP_TOKEN`
- 协议: Streamable HTTP
- 当前兼容的 MCP 版本上限: `2025-06-18`

## 功能

- `mcd config` 输出 MCP Client 可直接导入的 JSON 配置。
- `mcd info` 初始化远程 MCP Server 并打印 `serverInfo` / `capabilities`。
- `mcd tools` 实时列出服务端工具。
- `mcd tools --known` 离线列出 PDF 中已知的 18 个工具。
- `mcd call <toolName>` 调用指定 MCP Tool。
- `mcd rpc <method>` 发送低层 JSON-RPC/MCP 请求，便于调试。
- 可作为 OpenClaw plugin 安装，注册一组 `mcd_*` agent tools。

## 环境要求

- Node.js `>=18`

## 技术栈

- 构建：`@rslib/core`
- 测试：`@rstest/core`
- 语言：TypeScript
- 构建产物：`esm + cjs`

## 发布

发布到 npm 前建议执行：

```bash
pnpm run typecheck
pnpm test
pnpm publish --dry-run
```

包内已经配置 `prepack`，发布时会自动执行 `pnpm run build`。

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

仓库已提供：

- [.env.example](./.env.example)
- [.env](./.env)

你只需要把 `.env.example` 的内容参考着填进 `.env`，至少设置：

```bash
MCD_MCP_TOKEN=你的_mcp_token
```

如果 `.env` 和命令行参数同时存在，仍然遵循：

命令行参数 > `.env` / 环境变量 > 默认值

## 安装与使用

```bash
pnpm install
pnpm run build
pnpm link --global
mcd --help
```

也可以直接运行：

```bash
pnpm run build
node ./bin/mcd.js --help
```

## 命令

```text
mcd config [options]
mcd info [options]
mcd tools [options]
mcd tools --known
mcd call <toolName> [options]
mcd rpc <method> [options]
```

## 使用示例

输出 MCP Client 配置 JSON：

```bash
mcd config --token "$MCD_MCP_TOKEN"
```

查询远程 MCP Server 信息：

```bash
mcd info --token "$MCD_MCP_TOKEN"
```

列出服务端工具：

```bash
mcd tools --token "$MCD_MCP_TOKEN"
```

离线查看 PDF 里的已知工具：

```bash
mcd tools --known
```

调用“当前时间信息查询工具”：

```bash
mcd call now-time-info --token "$MCD_MCP_TOKEN"
```

调用“活动日历查询工具”：

```bash
mcd call campaign-calendar \
  --token "$MCD_MCP_TOKEN" \
  --json '{"specifiedDate":"2025-12-09"}'
```

调用“新增配送地址”：

```bash
mcd call delivery-create-address \
  --token "$MCD_MCP_TOKEN" \
  --json '{"city":"南京市","contactName":"李明","phone":"16666666666","address":"清竹园9号楼","addressDetail":"2单元508"}'
```

发送低层 `tools/list` 调试请求：

```bash
mcd rpc tools/list --token "$MCD_MCP_TOKEN"
```

## OpenClaw Plugin

仓库已包含：

- [openclaw.plugin.json](./openclaw.plugin.json)
- `package.json > openclaw.extensions`
- 构建产物入口 `dist/plugin.js`

安装方式：

```bash
openclaw plugins install mcd-mcp-cli
```

本地开发调试时，仍然可以使用本地目录安装：

```bash
pnpm run build
openclaw plugins install -l .
```

然后在 OpenClaw 配置里启用并填写：

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

OpenClaw 暴露的工具名使用 snake_case，并加 `mcd_` 前缀避免冲突，例如：

- `mcd_now_time_info`
- `mcd_campaign_calendar`
- `mcd_query_meals`
- `mcd_delivery_create_address`
- `mcd_mcp_call`

其中带副作用的工具默认注册为 optional，例如创建地址、创建订单、一键领券、积分兑换下单。按 OpenClaw 规则，需要显式加入 `tools.allow` 或 `agents.list[].tools.allow`。

`tools.allow` 和 `agents.list[].tools.allow` 都是 OpenClaw 的工具白名单：

- `tools.allow`
  - 全局白名单，对所有 agent 生效。
- `agents.list[].tools.allow`
  - 某个 agent 自己的白名单，只对该 agent 生效。

常见做法是：

- 全局只放只读工具
- 有副作用的工具只放到特定 agent 的 allowlist 里

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
            "mcd_delivery_create_address",
            "mcd_create_order"
          ]
        }
      }
    ]
  }
}
```

建议：

- `mcd_now_time_info`、`mcd_campaign_calendar`、`mcd_query_meals` 这类只读工具可以全局开放。
- `mcd_delivery_create_address`、`mcd_create_order`、`mcd_auto_bind_coupons`、`mcd_mall_create_order` 这类有副作用的工具更适合只给专门 agent 开启。

## MCP 配置 JSON 示例

`mcd config` 默认输出：

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

PDF 中明确列出的工具包括：

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
