import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { StaffGate } from "@/components/StaffGate";
import { PinProvider } from "@/components/ui/Pin";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
      <PinProvider>
        <Header />
        <StaffGate>
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </StaffGate>
      </PinProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
