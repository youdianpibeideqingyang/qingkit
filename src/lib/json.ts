/**
 * JSON 处理：全部基于文本操作，不经过 JSON.parse 的数值转换，
 * 所以订单号这类超长整数、49.00 这种写法都会按原文保留。
 */
import {
  applyEdits,
  createScanner,
  format as jsoncFormat,
  parse as jsoncParse,
  parseTree,
  ParseErrorCode,
  SyntaxKind,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser";
import YAML from "yaml";

export type Indent = 2 | 4 | "tab";

export interface JsonIssue {
  offset: number;
  length: number;
  line: number; // 从 1 开始
  column: number; // 从 1 开始
  message: string;
  hint?: string;
}

const MESSAGES: Partial<Record<ParseErrorCode, string>> = {
  [ParseErrorCode.InvalidSymbol]: "这里有无法识别的内容",
  [ParseErrorCode.InvalidNumberFormat]: "数字格式不对",
  [ParseErrorCode.PropertyNameExpected]: "这里应该是带双引号的键名",
  [ParseErrorCode.ValueExpected]: "这里需要一个值",
  [ParseErrorCode.ColonExpected]: "这里需要冒号",
  [ParseErrorCode.CommaExpected]: "这里需要逗号",
  [ParseErrorCode.CloseBraceExpected]: "缺少右花括号 }",
  [ParseErrorCode.CloseBracketExpected]: "缺少右方括号 ]",
  [ParseErrorCode.EndOfFileExpected]: "JSON 已经结束，后面还有多余内容",
  [ParseErrorCode.InvalidCommentToken]: "标准 JSON 不支持注释",
  [ParseErrorCode.UnexpectedEndOfComment]: "注释没有闭合",
  [ParseErrorCode.UnexpectedEndOfString]: "字符串没有闭合，缺少结尾的双引号",
  [ParseErrorCode.UnexpectedEndOfNumber]: "数字没有写完",
  [ParseErrorCode.InvalidUnicode]: "\\u 后面的 Unicode 编码不合法",
  [ParseErrorCode.InvalidEscapeCharacter]: "无效的转义字符",
  [ParseErrorCode.InvalidCharacter]: "字符串里有没转义的换行或控制字符",
};

export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: offset - lastBreak };
}

function prevNonSpace(text: string, offset: number): number {
  let i = offset - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  return i;
}

function toIssue(text: string, e: ParseError): JsonIssue {
  const { line, column } = offsetToLineCol(text, e.offset);
  const issue: JsonIssue = {
    offset: e.offset,
    length: Math.max(1, e.length),
    line,
    column,
    message: MESSAGES[e.error] ?? "格式错误",
  };
  if (e.error === ParseErrorCode.CommaExpected) {
    const p = prevNonSpace(text, e.offset);
    if (p >= 0) {
      const prev = offsetToLineCol(text, p);
      if (prev.line < line) issue.hint = `第 ${prev.line} 行末尾少了一个逗号`;
    }
  }
  if (e.error === ParseErrorCode.PropertyNameExpected || e.error === ParseErrorCode.InvalidSymbol) {
    const ch = text[e.offset];
    if (ch === "'") issue.hint = "标准 JSON 的字符串要用双引号";
    else if (ch && /[A-Za-z_$]/.test(ch)) issue.hint = "键名没加双引号，这是 JS 对象写法";
    else if (ch === "}" || ch === "]") issue.hint = "最后一项后面多了逗号";
  }
  if (e.error === ParseErrorCode.ValueExpected && (text[e.offset] === "}" || text[e.offset] === "]")) {
    issue.hint = "最后一项后面多了逗号";
  }
  return issue;
}

/** 严格校验，返回所有问题（空数组表示合法）。 */
export function validate(text: string): JsonIssue[] {
  if (!text.trim()) return [];
  const errors: ParseError[] = [];
  jsoncParse(text, errors, { allowTrailingComma: false, disallowComments: true, allowEmptyContent: false });
  return errors.map((e) => toIssue(text, e));
}

export function isValidJson(text: string): boolean {
  return text.trim() !== "" && validate(text).length === 0;
}

/** 格式化。调用前应先确认合法。 */
export function formatJson(text: string, indent: Indent = 2): string {
  const edits = jsoncFormat(text, undefined, {
    tabSize: indent === "tab" ? 1 : indent,
    insertSpaces: indent !== "tab",
    eol: "\n",
    insertFinalNewline: false,
    keepLines: false,
  });
  return applyEdits(text, edits).trim();
}

