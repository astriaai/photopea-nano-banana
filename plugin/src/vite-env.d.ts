/// <reference types="vite/client" />

declare const __PLUGIN_VERSION__: string;

declare module "*.png" {
  const src: string;
  export default src;
}
