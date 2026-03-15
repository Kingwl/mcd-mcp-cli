export interface KnownTool {
  name: string;
  title: string;
  description: string;
  inputHint: string;
  openclawName: string;
  optional: boolean;
  parametersSchema: Record<string, unknown>;
}

export const KNOWN_TOOLS: KnownTool[] = [
  {
    name: "list-nutrition-foods",
    title: "餐品营养信息列表",
    description:
      "获取麦当劳常见餐品的营养成分数据，包括热量、蛋白质、脂肪、碳水化合物等。",
    inputHint: "无需入参",
    openclawName: "mcd_list_nutrition_foods",
    optional: true,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "delivery-query-addresses",
    title: "获取用户可配送地址列表",
    description: "查询用户已创建的配送地址列表，并返回可配送门店信息。",
    inputHint: "无需入参",
    openclawName: "mcd_delivery_query_addresses",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "delivery-create-address",
    title: "新增配送地址",
    description: "新增用户配送地址，用于外送点餐前补全配送信息。",
    inputHint:
      '{"city":"南京市","contactName":"李明","phone":"16666666666","address":"清竹园9号楼","addressDetail":"2单元508"}',
    openclawName: "mcd_delivery_create_address",
    optional: true,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        city: { type: "string" },
        contactName: { type: "string" },
        gender: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        addressDetail: { type: "string" },
      },
      required: ["city", "contactName", "phone", "address", "addressDetail"],
    },
  },
  {
    name: "query-store-coupons",
    title: "查询用户在当前门店可用券",
    description: "查询当前门店下用户可使用的优惠券列表。",
    inputHint: '{"storeCode":"12345","beCode":"12345"}',
    openclawName: "mcd_query_store_coupons",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        storeCode: { type: "string" },
        beCode: { type: "string" },
      },
      required: ["storeCode", "beCode"],
    },
  },
  {
    name: "query-meals",
    title: "查询当前门店可售卖的餐品列表",
    description: "查询当前门店可售餐品菜单、分类和价格。",
    inputHint: '{"storeCode":"12345","beCode":"12345"}',
    openclawName: "mcd_query_meals",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        storeCode: { type: "string" },
        beCode: { type: "string" },
      },
      required: ["storeCode", "beCode"],
    },
  },
  {
    name: "query-meal-detail",
    title: "查询餐品详情",
    description: "根据餐品编码查询套餐组成、默认选择等详情。",
    inputHint: '{"code":"9900008139","storeCode":"12345","beCode":"12345"}',
    openclawName: "mcd_query_meal_detail",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        code: { type: "string" },
        storeCode: { type: "string" },
        beCode: { type: "string" },
      },
      required: ["code", "storeCode", "beCode"],
    },
  },
  {
    name: "calculate-price",
    title: "商品价格计算",
    description: "计算商品组合、优惠券和配送费后的应付总价。",
    inputHint:
      '{"storeCode":"12345","beCode":"12345","items":[{"productCode":"920215","quantity":1}]}',
    openclawName: "mcd_calculate_price",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        storeCode: { type: "string" },
        beCode: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              productCode: { type: "string" },
              quantity: { type: "integer" },
              couponId: { type: "string" },
              couponCode: { type: "string" },
            },
            required: ["productCode", "quantity"],
          },
        },
      },
      required: ["storeCode", "beCode", "items"],
    },
  },
  {
    name: "create-order",
    title: "创建外送订单",
    description: "根据门店、配送地址和商品列表创建外送订单。",
    inputHint:
      '{"storeCode":"12345","beCode":"12345","items":[{"productCode":"920215","quantity":1}]}',
    openclawName: "mcd_create_order",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        storeCode: { type: "string" },
        beCode: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              productCode: { type: "string" },
              quantity: { type: "integer" },
              couponId: { type: "string" },
              couponCode: { type: "string" },
            },
            required: ["productCode", "quantity"],
          },
        },
      },
      required: ["storeCode", "beCode", "items"],
    },
  },
  {
    name: "query-order",
    title: "查询订单详情",
    description: "查询订单状态、订单内容和配送信息。",
    inputHint: '{"orderId":"1030938730000733964700499858"}',
    openclawName: "mcd_query_order",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        orderId: { type: "string" },
      },
      required: ["orderId"],
    },
  },
  {
    name: "campaign-calendar",
    title: "活动日历查询工具",
    description: "查询当月活动日历，可指定日期查看附近三天活动。",
    inputHint: '{"specifiedDate":"2025-12-09"}',
    openclawName: "mcd_campaign_calendar",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        specifiedDate: {
          type: "string",
          description: "格式 yyyy-MM-dd。不传则查询今天附近的活动。",
        },
      },
    },
  },
  {
    name: "available-coupons",
    title: "麦麦省券列表查询",
    description: "查询当前可领取的麦麦省优惠券列表。",
    inputHint: "无需入参",
    openclawName: "mcd_available_coupons",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "auto-bind-coupons",
    title: "麦麦省一键领券",
    description: "自动领取当前可领取的麦麦省优惠券。",
    inputHint: "无需入参",
    openclawName: "mcd_auto_bind_coupons",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "query-my-coupons",
    title: "我的优惠券查询",
    description: "查询账号下当前可用的优惠券列表。",
    inputHint: "无需入参",
    openclawName: "mcd_query_my_coupons",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "query-my-account",
    title: "我的积分查询",
    description: "查询积分账户信息，包括可用积分和累计积分。",
    inputHint: "无需入参",
    openclawName: "mcd_query_my_account",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "mall-points-products",
    title: "积分兑换商品列表",
    description: "查询麦麦商城里可用积分兑换的商品券。",
    inputHint: "无需入参",
    openclawName: "mcd_mall_points_products",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "mall-product-detail",
    title: "积分兑换商品详情",
    description: "查询积分商品券的详细信息。",
    inputHint: '{"spuId":542}',
    openclawName: "mcd_mall_product_detail",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        spuId: { type: "integer" },
      },
      required: ["spuId"],
    },
  },
  {
    name: "mall-create-order",
    title: "积分兑换商品下单",
    description: "使用积分兑换指定商品券，完成扣积分和发券。",
    inputHint: '{"skuId":10997,"count":1}',
    openclawName: "mcd_mall_create_order",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        skuId: { type: "integer" },
        count: { type: "integer", default: 1 },
      },
      required: ["skuId"],
    },
  },
  {
    name: "now-time-info",
    title: "当前时间信息查询工具",
    description: "返回当前服务器时间、时区和 UTC 时间。",
    inputHint: "无需入参",
    openclawName: "mcd_now_time_info",
    optional: false,
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
];

export const KNOWN_TOOLS_BY_NAME = new Map<string, KnownTool>(
  KNOWN_TOOLS.map((tool) => [tool.name, tool]),
);
