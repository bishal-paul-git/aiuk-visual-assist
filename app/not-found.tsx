import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 text-center">
      <LogoMark className="size-10" />
      <h1 className="mt-5 text-xl font-semibold text-ink">This link isn&apos;t valid</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-2">It may have expired or already been used. Please contact the team that sent it for a new link.</p>
      <Link href="/" className="mt-6 text-sm font-medium text-brand hover:underline">
        Go to Visual Assist
      </Link>
    </main>
  );
}
