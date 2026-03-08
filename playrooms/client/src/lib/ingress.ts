/**
 * HA ingress path detection.
 * The Express server injects window.__INGRESS_PATH__ from the X-Ingress-Path header.
 * Empty string when not behind ingress (direct access).
 */
export const basePath: string = window.__INGRESS_PATH__ || "";
export const apiBase: string = basePath + "/api";
