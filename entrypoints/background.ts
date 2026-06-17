// Background service worker — trusted core.
// Real auth/drive/gateway logic arrives in Plan 2.
export default defineBackground(() => {
  console.debug("[excalistore] background worker ready");
});
