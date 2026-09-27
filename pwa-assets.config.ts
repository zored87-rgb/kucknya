import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Иконки для iPhone и манифеста генерируются из public/icon.svg: npm run icons
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#c2410c' } },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#c2410c' } },
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
  },
  images: ['public/icon.svg'],
});
