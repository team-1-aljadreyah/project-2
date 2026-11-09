import { Suspense } from "react";
import InvoiceView from "./view";

export default function Page() {
  return (
    <Suspense>
      <InvoiceView />
    </Suspense>
  );
}
