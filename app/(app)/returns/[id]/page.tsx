import { Suspense } from "react";
import ReturnView from "./view";

export default function Page() {
  return (
    <Suspense>
      <ReturnView />
    </Suspense>
  );
}
