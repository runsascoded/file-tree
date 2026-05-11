// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};
export {
  NotFoundError
};
//# sourceMappingURL=index.js.map