/** 压缩成一行：只去掉空白，数值和字符串保持原文。 */
export function minifyJson(text: string): string {
  const scanner = createScanner(text, false);
  let out = "";
  let kind = scanner.scan();
  while (kind !== SyntaxKind.EOF) {
    if (
      kind !== SyntaxKind.Trivia &&
      kind !== SyntaxKind.LineBreakTrivia &&
      kind !== SyntaxKind.LineCommentTrivia &&
      kind !== SyntaxKind.BlockCommentTrivia
    ) {
      out += text.substring(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength());
    }
    kind = scanner.scan();
  }
  return out;
}

/** 转义：把整段文本变成一个 JSON 字符串字面量。 */
export function escapeJson(text: string): string {
  return JSON.stringify(text);
}

/** 反转义一层。不是转义字符串时返回 null。 */
function unescapeOnce(text: string): string | null {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try {
      const v = JSON.parse(t);
      if (typeof v === "string") return v;
    } catch {
      /* 继续尝试下面的写法 */
    }
  }
  // 日志里常见：没有外层引号，但内部是 {\"a\":1}
  if (/\\["\\nrtu/]/.test(t) && !isValidJson(t)) {
    try {
      const v = JSON.parse(`"${t}"`);
      if (typeof v === "string") return v;
    } catch {
      return null;
    }
  }
  return null;
}

/** 反转义，逐层解开，直到得到合法 JSON 或无法继续（最多 8 层）。 */
export function unescapeJson(text: string): { text: string; layers: number } {
  let current = text;
  let layers = 0;
  while (layers < 8) {
    const next = unescapeOnce(current);
    if (next === null) break;
    current = next;
    layers++;
    if (isValidJson(current) && !current.trim().startsWith('"')) break;
  }
  return { text: current, layers };
}

// ---------------------------------------------------------------------------
// 其他格式 → JSON
// ---------------------------------------------------------------------------

export type SourceKind = "json" | "escaped" | "jsobject" | "query" | "kv" | "yaml" | "invalid-json" | "empty" | "unknown";

export interface Detection {
  kind: SourceKind;
  label: string;
  layers?: number;
}

const QUERY_RE = /^\??[^=&\s]+=[^&\s]*(&[^=&\s]+=[^&\s]*)*$/;

function looksLikeKv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  return lines.length > 0 && lines.every((l) => /^\s*[^=\s][^=]*=/.test(l));
}

export function detect(text: string): Detection {
  const t = text.trim();
  if (!t) return { kind: "empty", label: "" };
  if (isValidJson(t)) {
    if (t.startsWith('"')) {
      const u = unescapeJson(t);
      if (u.layers > 0 && isValidJson(u.text) && !u.text.trim().startsWith('"')) {
        return { kind: "escaped", label: `转义字符串（${u.layers} 层）`, layers: u.layers };
      }
    }
    return { kind: "json", label: "标准 JSON" };
  }
  const u = unescapeJson(t);
  if (u.layers > 0 && isValidJson(u.text)) {
    return { kind: "escaped", label: `转义字符串（${u.layers} 层）`, layers: u.layers };
  }
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const fixed = jsLiteralToJson(t);
      if (isValidJson(fixed)) return { kind: "jsobject", label: "JS 对象写法" };
    } catch {
      /* 不是 JS 对象 */
    }
    return { kind: "invalid-json", label: looksLikeJsObject(t) ? "JS 对象写法" : "JSON（有错误）" };
  }
  const queryPart = t.includes("?") && /^https?:\/\//.test(t) ? t.slice(t.indexOf("?") + 1) : t;
  if (QUERY_RE.test(queryPart)) return { kind: "query", label: "URL 参数" };
  if (looksLikeKv(t)) return { kind: "kv", label: "键值对" };
  try {
    const v = YAML.parse(t);
    if (v !== null && typeof v === "object") return { kind: "yaml", label: "YAML" };
  } catch {
    /* 不是 YAML */
  }
  return { kind: "unknown", label: "无法识别" };
}

function looksLikeJsObject(t: string): boolean {
  return /[{,]\s*[A-Za-z_$][\w$]*\s*:/.test(t) || /'[^']*'/.test(t) || /\/\/|\/\*/.test(t);
}

/**
 * 把 JS 对象字面量文本转换成 JSON 文本：
 * 键名补双引号、单引号字符串改双引号、去掉注释和末尾逗号、undefined/NaN/Infinity 改 null。
 * 数字按原文复制，不会丢精度。
 */
