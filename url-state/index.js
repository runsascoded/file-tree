// src/url-state/index.ts
import { useUrlState, defStringParam, intParam } from "use-prms";
var useUrlPersistedState = (key, defaultValue) => {
  if (typeof defaultValue === "number") {
    return useUrlState(key, intParam(defaultValue));
  }
  return useUrlState(key, defStringParam(defaultValue));
};
export {
  useUrlPersistedState
};
//# sourceMappingURL=index.js.map