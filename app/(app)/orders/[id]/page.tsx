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
