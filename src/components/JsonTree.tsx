import { memo, useMemo, useState, type ReactNode } from "react";
import { buildTree, nodeValueText, toJsonPath, toJsPath, type TreeNode } from "../lib/json";
import { writeClipboardText } from "../lib/bridge";
import { Segmented } from "./Segmented";
import { detectTimestamp, formatInZone, localZone } from "../lib/time";
import { IconChevronDown, IconCollapseAll, IconExpandAll, IconSearch } from "./Icons";

type PathStyle = "jsonpath" | "js";

const LOCAL_TZ = localZone();
const TS_MIN = Date.UTC(2000, 0, 1);
const TS_MAX = Date.UTC(2100, 0, 1);

/** 数字或纯数字字符串看起来像 2000–2100 年间的秒/毫秒时间戳时，给出本地时间提示。 */
function tsHint(node: TreeNode): string | null {
  if (node.type !== "number" && node.type !== "string") return null;
  const raw = node.type === "string" ? node.raw.slice(1, -1) : node.raw;
  if (!/^\d{10}$|^\d{13}$/.test(raw)) return null;
  const p = detectTimestamp(raw);
  if (!p || p.ms < TS_MIN || p.ms > TS_MAX) return null;
  const f = formatInZone(p.ms, LOCAL_TZ);
  return `${f.date} ${f.time.slice(0, 8)}`;
}

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function collectIds(node: TreeNode, depthLimit: number, depth = 0, out = new Set<string>()): Set<string> {
  if (node.children && depth < depthLimit) {
    out.add(node.id);
    node.children.forEach((c) => collectIds(c, depthLimit, depth + 1, out));
  }
  return out;
}

/** 搜索：返回命中节点及其所有祖先的 id，命中数。 */
function searchTree(root: TreeNode, q: string): { visible: Set<string>; hits: number } {
  const visible = new Set<string>();
  let hits = 0;
  const lower = q.toLowerCase();
  const walk = (n: TreeNode): boolean => {
    const self =
      (n.key !== null && String(n.key).toLowerCase().includes(lower)) || (!n.children && n.raw.toLowerCase().includes(lower));
    if (self) hits++;
    let child = false;
    n.children?.forEach((c) => {
      if (walk(c)) child = true;
    });
    if (self || child) visible.add(n.id);
    return self || child;
  };
  walk(root);
  return { visible, hits };
}

interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  visible: Set<string> | null;
  query: string;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNode) => void;
}

const Row = memo(function Row({ node, depth, expanded, visible, query, selectedId, onToggle, onSelect }: RowProps) {
  if (visible && !visible.has(node.id)) return null;
  const isOpen = visible ? true : expanded.has(node.id);
  const hasChildren = !!node.children && node.children.length > 0;
  const keyText = node.key === null ? "$" : String(node.key);
  const valueClass =
    node.type === "string" ? "t-string" : node.type === "number" ? "t-number" : node.type === "object" || node.type === "array" ? "" : "t-literal";

  return (
    <>
      <div
        className="tree-row"
        role="treeitem"
        aria-selected={selectedId === node.id}
        aria-expanded={hasChildren ? isOpen : undefined}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            className="caret"
            aria-label={isOpen ? "折叠" : "展开"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <IconChevronDown className={`caret-icon ${isOpen ? "" : "closed"}`} />
          </button>
        ) : (
          <span className="caret-space" />
        )}
        <span className={typeof node.key === "number" || node.key === null ? "idx" : "k"}>{highlight(keyText, query)}</span>
        {!node.children && node.key !== null && <span className="colon">:</span>}
        {node.children ? (
          <span className="meta">{node.raw}</span>
        ) : (
          <span className={`v ${valueClass}`}>{highlight(node.raw, query)}</span>
        )}
        {node.unsafe && <span className="big">大整数</span>}
        {tsHint(node) && <span className="ts-hint" title="看起来像时间戳，按本地时间显示">{tsHint(node)}</span>}
      </div>
      {hasChildren &&
        isOpen &&
        node.children!.map((c) => (
          <Row
            key={c.id}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            visible={visible}
            query={query}
            selectedId={selectedId}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
});

export function JsonTree({ text, toast }: { text: string; toast: (m: string) => void }) {
  const root = useMemo(() => buildTree(text), [text]);
  const [expanded, setExpanded] = useState<Set<string>>(() => (root ? collectIds(root, 2) : new Set()));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [pathStyle, setPathStyle] = useState<PathStyle>("jsonpath");

  // 文本变化时重置展开状态
  const [lastText, setLastText] = useState(text);
  if (lastText !== text) {
    setLastText(text);
    setExpanded(root ? collectIds(root, 2) : new Set());
    setSelected(null);
  }

  const search = useMemo(() => (root && query.trim() ? searchTree(root, query.trim()) : null), [root, query]);

  if (!root) return <div className="empty-out">没有可显示的内容</div>;

  const pathOf = (n: TreeNode) => (pathStyle === "jsonpath" ? toJsonPath(n.path) : toJsPath(n.path));

  const onToggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onSelect = async (n: TreeNode) => {
    setSelected(n);
    const p = pathOf(n);
    await writeClipboardText(p);
    toast(`已复制 ${p}`);
  };

  return (
    <>
      <div className="out-head" style={{ paddingLeft: 0, borderBottom: "1px solid var(--divider)" }}>
        <label className="search">
          <IconSearch size={12} />
          <input id="tree-search" aria-label="搜索键或值" placeholder="搜索键或值" value={query} onChange={(e) => setQuery(e.target.value)} />
          {search && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{search.hits} 处</span>}
        </label>
        <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="全部展开" title="全部展开" onClick={() => setExpanded(collectIds(root, Infinity))}>
          <IconExpandAll size={14} />
        </button>
        <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="全部折叠" title="全部折叠" onClick={() => setExpanded(new Set([root.id]))}>
          <IconCollapseAll size={14} />
        </button>
      </div>
      <div className="tree" role="tree">
        <Row
          node={root}
          depth={0}
          expanded={expanded}
          visible={search?.visible ?? null}
          query={query.trim()}
          selectedId={selected?.id ?? null}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      </div>
      <div className="path-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>路径</span>
          <code>{selected ? pathOf(selected) : "点任意节点复制路径"}</code>
          <Segmented
            small
            ariaLabel="路径格式"
            value={pathStyle}
            options={[
              { value: "jsonpath", label: "JSONPath" },
              { value: "js", label: "JS" },
            ]}
            onChange={setPathStyle}
          />
        </div>
        <div className="grid-2">
          <button
            className="btn primary small"
            disabled={!selected}
            onClick={async () => {
              if (!selected) return;
              await writeClipboardText(pathOf(selected));
              toast(`已复制 ${pathOf(selected)}`);
            }}
          >
            复制路径
          </button>
          <button
            className="btn small"
            disabled={!selected}
            onClick={async () => {
              if (!selected) return;
              await writeClipboardText(nodeValueText(text, selected.path));
              toast("已复制值");
            }}
          >
            复制值
          </button>
        </div>
      </div>
    </>
  );
}
