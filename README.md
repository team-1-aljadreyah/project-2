This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Cloudflare Pages

The site has no server code (every page runs in the browser), so Cloudflare Pages serves it as plain files.

**Build settings** (Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git):

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build:pages` |
| Build output directory | `out` |
| Root directory | `project-2` if the repository holds more than this app, otherwise empty |

**Environment variables** (Settings → Environment variables, for Production and Preview):

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NEXT_PUBLIC_USE_MOCK` | leave it empty or `true` for the demo (each visitor's browser keeps its own demo data); `false` with the real backend |
| `NEXT_PUBLIC_API_URL` | the backend address, e.g. `https://api.example.com` (only when `NEXT_PUBLIC_USE_MOCK=false`) |

`NEXT_PUBLIC_*` values are put into the files at build time: after changing one, run a new deployment.
With the real backend, it must allow the Pages address in its CORS settings.

**From your computer instead of Git:**

```bash
npm run build:pages
npx wrangler pages deploy out
```

**Try the Cloudflare build locally:** `npm run build:pages`, then `npx wrangler pages dev out` → http://localhost:8788

**How it works**
- `npm run build:pages` (or Cloudflare, which sets `CF_PAGES=1`) builds a static export into `out/`.
  `npm run dev` stays a normal Next.js server.
- The detail pages (`/orders/123/`, `/invoices/45/`…) are built once as `_`. `public/_redirects` serves that page
  for every id, and the page reads the real id from the address bar (`useIdParam` in `lib/utils.ts`).
- Cache Components (partial pre-rendering) needs a Next.js server, so it is on in development and off in this build.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
