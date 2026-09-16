import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://www.wisemainecoon.com",
  output: "static",
  build: {
    format: "preserve"
  }
});
