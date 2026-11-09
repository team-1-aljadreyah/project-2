import { Suspense } from "react";
import ItemView from "./view";

export default function Page() {
  return (
    <Suspense>
      <ItemView />
    </Suspense>
  );
}
