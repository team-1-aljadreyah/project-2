import { Suspense } from "react";
import StocktakeView from "./view";

export default function Page() {
  return (
    <Suspense>
      <StocktakeView />
    </Suspense>
  );
}
