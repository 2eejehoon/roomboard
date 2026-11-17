import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// 002 research R4·R5: /manifest.json {version, chunks} tells the Worker the deployed version and which file names are ours.
// The version is VITE_APP_VERSION (deploy.yml: YYYYMMDDHHmm-<sha>), 'dev' when unset; the client reads the same variable.
const buildManifest = (version: string): Plugin => ({
  name: 'roomboard-manifest',
  applyToEnvironment: (env) => env.name === 'client',
  generateBundle(_, bundle) {
    const chunks = Object.values(bundle).flatMap((f) => (f.type === 'chunk' ? [f.fileName.split('/').pop()!] : []));
    this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify({ version, chunks }) });
  },
});
// Each library in its own vendor-<package> chunk: fingerprint() skips vendor frames, and 3D libraries stay out of the first load.
const vendorChunk = (id: string) => {
  const pkg = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id)?.[1];
  return pkg ? `vendor-${pkg.replace(/[@/]/g, '')}` : null;
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), cloudflare(), buildManifest(loadEnv(mode, process.cwd(), 'VITE_').VITE_APP_VERSION || 'dev')],
  environments: {
    client: {
      build: {
        rolldownOptions: {
          // keepNames: stack frames keep function names, so a fingerprint survives a rebuild (research R4).
          output: { minify: { mangle: { keepNames: true } }, codeSplitting: { groups: [{ name: vendorChunk }] } },
        },
      },
    },
  },
}));
