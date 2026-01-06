import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    // Main entry point
    index: 'src/index.ts',

    // Subpath exports
    'client/index': 'src/client/index.ts',
    'server/index': 'src/server/index.ts',
    'rpc/index': 'src/rpc/index.ts',
    'types/index': 'src/types/index.ts',
    'runtimes/index': 'src/runtimes/index.ts',

    // Runtime-specific entry points
    'runtimes/bun': 'src/runtimes/bun.ts',
    'runtimes/cloudflare': 'src/runtimes/cloudflare.ts',
    'runtimes/node': 'src/runtimes/node.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['@cloudflare/sandbox', 'capnweb'],
})
