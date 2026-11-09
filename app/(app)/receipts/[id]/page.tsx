import { Suspense } from "react";
import ReceiptView from "./view";

export default function Page() {
  return (
    <Suspense>
      <ReceiptView />
    </Suspense>
  );
}
