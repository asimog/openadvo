import type { OpenAdvoApi } from "../../shared/api.ts";

declare global {
  interface Window {
    openadvo: OpenAdvoApi;
  }
}
export {};
