import { describe, expect, it } from "vitest";
import { looksLikeLocalUrl, toLanUrl } from "./url";

const IP = "192.168.31.24";

describe("toLanUrl", () => {
  it("把 localhost 换成局域网 IP，保留路径和参数", () => {
    expect(toLanUrl("localhost:8080/free-order?env=fat", IP)).toMatchObject({
      url: "http://192.168.31.24:8080/free-order?env=fat",
      port: 8080,
      replaced: true,
    });
  });

  it("支持只写端口", () => {
    expect(toLanUrl("5173", IP)?.url).toBe("http://192.168.31.24:5173");
    expect(toLanUrl(":3000/a#b", IP)?.url).toBe("http://192.168.31.24:3000/a#b");
  });

  it("127.0.0.1 和 https 默认端口", () => {
    expect(toLanUrl("https://127.0.0.1/x", IP)).toMatchObject({ url: "https://192.168.31.24/x", port: 443 });
  });

  it("已经是局域网地址时原样保留", () => {
    expect(toLanUrl("http://10.0.0.5:9000/", IP)).toMatchObject({ url: "http://10.0.0.5:9000/", replaced: false });
  });

  it("写了结尾斜杠就保留", () => {
    expect(toLanUrl("http://localhost:5173/", IP)?.url).toBe("http://192.168.31.24:5173/");
  });

  it("无效输入返回 null", () => {
    expect(toLanUrl("", IP)).toBeNull();
    expect(toLanUrl("http://", IP)).toBeNull();
  });
});

describe("looksLikeLocalUrl", () => {
  it("识别本机地址", () => {
    expect(looksLikeLocalUrl("http://localhost:8080/a")).toBe(true);
    expect(looksLikeLocalUrl("127.0.0.1:5173")).toBe(true);
    expect(looksLikeLocalUrl("https://www.example.com")).toBe(false);
    expect(looksLikeLocalUrl("some text localhost")).toBe(false);
  });
});
