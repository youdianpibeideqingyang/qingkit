import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  convertToJson,
  detect,
  escapeJson,
  findUnsafeIntegers,
  formatJson,
  highlightLines,
  isValidJson,
  jsObjectToJson,
  minifyJson,
  unescapeJson,
  validate,
  type ConvertFrom,
  type Indent,
  type JsonIssue,
  type SourceKind,
} from "../lib/json";
import { writeClipboardText } from "../lib/bridge";
import { loadPref, savePref } from "../lib/useToast";
import { IconBraces, IconCheckCircle, IconChevronDown, IconError, IconInfo, IconSearch, IconWarn } from "./Icons";
import { JsonTree } from "./JsonTree";

type View = "text" | "tree";
type Mode = "format" | "minify";

interface Output {
  text: string;
  notes: string[];
  valid: boolean;
}

const CONVERT_OPTIONS: { from: ConvertFrom; label: string; example: string }[] = [
  { from: "query", label: "URL 参数", example: "a=1&b=2 或完整链接" },
  { from: "kv", label: "键值对 / .env", example: "KEY=value，每行一个" },
  { from: "yaml", label: "YAML", example: "key: value" },
  { from: "jsobject", label: "JS 对象", example: "{ a: 1, b: 'x' }" },
];

const SOURCE_LABEL: Record<string, string> = {
  query: "URL 参数",
  kv: "键值对",
  yaml: "YAML",
  jsobject: "JS 对象",
};

