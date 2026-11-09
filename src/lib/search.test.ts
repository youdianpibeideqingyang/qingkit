import { describe, expect, it } from "vitest";
import { displayWidth, findMatches, parseGotoLine, splitByRanges } from "./search";
import { highlightLines } from "./json";

describe("findMatches", () => {
  const lines = ['  "hotelId": "123",', '  "hotelName": "Hotel 汉庭"', "  hotel hotel"];
  it("忽略大小写，同一行多处命中", () => {
    const m = findMatches(lines, "hotel");
    expect(m).toHaveLength(5);
    expect(m[2]).toEqual({ line: 1, start: 16, end: 21 });
    expect(m[3]).toEqual({ line: 2, start: 2, end: 7 });
  });
  it("区分大小写", () => {
    expect(findMatches(lines, "Hotel", true)).toHaveLength(1);
  });
  it("空关键字和上限", () => {
    expect(findMatches(lines, "")).toEqual([]);
    expect(findMatches(lines, "hotel", false, 2)).toHaveLength(2);
  });
});

describe("parseGotoLine", () => {
  it("识别跳行写法", () => {
    expect(parseGotoLine(":120")).toBe(120);
    expect(parseGotoLine("第 30 行")).toBe(30);
    expect(parseGotoLine("88行")).toBe(88);
    expect(parseGotoLine("120")).toBeNull();
    expect(parseGotoLine(":0")).toBeNull();
    expect(parseGotoLine("hotel")).toBeNull();
  });
});

describe("splitByRanges", () => {
  it("命中跨越多个 token 时正确切分", () => {
    const [line] = highlightLines('"hotelName": "汉庭"');
    // 命中 `Name": "汉`（跨 key、标点、字符串）
    const text = line.map((t) => t.text).join("");
    const start = text.indexOf("Name");
    const end = text.indexOf("汉") + 1;
    const segs = splitByRanges(line, [{ start, end, current: true }]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    const marked = segs.filter((s) => s.mark === 2).map((s) => s.text).join("");
    expect(marked).toBe('Name": "汉');
    expect(segs[0]).toEqual({ text: '"hotel', cls: "key", mark: 0 });
  });

  it("没有命中时原样返回", () => {
    const [line] = highlightLines('"a": 1');
    expect(splitByRanges(line, []).map((s) => s.text).join("")).toBe('"a": 1');
  });
});

describe("displayWidth", () => {
  it("中文算两个字符宽", () => {
    expect(displayWidth("ab汉庭")).toBe(6);
  });
});
