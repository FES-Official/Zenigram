"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

const initialForm = {
  fullname: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const router = useRouter();
  const { status } = useSession();
  const [formData, setFormData] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [router, status]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setMessage("");
  };

  const validate = () => {
    const nextErrors = {};
    const username = formData.username.trim().toLowerCase();
    const email = formData.email.trim();

    if (!formData.fullname.trim()) {
      nextErrors.fullname = "Enter your full name.";
    }

    if (!/^[a-z0-9._]{3,24}$/.test(username)) {
      nextErrors.username =
        "Use 3-24 letters, numbers, dots, or underscores.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (formData.password.length < 6) {
      nextErrors.password = "Use at least 6 characters.";
    }

    if (formData.password !== formData.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullname: formData.fullname,
          username: formData.username,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not create your account.");
        return;
      }

      const loginResult = await signIn("credentials", {
        username: formData.email,
        password: formData.password,
        redirect: false,
        callbackUrl: "/",
      });

      if (!loginResult?.ok) {
        router.replace("/login");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Registration error:", error);
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignup() {
    setGoogleLoading(true);
    setMessage("");
    await signIn("google", { callbackUrl: "/" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-red-950 to-black px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-black/85 p-6 shadow-2xl sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-white">Create your account</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign up with email and password, or use Google.
          </p>
        </div>

        {message && (
          <div className="mb-4 rounded-md border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm text-red-100">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthInput
            label="Full name"
            name="fullname"
            value={formData.fullname}
            onChange={handleChange}
            error={errors.fullname}
            autoComplete="name"
          />
          <AuthInput
            label="Username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            error={errors.username}
            autoComplete="username"
            help="Lowercase letters, numbers, dots, and underscores."
          />
          <AuthInput
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
            autoComplete="email"
          />
          <AuthInput
            label="Password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            autoComplete="new-password"
          />
          <AuthInput
            label="Confirm password"
            name="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full rounded-md bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs uppercase text-zinc-500">
          <div className="h-px flex-1 bg-zinc-800" />
          or
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignup}
          disabled={loading || googleLoading}
          className="w-full rounded-md border border-zinc-700 px-4 py-3 font-semibold text-zinc-100 transition hover:border-red-500 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {googleLoading ? "Opening Google..." : "Continue with Google"}
        </button>

        <p className="mt-6 text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-red-300 hover:underline">
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}

function AuthInput({
  label,
  name,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  help,
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm text-zinc-300">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required
        className={`w-full rounded-md border bg-zinc-950 px-4 py-3 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/30 ${
          error ? "border-red-500" : "border-zinc-700"
        }`}
      />
      {error ? (
        <p className="mt-1 text-sm text-red-300">{error}</p>
      ) : help ? (
        <p className="mt-1 text-xs text-zinc-500">{help}</p>
      ) : null}
    </div>
  );
}
