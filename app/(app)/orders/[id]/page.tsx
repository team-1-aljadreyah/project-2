import { Suspense } from "react";
import OrderView from "./view";

// The page itself is tiny: the screen (view.tsx) reads the id from the address, inside Suspense.
export default function Page() {
  return (
    <Suspense>
      <OrderView />
    </Suspense>
  );
}

// Static export (Cloudflare Pages): this screen is built once, as "_". public/_redirects serves it for every
// /<list>/<id>/, and the screen reads the real id from the address bar (useIdParam).
export function generateStaticParams() {
  return [{ id: "_" }];
}
