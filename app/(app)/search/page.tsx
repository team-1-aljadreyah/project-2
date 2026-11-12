"use client";

import { Suspense } from "react";
import { ShopSearch } from "@/components/shop/search";
import { LoadingRows } from "@/components/ui";

// «بحث» in the shop owner's app (components/shop/search.tsx). It reads what to show from the address.
export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <ShopSearch />
    </Suspense>
  );
}
