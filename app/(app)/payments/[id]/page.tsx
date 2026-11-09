import { Suspense } from "react";
import PaymentView from "./view";

export default function Page() {
  return (
    <Suspense>
      <PaymentView />
    </Suspense>
  );
}
