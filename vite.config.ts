import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Build-Info zur Versionsanalyse: in CI nehmen wir GITHUB_SHA, lokal
// fragen wir git. Fallback "dev" wenn beides fehlt (Tarball ohne .git).
function readGitSha(): string {
    if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
        return 'dev';
    }
}

function readGitBranch(): string {
    if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

const GIT_SHA = readGitSha();
const GIT_BRANCH = readGitBranch();
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
    base: '/',
    define: {
        __APP_GIT_SHA__: JSON.stringify(GIT_SHA),
        __APP_GIT_BRANCH__: JSON.stringify(GIT_BRANCH),
        __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    plugins: [
        tailwindcss(),
        react(),
        // PWA: macht den Web-Client als App auf dem Startbildschirm
        // installierbar. Service Worker cached statische Assets fuer
        // Offline-Start, Manifest beschreibt Icon + Name fuer das
        // Home-Screen-Tile.
        VitePWA({
            // injectManifest: wir liefern eigenen Service-Worker (src/sw.ts).
            // Notwendig fuer den PWA share_target — dort muessen wir den POST
            // mit multipart/form-data abfangen und das File in IndexedDB legen,
            // damit die React-Seite es konsumieren kann. Mit generateSW gibt es
            // keinen Hook fuer custom fetch handler.
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'prilog Chat',
                short_name: 'prilog Chat',
                description: 'Sicherer Schulchat',
                theme_color: '#22c55e',
                background_color: '#ffffff',
                display: 'standalone',
                orientation: 'portrait',
                scope: '/',
                start_url: '/',
                lang: 'de-DE',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: 'pwa-maskable-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
                // Chat-only-Variante: kein share_target — wuerde DMS-Upload-Pfad
                // brauchen den die Chat-PWA nicht primaer abdeckt.
            },
            // injectManifest steuert nur das Precache-Manifest (was injizieren
            // wir in __WB_MANIFEST). Runtime-Caching + Routes sind komplett in
            // src/sw.ts implementiert.
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
                // 5 MB max Asset-Groesse — sonst sprengen pdf.js + tiptap das Default
                maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
            },
            devOptions: {
                enabled: false, // PWA im Dev-Mode aus, sonst nervt der SW
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // Univer's engine-render hardcodes "opentype.js/dist/opentype.module.js"
            // — opentype.js exportiert das aber als .mjs. Wir mappen auf den
            // tatsaechlich existierenden Pfad.
            'opentype.js/dist/opentype.module.js': 'opentype.js/dist/opentype.mjs',
        },
    },
});
