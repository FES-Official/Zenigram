"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, getSession } from "next-auth/react";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell>Loading...</AuthShell>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = getSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const requestedCallbackUrl = searchParams.get("callbackUrl") || "/";
  const callbackUrl =
    requestedCallbackUrl.startsWith("/") &&
    !requestedCallbackUrl.startsWith("//")
      ? requestedCallbackUrl
      : "/";

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, router, status]);

  async function handleCredentialsLogin(event) {
    event.preventDefault();
    setError("");

    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier || !password) {
      setError("Enter your username or email and password.");
      return;
    }

    setLoading(true);
    try {
      const result = await signIn("credentials", {
        username: normalizedIdentifier,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result?.ok) {
        setError(
          result?.status === 401 || result?.error === "CredentialsSignin"
            ? "Username, email, or password is incorrect."
            : "Login is temporarily unavailable. Please try again.",
        );
        return;
      }

      router.replace(result.url || callbackUrl);
      router.refresh();
    } catch {
      setError("Login is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError("");
    await signIn("google", { callbackUrl });
  }

  return (
    <AuthShell>
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-black/85 p-6 shadow-2xl sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-white">
            Log in to <span className="text-red-500 text-3xl">Zenigram</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Use your username, email, or Google account.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleCredentialsLogin} className="space-y-4">
          <div>
            <label
              htmlFor="identifier"
              className="mb-1 block text-sm text-zinc-300"
            >
              Username or email
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Username or email"
              autoComplete="username"
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm text-zinc-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Password"
              required
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
            />
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full rounded-md bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs uppercase text-zinc-500">
          <div className="h-px flex-1 bg-zinc-800" />
          or
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading || googleLoading}
          className="w-full rounded-md border border-zinc-700 px-4 py-3 font-semibold text-zinc-100 transition hover:border-red-500 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {googleLoading ? "Opening Google..." : "Continue with Google"}
        </button>

        <p className="mt-6 text-center text-sm text-zinc-400">
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold text-red-300 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </section>
    </AuthShell>
  );
}

function AuthShell({ children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-black via-red-950 to-black px-4 py-10 text-white">
      {children}
    </main>
  );
}
