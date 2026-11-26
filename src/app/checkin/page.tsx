import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckinForm } from "./CheckinForm";

export const metadata: Metadata = {
  title: "Parking check-in · Howard Johnson",
  description: "Register your car for parking",
  robots: { index: false, follow: false },
};

export default function CheckinPage() {
  return (
    <Suspense fallback={null}>
      <CheckinForm />
    </Suspense>
  );
}
