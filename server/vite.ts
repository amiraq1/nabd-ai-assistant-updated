import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config.js";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();
const VITE_DEV_CACHE_PREFIX = ".vite-dev-cache-";
const VITE_HMR_PORT = Number.parseInt(process.env.VITE_HMR_PORT ?? "24678", 10);

export async function setupVite(server: Server, app: Express) {
  const nodeModulesDir = path.resolve(import.meta.dirname, "..", "node_modules");
  const devCacheDirName = `${VITE_DEV_CACHE_PREFIX}${Date.now()}-${process.pid}`;
  const devCacheDir = path.join(nodeModulesDir, devCacheDirName);

  // Best-effort cleanup to avoid accumulating per-run cache dirs.
  try {
    const entries = await fs.promises.readdir(nodeModulesDir, { withFileTypes: true });
    const staleDirs = entries.filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(VITE_DEV_CACHE_PREFIX),
    );
    await Promise.all(
      staleDirs.map((entry) =>
        fs.promises.rm(path.join(nodeModulesDir, entry.name), {
          recursive: true,
          force: true,
        }),
      ),
    );
  } catch {
    // Ignore cleanup errors; this cache is development-only.
  }

  const serverOptions = {
    middlewareMode: true,
    hmr: {
      port: VITE_HMR_PORT,
      clientPort: VITE_HMR_PORT,
      path: "/vite-hmr",
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    cacheDir: devCacheDir,
    optimizeDeps: {
      ...(viteConfig.optimizeDeps ?? {}),
      force: true,
    },
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      ...(viteConfig.server ?? {}),
      ...serverOptions,
    },
    appType: "custom",
  });

  // Prevent stale/corrupted browser cache for Vite dep chunks on Windows/WSL dev setups.
  app.use((req, res, next) => {
    const isViteDepRequest =
      req.path.startsWith("/@fs/") ||
      req.path.startsWith("/node_modules/.vite/");

    if (!isViteDepRequest) {
      return next();
    }

    const noStore = "no-store, no-cache, must-revalidate, proxy-revalidate";
    const originalSetHeader = res.setHeader.bind(res);

    res.setHeader = ((name: string, value: number | string | readonly string[]) => {
      if (name.toLowerCase() === "cache-control") {
        return originalSetHeader(name, noStore);
      }
      return originalSetHeader(name, value);
    }) as typeof res.setHeader;

    originalSetHeader("Cache-Control", noStore);
    originalSetHeader("Pragma", "no-cache");
    originalSetHeader("Expires", "0");
    return next();
  });

  app.use(vite.middlewares);

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
