import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'APXM',
    description: 'A mobile browser extension for Prosperous Universe',
    permissions: ['storage'],
    host_permissions: [
      'https://apex.prosperousuniverse.com/*',
      'https://rest.fnar.net/*',
    ],
    web_accessible_resources: [
      {
        resources: ['ws-interceptor.js', 'icon-48.png'],
        matches: ['https://apex.prosperousuniverse.com/*'],
      },
    ],
    browser_specific_settings: {
      // `data_collection_permissions` is a newer Firefox manifest key (AMO
      // data-collection consent) not yet in WXT's bundled gecko type; cast
      // to the known-keys shape so the extra field still ships.
      gecko: {
        id: 'apxm@27bit.dev',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
          optional: [],
        },
      } as { id: string; strict_min_version: string },
      gecko_android: {
        strict_min_version: '120.0',
      },
    },
  },
  vite: () => ({
    define: {
      __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    },
    build: {
      // Ensure compatibility with Firefox ESR
      target: 'es2020',
    },
  }),
});
