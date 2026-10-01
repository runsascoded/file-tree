"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/renderers/treeSource.ts
var treeSource_exports = {};
__export(treeSource_exports, {
  SnapshotNotFoundError: () => SnapshotNotFoundError,
  TreeTooLargeError: () => TreeTooLargeError,
  diffLevels: () => diffLevels,
  diffNode: () => diffNode,
  diffStatus: () => diffStatus,
  nodeName: () => nodeName
});
module.exports = __toCommonJS(treeSource_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SnapshotNotFoundError,
  TreeTooLargeError,
  diffLevels,
  diffNode,
  diffStatus,
  nodeName
});
//# sourceMappingURL=treeSource.cjs.map