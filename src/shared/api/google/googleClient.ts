import ky, { type AfterResponseHook, type BeforeRequestHook, type KyInstance } from "ky";

// ky instances are immutable (hooks are fixed at creation), unlike axios's
// mutable interceptors. These hooks start as no-ops and installAuthInterceptor
// (entities/google/auth) fills them in once from the background composition
// root — shared may not import entities, so the auth logic can't live here.
let beforeRequestHook: BeforeRequestHook | undefined;
let afterResponseHook: AfterResponseHook | undefined;

export const setAuthHooks = (hooks: {
  beforeRequest: BeforeRequestHook;
  afterResponse: AfterResponseHook;
}): void => {
  beforeRequestHook = hooks.beforeRequest;
  afterResponseHook = hooks.afterResponse;
};

export const googleClient: KyInstance = ky.create({
  timeout: 15_000,
  hooks: {
    beforeRequest: [(state) => beforeRequestHook?.(state)],
    afterResponse: [(state) => afterResponseHook?.(state)],
  },
});
