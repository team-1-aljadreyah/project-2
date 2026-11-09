import { Suspense } from "react";
import CustomerView from "./view";

export default function Page() {
  return (
    <Suspense>
      <CustomerView />
    </Suspense>
  );
}
