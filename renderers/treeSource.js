// src/renderers/treeSource.ts
var TreeTooLargeError = class extends Error {
  constructor(message, nodesWalked) {
    super(message);
    this.nodesWalked = nodesWalked;
  }
  nodesWalked;
  name = "TreeTooLargeError";
};
var SnapshotNotFoundError = class extends Error {
  constructor(snapshot) {
    super(`no such snapshot: ${snapshot}`);
    this.snapshot = snapshot;
  }
  snapshot;
  name = "SnapshotNotFoundError";
};
function diffStatus(a, b) {
  if (!a) return "added";
  if (!b) return "removed";
  if (a.size !== b.size || (a.nDesc ?? null) !== (b.nDesc ?? null) || a.kind !== b.kind) return "changed";
  if ((a.mtime ?? null) !== (b.mtime ?? null)) return "touched";
  return "unchanged";
}
function diffNode(a, b) {
  const n = b ?? a;
  return {
    path: n.path,
    name: n.name,
    kind: n.kind,
    status: diffStatus(a, b),
    sizeA: a ? a.size : null,
    sizeB: b ? b.size : null,
    nDescA: a?.nDesc ?? null,
    nDescB: b?.nDesc ?? null
  };
}
function diffLevels(a, b) {
  if (!a && !b) throw new Error("diffLevels: node absent from both snapshots");
  const aKids = new Map((a?.children ?? []).map((c) => [c.path, c]));
  const bPaths = new Set((b?.children ?? []).map((c) => c.path));
  const children = [
    ...(b?.children ?? []).map((c) => diffNode(aKids.get(c.path) ?? null, c)),
    ...(a?.children ?? []).filter((c) => !bPaths.has(c.path)).map((c) => diffNode(c, null))
  ];
  return { node: diffNode(a?.node ?? null, b?.node ?? null), children };
}
function nodeName(path) {
  const trimmed = path.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? trimmed : trimmed.slice(i + 1);
}
export {
  SnapshotNotFoundError,
  TreeTooLargeError,
  diffLevels,
  diffNode,
  diffStatus,
  nodeName
};
//# sourceMappingURL=treeSource.js.map