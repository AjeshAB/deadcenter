import { defineConfig } from "vite";

// GitHub Pages serves the site from /<repo>/; the workflow sets BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
});
