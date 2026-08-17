import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Keep the production build warning-free while preserving real code splitting.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            // Keep the application's large feature views out of the main entry chunk.
            if (id.includes('/src/components/')) {
              const match = id.match(/\/src\/components\/([^/]+)\.tsx?$/);
              if (match) return `view-${match[1].replace(/View$/, '').toLowerCase()}`;
            }
            return undefined;
          }

          if (id.includes('/jspdf/') || id.includes('/jspdf-autotable/')) return 'pdf-core';
          if (id.includes('/html2canvas/')) return 'html2canvas';
          if (id.includes('/firebase/')) return 'firebase';
          if (id.includes('/recharts/') || id.includes('/d3/')) return 'charts';
          if (id.includes('/motion/')) return 'motion';
          if (id.includes('/lucide-react/')) return 'icons';
          if (id.includes('/dompurify/')) return 'sanitization';
          if (id.includes('/@supabase/')) return 'supabase';
          if (id.includes('/zod/')) return 'validation';

          return 'vendor';
        },
      },
    },
  },
});