export function jsLiteralToJson(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isId = (c: string) => /[\w$]/.test(c);

  const readString = (quote: string): string => {
    // i 指向开头引号
    let value = "";
    i++;
    while (i < n && src[i] !== quote) {
      if (src[i] === "\\") {
        const next = src[i + 1];
        if (next === "'") value += "'";
        else if (next === "\n") {
          /* 行尾续行 */
        } else value += "\\" + next;
        i += 2;
        continue;
      }
      if (src[i] === '"') value += '\\"';
      else if (src[i] === "\n") value += "\\n";
      else value += src[i];
      i++;
    }
    i++; // 跳过结尾引号
    return `"${value}"`;
  };

  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += readString(c);
      continue;
    }
    if (c === ",") {
      // 末尾逗号：后面（跳过空白和注释）紧跟 } 或 ]
      let j = i + 1;
      while (j < n) {
        if (/\s/.test(src[j])) j++;
        else if (src[j] === "/" && src[j + 1] === "/") {
          while (j < n && src[j] !== "\n") j++;
        } else if (src[j] === "/" && src[j + 1] === "*") {
          const end = src.indexOf("*/", j + 2);
          j = end === -1 ? n : end + 2;
        } else break;
      }
      if (src[j] === "}" || src[j] === "]") {
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (isIdStart(c)) {
      let j = i;
      while (j < n && isId(src[j])) j++;
      const word = src.slice(i, j);
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === ":") out += JSON.stringify(word);
      else if (word === "true" || word === "false" || word === "null") out += word;
      else if (word === "undefined" || word === "NaN" || word === "Infinity") out += "null";
      else out += word;
      i = j;
      continue;
    }
    if (c === "+" && /[\d.]/.test(src[i + 1] ?? "")) {
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 在报“缺少逗号”的位置自动补逗号，最多补 50 处。 */
export function autoFixCommas(text: string): string {
  let current = text;
  for (let round = 0; round < 50; round++) {
    const errors: ParseError[] = [];
    jsoncParse(current, errors, { allowTrailingComma: false, disallowComments: true });
    const e = errors.find((x) => x.error === ParseErrorCode.CommaExpected);
    if (!e) break;
    const p = prevNonSpace(current, e.offset);
    current = current.slice(0, p + 1) + "," + current.slice(p + 1);
  }
  return current;
}

function stringifyWithBigInt(value: unknown, indent: Indent): string {
  const pad = indent === "tab" ? "\t" : " ".repeat(indent);
  const walk = (v: unknown, depth: number): string => {
    if (typeof v === "bigint") return v.toString();
    if (v === undefined) return "null";
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
    const inner = pad.repeat(depth + 1);
    const close = pad.repeat(depth);
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      return `[\n${v.map((x) => inner + walk(x, depth + 1)).join(",\n")}\n${close}]`;
    }
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${walk(x, depth + 1)}`).join(",\n")}\n${close}}`;
  };
  return walk(value, 0);
}

export function queryToJson(text: string, indent: Indent = 2): string {
  let t = text.trim();
  if (/^https?:\/\//.test(t)) t = t.includes("?") ? t.slice(t.indexOf("?") + 1) : "";
  t = t.replace(/^\?/, "").replace(/#.*$/, "");
  const params = new URLSearchParams(t);
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of params) {
    const prev = obj[k];
    if (prev === undefined) obj[k] = v;
    else obj[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return stringifyWithBigInt(obj, indent);
}

export function kvToJson(text: string, indent: Indent = 2): string {
  const obj: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().replace(/^export\s+/, "");
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    obj[key] = value;
  }
  return stringifyWithBigInt(obj, indent);
}

export function yamlToJson(text: string, indent: Indent = 2): string {
  const value = YAML.parse(text, { intAsBigInt: true });
  return stringifyWithBigInt(value, indent);
}

export function jsObjectToJson(text: string, indent: Indent = 2): string {
  const json = autoFixCommas(jsLiteralToJson(text));
  if (!isValidJson(json)) {
    const issue = validate(json)[0];
    throw new Error(issue ? `第 ${issue.line} 行第 ${issue.column} 列：${issue.message}` : "无法转换");
  }
  return formatJson(json, indent);
}

export type ConvertFrom = "query" | "kv" | "yaml" | "jsobject";

export function convertToJson(text: string, from: ConvertFrom, indent: Indent = 2): string {
  switch (from) {
    case "query":
      return queryToJson(text, indent);
    case "kv":
      return kvToJson(text, indent);
    case "yaml":
      return yamlToJson(text, indent);
    case "jsobject":
      return jsObjectToJson(text, indent);
  }
}

// ---------------------------------------------------------------------------
// 大整数提示 & 树形结构
// ---------------------------------------------------------------------------

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function isUnsafeInteger(raw: string): boolean {
  if (!/^-?\d+$/.test(raw)) return false;
  const v = BigInt(raw);
  return v > MAX_SAFE || v < -MAX_SAFE;
}

/** 找出所有超过 JS 安全整数范围的数字，返回所在行号（从 1 开始）。 */
export function findUnsafeIntegers(text: string): { line: number; raw: string; key?: string }[] {
  const root = parseTree(text);
  const found: { line: number; raw: string; key?: string }[] = [];
  const visit = (node: JsonNode | undefined, key?: string) => {
    if (!node) return;
    if (node.type === "number") {
      const raw = text.substr(node.offset, node.length);
      if (isUnsafeInteger(raw)) found.push({ line: offsetToLineCol(text, node.offset).line, raw, key });
    }
    if (node.type === "property") visit(node.children?.[1], node.children?.[0]?.value);
    else node.children?.forEach((c) => visit(c, key));
  };
  visit(root);
  return found;
}

export type TreeType = "object" | "array" | "string" | "number" | "boolean" | "null";

export interface TreeNode {
  id: string;
  key: string | number | null; // 根节点为 null
  type: TreeType;
  raw: string; // 原文（标量）或摘要（对象/数组）
  path: (string | number)[];
  children?: TreeNode[];
  unsafe?: boolean;
}

export function buildTree(text: string): TreeNode | null {
  const root = parseTree(text);
  if (!root) return null;
  let counter = 0;
  const make = (node: JsonNode, key: string | number | null, path: (string | number)[]): TreeNode => {
    const id = `n${counter++}`;
    if (node.type === "object") {
      const children = (node.children ?? []).map((prop) => {
        const k = prop.children?.[0]?.value as string;
        const v = prop.children?.[1] as JsonNode;
        return make(v, k, [...path, k]);
      });
      return { id, key, type: "object", raw: `对象 · ${children.length} 项`, path, children };
    }
    if (node.type === "array") {
      const children = (node.children ?? []).map((c, idx) => make(c, idx, [...path, idx]));
      return { id, key, type: "array", raw: `数组 · ${children.length} 项`, path, children };
    }
    const raw = text.substr(node.offset, node.length);
    const type: TreeType = node.type === "null" ? "null" : (node.type as TreeType);
    return { id, key, type, raw, path, unsafe: type === "number" && isUnsafeInteger(raw) };
  };
  return make(root, null, []);
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

export function toJsonPath(path: (string | number)[]): string {
  return (
    "$" +
    path
      .map((p) => (typeof p === "number" ? `[${p}]` : IDENT.test(p) ? `.${p}` : `[${JSON.stringify(p).replace(/^"|"$/g, "'")}]`))
      .join("")
  );
}

export function toJsPath(path: (string | number)[], rootName = "data"): string {
  return (
    rootName +
    path.map((p) => (typeof p === "number" ? `[${p}]` : IDENT.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`)).join("")
  );
}

/** 节点的值原文（复制值用）：标量取原文，对象/数组取对应文本片段。 */
export function nodeValueText(text: string, path: (string | number)[]): string {
  let node = parseTree(text);
  for (const seg of path) {
    if (!node) return "";
    if (node.type === "object") {
      const prop = node.children?.find((p) => p.children?.[0]?.value === seg);
      node = prop?.children?.[1];
    } else if (node.type === "array") {
      node = node.children?.[seg as number];
    } else return "";
  }
  if (!node) return "";
  const raw = text.substr(node.offset, node.length);
  if (node.type === "string") return node.value as string;
  if (node.type === "object" || node.type === "array") return formatJson(raw, 2);
  return raw;
}

// ---------------------------------------------------------------------------
// 语法高亮
// ---------------------------------------------------------------------------

export type TokenClass = "key" | "string" | "number" | "literal" | "punct" | "space";

export interface Token {
  text: string;
  cls: TokenClass;
}

/** 按行切分的高亮 token。 */
export function highlightLines(text: string): Token[][] {
  const lines: Token[][] = [[]];
  const push = (t: string, cls: TokenClass) => {
    const parts = t.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, cls });
    });
  };
  const scanner = createScanner(text, false);
  let kind = scanner.scan();
  const tokens: { kind: SyntaxKind; text: string }[] = [];
  while (kind !== SyntaxKind.EOF) {
    tokens.push({ kind, text: text.substr(scanner.getTokenOffset(), scanner.getTokenLength()) });
    kind = scanner.scan();
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.kind) {
      case SyntaxKind.StringLiteral: {
        let j = i + 1;
        while (j < tokens.length && (tokens[j].kind === SyntaxKind.Trivia || tokens[j].kind === SyntaxKind.LineBreakTrivia)) j++;
        push(t.text, tokens[j]?.kind === SyntaxKind.ColonToken ? "key" : "string");
        break;
      }
      case SyntaxKind.NumericLiteral:
        push(t.text, "number");
        break;
      case SyntaxKind.TrueKeyword:
      case SyntaxKind.FalseKeyword:
      case SyntaxKind.NullKeyword:
        push(t.text, "literal");
        break;
      case SyntaxKind.Trivia:
      case SyntaxKind.LineBreakTrivia:
        push(t.text, "space");
        break;
      default:
        push(t.text, "punct");
    }
  }
  return lines;
}
