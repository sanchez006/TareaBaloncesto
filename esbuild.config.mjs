import { build } from "esbuild";

await build({
  entryPoints: {
    public: "src/client/public.ts",
    admin: "src/client/admin.ts",
  },
  bundle: true,
  outdir: "public/js",
  target: "es2022",
  format: "esm",
  sourcemap: true,
});
