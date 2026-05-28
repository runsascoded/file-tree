type PersistedState = <T extends string | number>(key: string, defaultValue: T) => [T, (value: T) => void];

export type { PersistedState as P };
