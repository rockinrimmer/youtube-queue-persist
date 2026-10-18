import { defineConfig } from 'wxt';

const icons = {
  16: 'icons/queue-red.svg',
  32: 'icons/queue-red.svg',
  48: 'icons/queue-red.svg',
  96: 'icons/queue-red.svg',
};

export default defineConfig({
  manifestVersion: 3,
  zip: {
    includeSources: ['entrypoints/**', 'lib/**', 'public/**', '*.ts', '*.json', '*.md', 'pnpm-*.yaml'],
    excludeSources: ['work/**', 'output/**'],
  },
  manifest: {
    name: 'YouTube Queue Persist',
    description: 'Keep your native YouTube queue after closing a tab or Firefox.',
    permissions: ['storage'],
    host_permissions: ['https://www.youtube.com/*'],
    icons,
    action: { default_icon: icons },
    browser_specific_settings: {
      gecko: {
        id: 'youtube-queue-persist@rockinrimmer',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
    web_accessible_resources: [{
      resources: ['youtube-main.js'],
      matches: ['https://www.youtube.com/*'],
    }],
  },
});
