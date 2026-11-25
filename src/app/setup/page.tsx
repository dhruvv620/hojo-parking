export default function SetupPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="card p-6">
        <h1 className="text-xl font-bold">Almost there</h1>
        <p className="mt-2 text-slate-600">
          The app is not connected to Supabase yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel (Project &gt; Settings &gt; Environment Variables),
          then redeploy. See the README for the full steps.
        </p>
      </div>
    </main>
  );
}
