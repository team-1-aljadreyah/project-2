import { Suspense } from "react";
import StocktakeView from "./view";

export default function Page() {
  return (
    <Suspense>
      <StocktakeView />
    </Suspense>
  );
}

// Static export (Cloudflare Pages): this screen is built once, as "_". public/_redirects serves it for every
// /<list>/<id>/, and the screen reads the real id from the address bar (useIdParam).
export function generateStaticParams() {
  return [{ id: "_" }];
}
