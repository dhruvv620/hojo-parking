import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/Toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </ToastProvider>
  );
}
