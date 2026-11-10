// vite.config.js
import { defineConfig } from "file:///D:/04_Work/TMT-EGREEN/src-code/DeXuatTram2/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///D:/04_Work/TMT-EGREEN/src-code/DeXuatTram2/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///D:/04_Work/TMT-EGREEN/src-code/DeXuatTram2/frontend/node_modules/@tailwindcss/vite/dist/index.mjs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
var __vite_injected_original_import_meta_url = "file:///D:/04_Work/TMT-EGREEN/src-code/DeXuatTram2/frontend/vite.config.js";
var require2 = createRequire(__vite_injected_original_import_meta_url);
function copyMaplibreWorkerPlugin() {
  const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
  let outputDirectory;
  return {
    name: "copy-maplibre-worker",
    apply: "build",
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir, "assets");
    },
    closeBundle() {
      const outDir = outputDirectory;
      const candidates = [
        resolve(process.cwd(), "node_modules", "maplibre-gl", "dist")
      ];
      try {
        candidates.push(dirname(require2.resolve("maplibre-gl")));
      } catch {
      }
      let copied = 0;
      for (const f of files) {
        for (const dir of candidates) {
          const src = resolve(dir, f);
          if (existsSync(src)) {
            mkdirSync(outDir, { recursive: true });
            copyFileSync(src, resolve(outDir, f));
            copied += 1;
            break;
          }
        }
      }
      if (copied === 0)
        this.warn(
          "copy-maplibre-worker: khong tim thay file worker cua maplibre-gl"
        );
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [react(), tailwindcss(), copyMaplibreWorkerPlugin()],
  optimizeDeps: {
    exclude: ["maplibre-gl"],
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "lucide-react",
      "leaflet",
      "react-leaflet",
      "mathjs",
      "xlsx",
      "mammoth",
      "jszip",
      "file-saver",
      "recharts",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-link",
      "@tiptap/extension-image",
      "@tiptap/extension-table",
      "@tiptap/extension-youtube",
      "@tiptap/extension-placeholder"
    ]
  },
  worker: {
    format: "es"
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true,
      interval: 1e3,
      ignored: ["**/public/pmtiles/**", "**/dist/**", "**/*.pmtiles"]
    },
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate"
    },
    proxy: {
      "/api": {
        target: "http://backend:3000",
        changeOrigin: true
      },
      "/tiles": {
        target: "http://backend:3000",
        changeOrigin: true
      },
      "/files": {
        target: "http://backend:3000",
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return void 0;
          const p = id.replace(/\\/g, "/");
          if (p.includes("maplibre-gl")) return void 0;
          if (p.includes("/node_modules/leaflet/") || p.includes("/node_modules/react-leaflet/") || p.includes("@react-leaflet"))
            return "leaflet";
          if (p.includes("/node_modules/react-router") || p.includes("/node_modules/@remix-run/"))
            return "react-vendor";
          if (/\/node_modules\/(react|react-dom|react-is|scheduler)\//.test(p))
            return "react-vendor";
          if (p.includes("/node_modules/mathjs/")) return "mathjs";
          if (p.includes("/node_modules/xlsx/")) return "xlsx";
          if (p.includes("/node_modules/mammoth/")) return "mammoth";
          if (p.includes("/node_modules/recharts/")) return "recharts";
          if (p.includes("/node_modules/echarts/") || p.includes("/node_modules/zrender/"))
            return "echarts";
          if (p.includes("/node_modules/react-grid-layout/") || p.includes("/node_modules/react-resizable/") || p.includes("/node_modules/react-draggable/"))
            return "rgl";
          if (p.includes("/node_modules/jszip/") || p.includes("/node_modules/file-saver/"))
            return "excel-io";
          if (p.includes("/node_modules/lucide-react/")) return "icons";
          return void 0;
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFwwNF9Xb3JrXFxcXFRNVC1FR1JFRU5cXFxcc3JjLWNvZGVcXFxcRGVYdWF0VHJhbTJcXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXDA0X1dvcmtcXFxcVE1ULUVHUkVFTlxcXFxzcmMtY29kZVxcXFxEZVh1YXRUcmFtMlxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovMDRfV29yay9UTVQtRUdSRUVOL3NyYy1jb2RlL0RlWHVhdFRyYW0yL2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xyXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XHJcbmltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tIFwibm9kZTptb2R1bGVcIjtcclxuaW1wb3J0IHsgZGlybmFtZSwgcmVzb2x2ZSB9IGZyb20gXCJub2RlOnBhdGhcIjtcclxuaW1wb3J0IHsgY29weUZpbGVTeW5jLCBta2RpclN5bmMsIGV4aXN0c1N5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xyXG5cclxuY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcclxuXHJcbi8vIE1hcExpYnJlIHY2IHRcdTFFQTFvIHdvcmtlciBiXHUxRUIxbmcgbmV3IFVSTCgnLi9tYXBsaWJyZS1nbC13b3JrZXIubWpzJywgaW1wb3J0Lm1ldGEudXJsKVxyXG4vLyA9PiBjXHUxRUE3biBmaWxlIHdvcmtlciArIHNoYXJlZCBuXHUxRUIxbSBjXHUxRUExbmggY2h1bmsgdHJvbmcgZGlzdC9hc3NldHMgKFZpdGUga2hcdTAwRjRuZyB0XHUxRUYxIGVtaXQpLlxyXG5mdW5jdGlvbiBjb3B5TWFwbGlicmVXb3JrZXJQbHVnaW4oKSB7XHJcbiAgY29uc3QgZmlsZXMgPSBbXCJtYXBsaWJyZS1nbC13b3JrZXIubWpzXCIsIFwibWFwbGlicmUtZ2wtc2hhcmVkLm1qc1wiXTtcclxuICBsZXQgb3V0cHV0RGlyZWN0b3J5O1xyXG4gIHJldHVybiB7XHJcbiAgICBuYW1lOiBcImNvcHktbWFwbGlicmUtd29ya2VyXCIsXHJcbiAgICBhcHBseTogXCJidWlsZFwiLFxyXG4gICAgY29uZmlnUmVzb2x2ZWQoY29uZmlnKSB7XHJcbiAgICAgIG91dHB1dERpcmVjdG9yeSA9IHJlc29sdmUoY29uZmlnLnJvb3QsIGNvbmZpZy5idWlsZC5vdXREaXIsIFwiYXNzZXRzXCIpO1xyXG4gICAgfSxcclxuICAgIGNsb3NlQnVuZGxlKCkge1xyXG4gICAgICBjb25zdCBvdXREaXIgPSBvdXRwdXREaXJlY3Rvcnk7XHJcbiAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXHJcbiAgICAgICAgcmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBcIm5vZGVfbW9kdWxlc1wiLCBcIm1hcGxpYnJlLWdsXCIsIFwiZGlzdFwiKSxcclxuICAgICAgXTtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjYW5kaWRhdGVzLnB1c2goZGlybmFtZShyZXF1aXJlLnJlc29sdmUoXCJtYXBsaWJyZS1nbFwiKSkpO1xyXG4gICAgICB9IGNhdGNoIHtcclxuICAgICAgICAvKiBpZ25vcmUgKi9cclxuICAgICAgfVxyXG4gICAgICBsZXQgY29waWVkID0gMDtcclxuICAgICAgZm9yIChjb25zdCBmIG9mIGZpbGVzKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBkaXIgb2YgY2FuZGlkYXRlcykge1xyXG4gICAgICAgICAgY29uc3Qgc3JjID0gcmVzb2x2ZShkaXIsIGYpO1xyXG4gICAgICAgICAgaWYgKGV4aXN0c1N5bmMoc3JjKSkge1xyXG4gICAgICAgICAgICBta2RpclN5bmMob3V0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcclxuICAgICAgICAgICAgY29weUZpbGVTeW5jKHNyYywgcmVzb2x2ZShvdXREaXIsIGYpKTtcclxuICAgICAgICAgICAgY29waWVkICs9IDE7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBpZiAoY29waWVkID09PSAwKVxyXG4gICAgICAgIHRoaXMud2FybihcclxuICAgICAgICAgIFwiY29weS1tYXBsaWJyZS13b3JrZXI6IGtob25nIHRpbSB0aGF5IGZpbGUgd29ya2VyIGN1YSBtYXBsaWJyZS1nbFwiLFxyXG4gICAgICAgICk7XHJcbiAgICB9LFxyXG4gIH07XHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcGx1Z2luczogW3JlYWN0KCksIHRhaWx3aW5kY3NzKCksIGNvcHlNYXBsaWJyZVdvcmtlclBsdWdpbigpXSxcclxuICBvcHRpbWl6ZURlcHM6IHtcclxuICAgIGV4Y2x1ZGU6IFtcIm1hcGxpYnJlLWdsXCJdLFxyXG4gICAgaW5jbHVkZTogW1xyXG4gICAgICBcInJlYWN0XCIsXHJcbiAgICAgIFwicmVhY3QtZG9tXCIsXHJcbiAgICAgIFwicmVhY3Qtcm91dGVyLWRvbVwiLFxyXG4gICAgICBcImx1Y2lkZS1yZWFjdFwiLFxyXG4gICAgICBcImxlYWZsZXRcIixcclxuICAgICAgXCJyZWFjdC1sZWFmbGV0XCIsXHJcbiAgICAgIFwibWF0aGpzXCIsXHJcbiAgICAgIFwieGxzeFwiLFxyXG4gICAgICBcIm1hbW1vdGhcIixcclxuICAgICAgXCJqc3ppcFwiLFxyXG4gICAgICBcImZpbGUtc2F2ZXJcIixcclxuICAgICAgXCJyZWNoYXJ0c1wiLFxyXG4gICAgICBcIkB0aXB0YXAvcmVhY3RcIixcclxuICAgICAgXCJAdGlwdGFwL3N0YXJ0ZXIta2l0XCIsXHJcbiAgICAgIFwiQHRpcHRhcC9leHRlbnNpb24tbGlua1wiLFxyXG4gICAgICBcIkB0aXB0YXAvZXh0ZW5zaW9uLWltYWdlXCIsXHJcbiAgICAgIFwiQHRpcHRhcC9leHRlbnNpb24tdGFibGVcIixcclxuICAgICAgXCJAdGlwdGFwL2V4dGVuc2lvbi15b3V0dWJlXCIsXHJcbiAgICAgIFwiQHRpcHRhcC9leHRlbnNpb24tcGxhY2Vob2xkZXJcIixcclxuICAgIF0sXHJcbiAgfSxcclxuICB3b3JrZXI6IHtcclxuICAgIGZvcm1hdDogXCJlc1wiLFxyXG4gIH0sXHJcbiAgc2VydmVyOiB7XHJcbiAgICBob3N0OiBcIjAuMC4wLjBcIixcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgICBhbGxvd2VkSG9zdHM6IHRydWUsXHJcbiAgICB3YXRjaDoge1xyXG4gICAgICB1c2VQb2xsaW5nOiB0cnVlLFxyXG4gICAgICBpbnRlcnZhbDogMTAwMCxcclxuICAgICAgaWdub3JlZDogW1wiKiovcHVibGljL3BtdGlsZXMvKipcIiwgXCIqKi9kaXN0LyoqXCIsIFwiKiovKi5wbXRpbGVzXCJdLFxyXG4gICAgfSxcclxuICAgIGhlYWRlcnM6IHtcclxuICAgICAgXCJDYWNoZS1Db250cm9sXCI6IFwibm8tc3RvcmUsIG5vLWNhY2hlLCBtdXN0LXJldmFsaWRhdGVcIixcclxuICAgIH0sXHJcbiAgICBwcm94eToge1xyXG4gICAgICBcIi9hcGlcIjoge1xyXG4gICAgICAgIHRhcmdldDogXCJodHRwOi8vYmFja2VuZDozMDAwXCIsXHJcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBcIi90aWxlc1wiOiB7XHJcbiAgICAgICAgdGFyZ2V0OiBcImh0dHA6Ly9iYWNrZW5kOjMwMDBcIixcclxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIFwiL2ZpbGVzXCI6IHtcclxuICAgICAgICB0YXJnZXQ6IFwiaHR0cDovL2JhY2tlbmQ6MzAwMFwiLFxyXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiAxMjAwLFxyXG4gICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICBvdXRwdXQ6IHtcclxuICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcclxuICAgICAgICAgIGlmICghaWQuaW5jbHVkZXMoXCJub2RlX21vZHVsZXNcIikpIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICAgICAgICBjb25zdCBwID0gaWQucmVwbGFjZSgvXFxcXC9nLCBcIi9cIik7XHJcbiAgICAgICAgICBpZiAocC5pbmNsdWRlcyhcIm1hcGxpYnJlLWdsXCIpKSByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBwLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9sZWFmbGV0L1wiKSB8fFxyXG4gICAgICAgICAgICBwLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9yZWFjdC1sZWFmbGV0L1wiKSB8fFxyXG4gICAgICAgICAgICBwLmluY2x1ZGVzKFwiQHJlYWN0LWxlYWZsZXRcIilcclxuICAgICAgICAgIClcclxuICAgICAgICAgICAgcmV0dXJuIFwibGVhZmxldFwiO1xyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBwLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9yZWFjdC1yb3V0ZXJcIikgfHxcclxuICAgICAgICAgICAgcC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvQHJlbWl4LXJ1bi9cIilcclxuICAgICAgICAgIClcclxuICAgICAgICAgICAgcmV0dXJuIFwicmVhY3QtdmVuZG9yXCI7XHJcbiAgICAgICAgICBpZiAoL1xcL25vZGVfbW9kdWxlc1xcLyhyZWFjdHxyZWFjdC1kb218cmVhY3QtaXN8c2NoZWR1bGVyKVxcLy8udGVzdChwKSlcclxuICAgICAgICAgICAgcmV0dXJuIFwicmVhY3QtdmVuZG9yXCI7XHJcbiAgICAgICAgICBpZiAocC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvbWF0aGpzL1wiKSkgcmV0dXJuIFwibWF0aGpzXCI7XHJcbiAgICAgICAgICBpZiAocC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMveGxzeC9cIikpIHJldHVybiBcInhsc3hcIjtcclxuICAgICAgICAgIGlmIChwLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9tYW1tb3RoL1wiKSkgcmV0dXJuIFwibWFtbW90aFwiO1xyXG4gICAgICAgICAgaWYgKHAuaW5jbHVkZXMoXCIvbm9kZV9tb2R1bGVzL3JlY2hhcnRzL1wiKSkgcmV0dXJuIFwicmVjaGFydHNcIjtcclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgcC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvZWNoYXJ0cy9cIikgfHxcclxuICAgICAgICAgICAgcC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvenJlbmRlci9cIilcclxuICAgICAgICAgIClcclxuICAgICAgICAgICAgcmV0dXJuIFwiZWNoYXJ0c1wiO1xyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBwLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9yZWFjdC1ncmlkLWxheW91dC9cIikgfHxcclxuICAgICAgICAgICAgcC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvcmVhY3QtcmVzaXphYmxlL1wiKSB8fFxyXG4gICAgICAgICAgICBwLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9yZWFjdC1kcmFnZ2FibGUvXCIpXHJcbiAgICAgICAgICApXHJcbiAgICAgICAgICAgIHJldHVybiBcInJnbFwiO1xyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBwLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9qc3ppcC9cIikgfHxcclxuICAgICAgICAgICAgcC5pbmNsdWRlcyhcIi9ub2RlX21vZHVsZXMvZmlsZS1zYXZlci9cIilcclxuICAgICAgICAgIClcclxuICAgICAgICAgICAgcmV0dXJuIFwiZXhjZWwtaW9cIjtcclxuICAgICAgICAgIGlmIChwLmluY2x1ZGVzKFwiL25vZGVfbW9kdWxlcy9sdWNpZGUtcmVhY3QvXCIpKSByZXR1cm4gXCJpY29uc1wiO1xyXG4gICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9LFxyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF1VixTQUFTLG9CQUFvQjtBQUNwWCxPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFDeEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyxjQUFjLFdBQVcsa0JBQWtCO0FBTHFLLElBQU0sMkNBQTJDO0FBTzFRLElBQU1BLFdBQVUsY0FBYyx3Q0FBZTtBQUk3QyxTQUFTLDJCQUEyQjtBQUNsQyxRQUFNLFFBQVEsQ0FBQywwQkFBMEIsd0JBQXdCO0FBQ2pFLE1BQUk7QUFDSixTQUFPO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxlQUFlLFFBQVE7QUFDckIsd0JBQWtCLFFBQVEsT0FBTyxNQUFNLE9BQU8sTUFBTSxRQUFRLFFBQVE7QUFBQSxJQUN0RTtBQUFBLElBQ0EsY0FBYztBQUNaLFlBQU0sU0FBUztBQUNmLFlBQU0sYUFBYTtBQUFBLFFBQ2pCLFFBQVEsUUFBUSxJQUFJLEdBQUcsZ0JBQWdCLGVBQWUsTUFBTTtBQUFBLE1BQzlEO0FBQ0EsVUFBSTtBQUNGLG1CQUFXLEtBQUssUUFBUUEsU0FBUSxRQUFRLGFBQWEsQ0FBQyxDQUFDO0FBQUEsTUFDekQsUUFBUTtBQUFBLE1BRVI7QUFDQSxVQUFJLFNBQVM7QUFDYixpQkFBVyxLQUFLLE9BQU87QUFDckIsbUJBQVcsT0FBTyxZQUFZO0FBQzVCLGdCQUFNLE1BQU0sUUFB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
