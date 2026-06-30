// Sentinel placeholder values used in server-rendered HTML templates.
// The server emits these strings as img src attributes instead of sending
// large base64 data URIs across the network. The client replaces them with
// the actual image data URIs from its own state after receiving the HTML.
export const SENTINEL_HERO = "__IMG_HERO__";
export const SENTINEL_SECONDARY = "__IMG_SECONDARY__";
export const sentinelGallery = (i: number) => `__IMG_GALLERY_${i}__`;
