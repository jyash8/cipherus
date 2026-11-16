import { APP_NAME } from "@/config/constants";
import PasswordGeneratorCard from "@/components/PasswordGeneratorCard";
import SecurityAuditCard from "@/components/SecurityAuditCard";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="border-b border-slate-800 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
            <p className="text-sm text-slate-400">
              Zero-Knowledge Local Password Manager (Next.js + Drizzle + SQLite)
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Member 2 Mounting Slot: Password Generator & Security Audit */}
          <section
            aria-labelledby="generator-audit-heading"
            className="md:col-span-1 min-w-0 space-y-4"
          >
            <h2
              id="generator-audit-heading"
              className="font-semibold text-slate-200"
            >
              Generator &amp; Audit
            </h2>
            <div className="space-y-6">
              <PasswordGeneratorCard />
              <SecurityAuditCard />
            </div>
          </section>

          {/* Member 1 Mounting Slot: Encrypted Credential Form & Vault Table */}
          <section className="md:col-span-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="font-semibold text-slate-200">Encrypted Vault</h2>
            <p className="text-xs text-slate-500 mt-1">
              Reserved for feature-member1 components
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
