/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** "hash" for the Dynamics 365 build */
  readonly VITE_ROUTER?: string;
}
