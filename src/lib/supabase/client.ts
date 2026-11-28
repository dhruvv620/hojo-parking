import { createBrowserClient } from "@supabase/ssr";
import { getDeviceKey } from "../device";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function supabaseBrowser() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // every request says which device it comes from (device log / Remove device)
      { global: { headers: { "x-device-id": getDeviceKey() } } },
    );
  }
  return client;
}
