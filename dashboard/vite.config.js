import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the built dashboard work from any sub-folder, such as https://user.github.io/repo/admin/
export default defineConfig({ base: "./", plugins: [react()] });
