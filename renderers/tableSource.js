// src/renderers/tableSource.ts
function kindOfDeclaredType(declared) {
  const t = declared.toUpperCase();
  if (t.includes("INT")) return "number";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "string";
  if (t.includes("BLOB") || t === "") return "binary";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "number";
  if (t.includes("DATE") || t.includes("TIME")) return "temporal";
  if (t.includes("BOOL")) return "boolean";
  if (t.includes("DEC") || t.includes("NUM")) return "number";
  return "string";
}
export {
  kindOfDeclaredType
};
//# sourceMappingURL=tableSource.js.map