import { describe, expect, it } from "vitest";
import {
  autoFixCommas,
  buildTree,
  detect,
  escapeJson,
  findUnsafeIntegers,
  formatJson,
  highlightLines,
  jsLiteralToJson,
  jsObjectToJson,
  kvToJson,
  minifyJson,
  nodeValueText,
  queryToJson,
  toJsonPath,
  toJsPath,
  unescapeJson,
  validate,
  yamlToJson,
} from "./json";

const SAMPLE = '{"code":0,"data":{"orderId":9000020018848812345,"hotelName":"汉庭酒店(上海虹桥)","amount":49.00,"tags":["免单","首单"]}}';

describe("格式化与压缩", () => {
  it("格式化保留大整数和 49.00", () => {
    const out = formatJson(SAMPLE, 2);
    expect(out).toContain('"orderId": 9000020018848812345');
    expect(out).toContain('"amount": 49.00');
    expect(out.split("\n")[1]).toBe('  "code": 0,');
  });

  it("支持 4 空格和 tab 缩进", () => {
    expect(formatJson('{"a":1}', 4)).toBe('{\n    "a": 1\n}');
    expect(formatJson('{"a":1}', "tab")).toBe('{\n\t"a": 1\n}');
  });

  it("压缩只去掉空白", () => {
    expect(minifyJson(formatJson(SAMPLE))).toBe(SAMPLE);
    expect(minifyJson('{ "a b": "x  y" }')).toBe('{"a b":"x  y"}');
  });
});

describe("校验", () => {
  it("缺逗号时指出位置并提示上一行", () => {
    const text = '{\n  "hotelName": "汉庭",\n  "amount": 49\n  "need": 3\n}';
    const [issue] = validate(text);
    expect(issue.line).toBe(4);
    expect(issue.column).toBe(3);
    expect(issue.message).toBe("这里需要逗号");
    expect(issue.hint).toBe("第 3 行末尾少了一个逗号");
  });

  it("末尾多逗号、键名无引号", () => {
    expect(validate('{"a":1,}')[0].hint).toBe("最后一项后面多了逗号");
    expect(validate("{a:1}")[0].hint).toBe("键名没加双引号，这是 JS 对象写法");
  });

  it("合法 JSON 没有问题", () => {
    expect(validate(SAMPLE)).toEqual([]);
  });
});

describe("转义与反转义", () => {
  it("逐层解开转义字符串", () => {
    const once = escapeJson(SAMPLE);
    const twice = escapeJson(once);
    expect(unescapeJson(once)).toEqual({ text: SAMPLE, layers: 1 });
    expect(unescapeJson(twice)).toEqual({ text: SAMPLE, layers: 2 });
  });

  it("没有外层引号的日志写法", () => {
    const text = '{\\"a\\":12345678901234567890,\\"b\\":\\"x\\"}';
    expect(unescapeJson(text)).toEqual({ text: '{"a":12345678901234567890,"b":"x"}', layers: 1 });
  });

  it("识别层数", () => {
    expect(detect(escapeJson(escapeJson(SAMPLE)))).toMatchObject({ kind: "escaped", layers: 2 });
    expect(detect(SAMPLE).kind).toBe("json");
  });
});

describe("其他格式转 JSON", () => {
  it("URL 参数，重复键变数组", () => {
    expect(JSON.parse(queryToJson("https://a.com/p?env=fat&id=1&id=2#x"))).toEqual({ env: "fat", id: ["1", "2"] });
    expect(detect("env=fat&id=1").kind).toBe("query");
  });

  it("键值对 / .env", () => {
    expect(JSON.parse(kvToJson('A=1\n# 注释\nexport B="x y"'))).toEqual({ A: "1", B: "x y" });
    expect(detect("A=1\nB=2").kind).toBe("kv");
  });

  it("YAML 大整数不丢精度", () => {
    const out = yamlToJson("order:\n  id: 9000020018848812345\n  tags: [a, b]\n");
    expect(out).toContain('"id": 9000020018848812345');
    expect(detect("order:\n  id: 1\n").kind).toBe("yaml");
  });

  it("JS 对象：键名、单引号、注释、末尾逗号", () => {
    const src = "{\n  // 订单\n  id: 9000020018848812345,\n  name: 'it\\'s',\n  list: [1, 2,],\n  x: undefined,\n}";
    const json = jsLiteralToJson(src);
    expect(JSON.parse(json.replace("9000020018848812345", "0"))).toEqual({ id: 0, name: "it's", list: [1, 2], x: null });
    expect(json).toContain("9000020018848812345");
    expect(detect(src).kind).toBe("jsobject");
  });

  it("补逗号", () => {
    expect(autoFixCommas('{"a":1\n"b":2}')).toBe('{"a":1,\n"b":2}');
    expect(jsObjectToJson("{a:1\nb:'x'}")).toBe('{\n  "a": 1,\n  "b": "x"\n}');
  });
});

describe("树形与路径", () => {
  it("构建树并生成路径", () => {
    const tree = buildTree(SAMPLE)!;
    const data = tree.children![1];
    expect(data.key).toBe("data");
    const orderId = data.children![0];
    expect(orderId).toMatchObject({ key: "orderId", raw: "9000020018848812345", unsafe: true });
    const tag = data.children![3].children![1];
    expect(toJsonPath(tag.path)).toBe("$.data.tags[1]");
    expect(toJsPath(tag.path)).toBe("data.data.tags[1]");
    expect(toJsonPath(["a-b", 0])).toBe("$['a-b'][0]");
  });

  it("复制值", () => {
    expect(nodeValueText(SAMPLE, ["data", "hotelName"])).toBe("汉庭酒店(上海虹桥)");
    expect(nodeValueText(SAMPLE, ["data", "orderId"])).toBe("9000020018848812345");
    expect(nodeValueText(SAMPLE, ["data", "tags"])).toBe('[\n  "免单",\n  "首单"\n]');
  });

  it("找出不安全的大整数", () => {
    expect(findUnsafeIntegers(formatJson(SAMPLE))).toEqual([{ line: 4, raw: "9000020018848812345", key: "orderId" }]);
  });
});

describe("高亮", () => {
  it("区分键和字符串值", () => {
    const lines = highlightLines('{\n  "a": "b",\n  "n": 1\n}');
    expect(lines).toHaveLength(4);
    expect(lines[1].filter((t) => t.cls !== "space").map((t) => t.cls)).toEqual(["key", "punct", "string", "punct"]);
    expect(lines[2].find((t) => t.cls === "number")?.text).toBe("1");
  });
});
