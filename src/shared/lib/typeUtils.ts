// Cross-cutting type-level helpers (non-domain TS infrastructure), distinct
// from the "no utils.ts" rule which targets domain modules.
export type ValueOf<T extends object> = T[keyof T];
