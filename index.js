// src/types.ts
var NotFoundError = class extends Error {
  constructor(path) {
    super(`not found: ${path}`);
    this.name = "NotFoundError";
  }
};
var ForbiddenPathError = class extends Error {
  constructor(label, path) {
    super(`${label} ${JSON.stringify(path)} not under an allowed prefix`);
    this.name = "ForbiddenPathError";
  }
};
export {
  ForbiddenPathError,
  NotFoundError
};
//# sourceMappingURL=index.js.map