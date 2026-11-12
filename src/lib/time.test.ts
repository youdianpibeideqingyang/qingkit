import { describe, expect, it } from "vitest";
import { detectTimestamp, formatInZone, parseDateText, parseTimeInput, relativeTime, tzOffsetMinutes, zonedToUtc } from "./time";

const SH = "Asia/Shanghai";
const NY = "America/New_York";

describe("时间戳识别", () => {
  it("按位数判断单位", () => {
    expect(detectTimestamp("1731400000")).toMatchObject({ ms: 1731400000000, unit: "s" });
    expect(detectTimestamp("1731400000123")).toMatchObject({ ms: 1731400000123, unit: "ms" });
    expect(detectTimestamp("1731400000123456")).toMatchObject({ ms: 1731400000123, unit: "us", subMs: "456" });
    expect(detectTimestamp("1731400000123456789")).toMatchObject({ ms: 1731400000123, unit: "ns", subMs: "456789" });
    expect(detectTimestamp("1731400000.5")).toMatchObject({ ms: 1731400000500, unit: "s" });
    expect(detectTimestamp(" 1,731,400,000 ")).toMatchObject({ unit: "s" });
    expect(detectTimestamp("0")).toMatchObject({ ms: 0, unit: "s" });
  });
  it("非时间戳返回 null", () => {
    expect(detectTimestamp("2026-11-12")).toBeNull();
    expect(detectTimestamp("abc")).toBeNull();
  });
});

describe("时区偏移", () => {
  it("北京固定 +8，纽约有夏令时", () => {
    expect(tzOffsetMinutes(Date.UTC(2026, 0, 1), SH)).toBe(480);
    expect(tzOffsetMinutes(Date.UTC(2026, 0, 15), NY)).toBe(-300);
    expect(tzOffsetMinutes(Date.UTC(2026, 6, 15), NY)).toBe(-240);
  });
  it("墙上时间转时刻，含夏令时边界", () => {
    expect(zonedToUtc(2026, 11, 12, 14, 30, 0, 0, SH)).toBe(Date.UTC(2026, 10, 12, 6, 30));
    // 纽约 2026-03-08 02:30 不存在（跳到 03:30），顺延
    expect(zonedToUtc(2026, 3, 8, 2, 30, 0, 0, NY)).toBe(Date.UTC(2026, 2, 8, 7, 30));
    // 纽约 2026-11-01 01:30 出现两次，取较早（夏令时那次，UTC-4）
    expect(zonedToUtc(2026, 11, 1, 1, 30, 0, 0, NY)).toBe(Date.UTC(2026, 10, 1, 5, 30));
  });
});

describe("日期解析", () => {
  const expected = Date.UTC(2026, 10, 12, 6, 30, 0);
  it("各种写法，按指定时区理解", () => {
    for (const s of ["2026-11-12 14:30", "2026/11/12 14:30:00", "2026.11.12 14:30", "2026年11月12日 14:30", "2026年11月12日 14时30分", "20261112143000", "2026-11-12T14:30:00", "2026年11月12日 下午2:30"]) {
      expect(parseDateText(s, SH)?.ms, s).toBe(expected);
    }
    expect(parseDateText("2026-11-12", SH)?.ms).toBe(Date.UTC(2026, 10, 11, 16));
  });
  it("自带时区时不受所选时区影响", () => {
    expect(parseDateText("2026-11-12T06:30:00Z", NY)).toMatchObject({ ms: expected, hasZone: true });
    expect(parseDateText("2026-11-12 14:30+08:00", NY)?.ms).toBe(expected);
    expect(parseDateText("2026-11-12 14:30 GMT+8", NY)?.ms).toBe(expected);
    expect(parseDateText("Thu, 12 Nov 2026 06:30:00 GMT", SH)?.ms).toBe(expected);
    expect(parseDateText("2026-11-12T14:30:00.250+0800", SH)?.ms).toBe(expected + 250);
  });
  it("非法日期", () => {
    expect(parseDateText("2026-13-01", SH)).toBeNull();
    expect(parseDateText("hello", SH)).toBeNull();
    expect(parseDateText("Nov 12 2026", SH)).toBeNull(); // 英文写法没时区，不猜
  });
  it("统一入口", () => {
    expect(parseTimeInput("1731400000", SH)?.kind).toBe("timestamp");
    expect(parseTimeInput("2026-11-12", SH)?.kind).toBe("date");
  });
});

describe("格式化", () => {
  it("同一时刻在不同时区", () => {
    const ms = Date.UTC(2026, 10, 12, 6, 30, 0);
    expect(formatInZone(ms, SH)).toEqual({ date: "2026-11-12", time: "14:30:00", weekday: "周四", offset: "+08:00", iso: "2026-11-12T14:30:00+08:00" });
    expect(formatInZone(ms, NY)).toMatchObject({ date: "2026-11-12", time: "01:30:00", offset: "-05:00" });
    expect(formatInZone(ms, "UTC").iso).toBe("2026-11-12T06:30:00Z");
    expect(formatInZone(ms + 123, "Asia/Kolkata")).toMatchObject({ time: "12:00:00.123", offset: "+05:30" });
  });
  it("保留微秒、纳秒", () => {
    expect(formatInZone(1731400000123, "UTC", "456").time).toBe("08:26:40.123456");
  });
  it("相对时间", () => {
    const now = Date.UTC(2026, 10, 12);
    expect(relativeTime(now - 3 * 3600000, now)).toBe("3 小时前");
    expect(relativeTime(now + 2.5 * 86400000, now)).toBe("2.5 天后");
    expect(relativeTime(now - 2000, now)).toBe("刚刚");
  });
});
