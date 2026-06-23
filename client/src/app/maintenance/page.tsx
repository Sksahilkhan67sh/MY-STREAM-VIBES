// client/src/app/maintenance/page.tsx
//
// Standalone maintenance page. Not wired into routing/middleware — this is
// intentional, since redirecting all traffic here is an infra decision, not
// a branding one. To use it during planned downtime, point your own
// maintenance-mode redirect (e.g. an edge rule or middleware check behind
// an env var) at this route.

export default function MaintenancePage() {
  return (
    <div
      className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center px-4 text-center"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
    >
      <img src="/logo.png" alt="Stream Vault" className="w-10 h-10 object-contain mb-5" />
      <h1 className="text-xl font-bold mb-2">We'll be right back</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-10 leading-relaxed">
        Stream Vault is undergoing scheduled maintenance. We're working to get
        everything back up as quickly as possible.
      </p>
      <div className="text-xs text-gray-400 dark:text-gray-600">
        <span className="font-semibold text-gray-500 dark:text-gray-500">Stream Vault</span>
        <span className="mx-1.5">·</span>
        <span>by Aligncraft</span>
      </div>
    </div>
  );
}
