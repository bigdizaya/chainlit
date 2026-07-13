import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

const bayyanAssetVersion =
  process.env.BAYYAN_ASSET_VERSION || '20260713-remove-generic-starters-1';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true
  },
  plugins: [
    react(),
    tsconfigPaths(),
    svgr(),
    {
      name: 'bayyan-versioned-html-assets',
      transformIndexHtml(html) {
        return html.replace(
          /(src|href)="(\/assets\/[^"]+\.(?:js|css))"/g,
          `$1="$2?v=${bayyanAssetVersion}"`
        );
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // To prevent conflicts with packages in @chainlit/react-client, we need to specify the resolution paths for these dependencies.
      react: path.resolve(__dirname, './node_modules/react'),
      'usehooks-ts': path.resolve(__dirname, './node_modules/usehooks-ts'),
      sonner: path.resolve(__dirname, './node_modules/sonner'),
      lodash: path.resolve(__dirname, './node_modules/lodash'),
      recoil: path.resolve(__dirname, './node_modules/recoil')
    }
  }
});
