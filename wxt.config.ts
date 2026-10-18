import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  zip: {
    includeSources: ['entrypoints/**', 'lib/**', 'public/**', '*.ts', '*.json', '*.md'],
    excludeSources: ['work/**', 'output/**'],
  },
  manifest: {
    name: 'YouTube Queue Persist',
    description: 'Keep your native YouTube queue after closing a tab or Firefox.',
    permissions: ['storage'],
    host_permissions: ['https://www.youtube.com/*'],
    icons: { 48: '/icon.svg', 96: '/icon.svg' },
    browser_specific_settings: {
      gecko: {
        id: 'youtube-queue-persist@local.prototype',
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