const HIGHLIGHT_LIMIT = 300_000;
const DETECT_LIMIT = 2_000_000;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function JsonPanel({ toast }: { toast: (msg: string) => void }) {
  const [input, setInput] = useState<string>(() => loadPref("json.input", ""));
  const [indent, setIndent] = useState<Indent>(() => loadPref<Indent>("json.indent", 2));
  const [view, setView] = useState<View>(() => loadPref<View>("json.view", "text"));
  const [output, setOutput] = useState<Output | null>(null);
  const [issues, setIssues] = useState<{ list: JsonIssue[]; source: "input" | "unescaped"; jsLike: boolean } | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [indentOpen, setIndentOpen] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const convertRef = useRef<HTMLDivElement>(null);
  const indentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => savePref("json.input", input.length < 1_000_000 ? input : ""), 400);
    return () => window.clearTimeout(t);
  }, [input]);
  useEffect(() => savePref("json.indent", indent), [indent]);
  useEffect(() => savePref("json.view", view), [view]);

  useEffect(() => {
    if (!convertOpen && !indentOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (convertRef.current?.contains(t) || indentRef.current?.contains(t)) return;
      setConvertOpen(false);
      setIndentOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [convertOpen, indentOpen]);

  const detection = useMemo(() => (input.length > DETECT_LIMIT ? null : detect(input)), [input]);

  const run = useCallback(
    (mode: Mode, text: string = input) => {
      const t = text.trim();
      if (!t) {
        setOutput(null);
        setIssues(null);
        return;
      }
      const d: { kind: SourceKind } = t.length > DETECT_LIMIT ? { kind: isValidJson(t) ? "json" : "invalid-json" } : detect(t);
      const notes: string[] = [];
      let src = t;
      if (d.kind === "escaped") {
        const u = unescapeJson(t);
        src = u.text;
        notes.push(`已解开 ${u.layers} 层转义`);
      }
      const finish = (json: string) => {
        setOutput({ text: mode === "minify" ? minifyJson(json) : json, notes, valid: true });
        setIssues(null);
      };
      try {
        if (isValidJson(src)) return finish(formatJson(src, indent));
        if (d.kind === "jsobject" || d.kind === "query" || d.kind === "kv" || d.kind === "yaml") {
          const json = convertToJson(src, d.kind, indent);
          notes.push(`已从${SOURCE_LABEL[d.kind]}转换`);
          return finish(json);
        }
      } catch (e) {
        toast(String(e instanceof Error ? e.message : e));
      }
      setOutput(null);
      setIssues({
        list: validate(src),
        source: src === t ? "input" : "unescaped",
        jsLike: d.kind === "invalid-json" && /[{,]\s*[A-Za-z_$][\w$]*\s*:|'/.test(src),
      });
    },
    [input, indent, toast],
  );

  // 缩进改变时重新格式化
  useEffect(() => {
    if (output?.valid && output.text.includes("\n")) run("format");
  }, [indent]);

  const doEscape = () => {
    if (!input) return;
    const src = isValidJson(input) ? minifyJson(input) : input;
    setOutput({ text: escapeJson(src), notes: ["已转义为字符串"], valid: false });
    setIssues(null);
    setView("text");
  };

  const doUnescape = () => {
    const u = unescapeJson(input);
    if (u.layers === 0) return toast("没有需要反转义的内容");
    const valid = isValidJson(u.text);
    setOutput({ text: valid ? formatJson(u.text, indent) : u.text, notes: [`已解开 ${u.layers} 层转义`], valid });
    setIssues(null);
  };

  const doConvert = (from: ConvertFrom) => {
    setConvertOpen(false);
    try {
      const json = convertToJson(input, from, indent);
      setOutput({ text: json, notes: [`已从${SOURCE_LABEL[from]}转换`], valid: true });
      setIssues(null);
    } catch (e) {
      toast(`转换失败：${e instanceof Error ? e.message : e}`);
    }
  };

  const fixAsJsObject = () => {
    try {
      const json = jsObjectToJson(issues?.source === "unescaped" ? unescapeJson(input).text : input, indent);
      setOutput({ text: json, notes: ["已补全逗号并按 JS 对象转换"], valid: true });
      setIssues(null);
    } catch (e) {
      toast(`还是无法转换：${e instanceof Error ? e.message : e}`);
    }
  };

  const jumpTo = (issue: JsonIssue) => {
    const ta = textareaRef.current;
    if (!ta || issues?.source !== "input") return;
    const start = input.indexOf(input.trim()) + issue.offset;
    ta.focus();
    ta.setSelectionRange(start, start + issue.length);
    const lineHeight = 17;
    ta.scrollTop = Math.max(0, (issue.line - 3) * lineHeight);
  };

  const unsafe = useMemo(() => (output?.valid && output.text.length < HIGHLIGHT_LIMIT ? findUnsafeIntegers(output.text) : []), [output]);
  const unsafeLines = useMemo(() => new Set(unsafe.map((u) => u.line)), [unsafe]);
  const lines = useMemo(() => (output && output.text.length < HIGHLIGHT_LIMIT ? highlightLines(output.text) : null), [output]);
  const bytes = useMemo(() => (output ? new TextEncoder().encode(output.text).length : 0), [output]);
  const lineCount = output ? output.text.split("\n").length : 0;

  const showTree = view === "tree" && output?.valid;
  const collapsed = showTree && !inputExpanded && input.length > 0;
  const hasIssues = !!issues && issues.list.length > 0;

  return (
    <>
      {collapsed ? (
        <button className="collapsed-input" onClick={() => setInputExpanded(true)}>
          <IconChevronDown size={11} />
          <span className="s">{input.slice(0, 120)}</span>
          <span style={{ color: "var(--accent-text)" }}>展开输入</span>
        </button>
      ) : (
        <>
          <div className="row-between">
            <label htmlFor="json-in" className="label">
              输入
            </label>
            {detection && detection.kind !== "empty" && (
              <span className={`detect ${detection.kind === "unknown" || detection.kind === "invalid-json" ? "neutral" : ""}`}>
                <IconSearch size={12} />
                识别为：{detection.label}
              </span>
            )}
          </div>
          <textarea
            id="json-in"
            ref={textareaRef}
            className={`json-input ${hasIssues && issues?.source === "input" ? "error" : ""}`}
            spellCheck={false}
            autoComplete="off"
            placeholder="粘贴 JSON、转义字符串、URL 参数、键值对、YAML 或 JS 对象，粘贴后自动格式化"
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              if ((e.nativeEvent as InputEvent).inputType === "insertFromPaste") run("format", v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                run("format");
              }
            }}
          />
        </>
      )}

      <div className="toolbar">
        <button className="btn primary small" onClick={() => run("format")} disabled={!input.trim()}>
          格式化 <span className="kbd">⌘↵</span>
        </button>
        <button className="btn small" onClick={() => run("minify")} disabled={!input.trim()}>
          压缩
        </button>
        <button className="btn small" onClick={doEscape} disabled={!input}>
          转义
        </button>
        <button className="btn small" onClick={doUnescape} disabled={!input.trim()}>
          反转义
        </button>
        <div className="dropdown" ref={convertRef}>
          <button className="btn small" aria-haspopup="menu" aria-expanded={convertOpen} onClick={() => setConvertOpen((v) => !v)} disabled={!input.trim()}>
            转为 JSON <IconChevronDown />
          </button>
          {convertOpen && (
            <div className="menu small" role="menu" style={{ left: 0, right: "auto", width: 220 }}>
              {CONVERT_OPTIONS.map((o) => (
                <button key={o.from} className="opt" role="menuitem" onClick={() => doConvert(o.from)}>
                  <span className="body">
                    <span className="t">{o.label}</span>
                    <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{o.example}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {hasIssues && issues && (
        <div className="banner err">
          {issues.list.slice(0, 2).map((i, idx) => (
            <div className="row" key={idx}>
              <IconError size={16} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <b>
                  {issues.source === "unescaped" ? "反转义后 " : ""}第 {i.line} 行第 {i.column} 列：{i.message}
                </b>
                {i.hint && <span style={{ opacity: 0.85 }}>{i.hint}</span>}
              </div>
            </div>
          ))}
          {issues.list.length > 2 && <span style={{ opacity: 0.85 }}>后面还有 {issues.list.length - 2} 处问题（多半是第一处引起的）</span>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {issues.source === "input" && (
              <button className="btn small" onClick={() => jumpTo(issues.list[0])}>
                跳到第 {issues.list[0].line} 行
              </button>
            )}
            {(issues.jsLike || issues.list.some((i) => i.message === "这里需要逗号")) && (
              <button className="btn small" onClick={fixAsJsObject}>
                补上逗号并按 JS 对象转换
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card out">
        <div className="out-head">
          <div className="seg small">
            <button aria-pressed={view === "text"} onClick={() => setView("text")}>
              文本
            </button>
            <button
              aria-pressed={view === "tree"}
              onClick={() => {
                setView("tree");
                setInputExpanded(false);
                if (!output && input.trim()) run("format");
              }}
            >
              树形
            </button>
          </div>
          <div className="dropdown" ref={indentRef}>
            <button
              className="btn link"
              style={{ color: "var(--text-2)" }}
              aria-haspopup="menu"
              aria-expanded={indentOpen}
              onClick={() => setIndentOpen((v) => !v)}
            >
              缩进 {indent === "tab" ? "Tab" : indent} <IconChevronDown />
            </button>
            {indentOpen && (
              <div className="menu small" role="menu" style={{ width: 120, left: 0, right: "auto" }}>
                {([2, 4, "tab"] as Indent[]).map((v) => (
                  <button
                    key={String(v)}
                    className="opt"
                    role="menuitemradio"
                    aria-checked={indent === v}
                    aria-selected={indent === v}
                    onClick={() => {
                      setIndent(v);
                      setIndentOpen(false);
                    }}
                  >
                    <span className="t">{v === "tab" ? "Tab" : `${v} 空格`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="grow" />
          <button className="btn link" disabled={!output} onClick={() => output && (setInput(output.text), toast("已替换输入"))}>
            替换输入
          </button>
          <button
            className="btn link"
            disabled={!output}
            onClick={async () => {
              if (!output) return;
              await writeClipboardText(output.text);
              toast("已复制结果");
            }}
          >
            复制结果
          </button>
        </div>

        {!output ? (
          <div className="empty-out">
            <IconBraces size={28} style={{ color: "var(--muted)" }} />
            {hasIssues ? "修正后在这里显示结果" : "结果会显示在这里"}
          </div>
        ) : showTree ? (
          <JsonTree text={output.text} toast={toast} />
        ) : (
          <>
            <div className="code">
              {lines ? (
                lines.map((tokens, idx) => (
                  <div className={`ln ${unsafeLines.has(idx + 1) ? "flag" : ""}`} key={idx}>
                    <span className="num">{idx + 1}</span>
                    <span>
                      {tokens.map((t, j) =>
                        t.cls === "space" || t.cls === "punct" ? (
                          <span key={j}>{t.text}</span>
                        ) : (
                          <span key={j} className={`t-${t.cls}`}>
                            {t.text}
                          </span>
                        ),
                      )}
                    </span>
                  </div>
                ))
              ) : (
                <div className="plain">{output.text}</div>
              )}
            </div>
            <div className="out-foot">
              <div className={`status ${output.valid ? "ok" : "muted"}`} style={{ fontSize: 11.5 }}>
                {output.valid ? <IconCheckCircle size={13} /> : <IconInfo size={13} />}
                {[output.valid ? "有效 JSON" : null, ...output.notes, `${lineCount} 行`, formatBytes(bytes)].filter(Boolean).join(" · ")}
              </div>
              {unsafe.length > 0 && (
                <div className="status warn" style={{ fontSize: 11.5 }}>
                  <IconWarn size={13} />
                  {unsafe.length === 1
                    ? `第 ${unsafe[0].line} 行${unsafe[0].key ? ` ${unsafe[0].key}` : ""} 超出 JS 安全整数，已按原文保留`
                    : `${unsafe.length} 个数字超出 JS 安全整数，已按原文保留`}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
