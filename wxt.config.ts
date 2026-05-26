import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OOG Mobile Fork',
    description: "OOG fork of Zillatron's APXM mobile skin for Prosperous Universe",
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
      gecko: {
        id: '{35dd3136-cfd9-430f-81f3-14dfea993579}',
        strict_min_version: '142.0',
      },
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
