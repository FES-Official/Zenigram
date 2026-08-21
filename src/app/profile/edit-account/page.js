"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Camera,
  Check,
  ChevronLeft,
  Globe2,
  LoaderCircle,
  Lock,
  Save,
  ShieldAlert,
  Smartphone,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import Navbar from "../../../../components/navbar";
import { uploadMediaDirect } from "@/app/lib/directS3Upload";

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const EMPTY_FORM = {
  username: "",
  bio: "",
  website: "",
  gender: "",
  mobile: "",
  ishidden: false,
  profilePic: "",
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.message || data.error || "Something went wrong. Please try again.",
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

function validateProfile(form) {
  const errors = {};
  const username = form.username.trim().toLowerCase();
  const website = form.website.trim();
  const mobile = form.mobile.trim();

  if (!/^[a-z0-9._]{3,24}$/.test(username)) {
    errors.username =
      "Use 3–24 lowercase letters, numbers, dots, or underscores.";
  }
  if (form.bio.trim().length > 300) {
    errors.bio = "Bio must be 300 characters or fewer.";
  }
  if (mobile && !/^[0-9]{10,15}$/.test(mobile)) {
    errors.mobile = "Enter a mobile number with 10–15 digits.";
  }
  if (website) {
    try {
      const parsed = new URL(website);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      errors.website = "Enter a complete http:// or https:// URL.";
    }
  }

  return errors;
}

export default function EditAccountPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_FORM);
  const [profileImage, setProfileImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [accountDialog, setAccountDialog] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);

  const dirty = useMemo(
    () =>
      Boolean(profileImage) ||
      JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm, profileImage],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      try {
        setLoading(true);
        const data = await requestJson("/api/user/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        const nextForm = {
          ...EMPTY_FORM,
          username: data.username || "",
          bio: data.bio || "",
          website: data.website || "",
          gender: data.gender || "",
          mobile: data.mobile || "",
          ishidden: Boolean(data.ishidden),
          profilePic: data.profilePic || "",
        };
        setForm(nextForm);
        setInitialForm(nextForm);
        setPreview(nextForm.profilePic);
      } catch (loadError) {
        if (loadError.name === "AbortError") return;
        if (loadError.status === 401) {
          router.replace("/login");
          return;
        }
        setError(loadError.message || "Unable to load your profile.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, [router]);

  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const updateField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setSuccess("");
  };

  const handleImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      setError("Profile images must be 5 MB or smaller.");
      return;
    }

    setProfileImage(file);
    setPreview(URL.createObjectURL(file));
    setUploadProgress(0);
    setError("");
    setSuccess("");
  };

  const discardSelectedImage = () => {
    setProfileImage(null);
    setPreview(form.profilePic || initialForm.profilePic || "");
    setUploadProgress(0);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || !dirty) return;

    const nextErrors = validateProfile(form);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const uploaded = profileImage
        ? await uploadMediaDirect(profileImage, {
            onProgress: setUploadProgress,
          })
        : null;

      const data = await requestJson("/api/profile-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim().toLowerCase(),
          bio: form.bio.trim(),
          website: form.website.trim(),
          gender: form.gender,
          mobile: form.mobile.trim(),
          ishidden: form.ishidden,
          profilePicKey: uploaded?.key || "",
        }),
      });

      const savedForm = { ...form, ...data.user };
      setForm(savedForm);
      setInitialForm(savedForm);
      setProfileImage(null);
      setPreview(data.user?.profilePic || preview);
      setUploadProgress(0);
      setSuccess("Your profile has been updated.");
      router.refresh();
    } catch (saveError) {
      setError(saveError.message || "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const confirmAccountAction = async () => {
    if (!accountDialog || accountBusy) return;
    const permanent = accountDialog === "permanent_delete";
    if (permanent && deleteConfirmation !== "DELETE") return;

    try {
      setAccountBusy(true);
      setError("");
      await requestJson("/api/account/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: accountDialog,
          confirmation: permanent ? deleteConfirmation : "",
        }),
      });
      await signOut({ callbackUrl: "/login" });
    } catch (accountError) {
      setError(accountError.message || "Unable to update your account.");
      setAccountDialog(null);
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070405] text-white">
      <Navbar />

      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(127,29,29,0.22),transparent_36%),radial-gradient(circle_at_25%_80%,rgba(76,5,25,0.16),transparent_32%)]" />

      <main className="relative mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:ml-20 md:px-8 md:pb-12 lg:px-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
        >
          <ChevronLeft className="size-4" /> Back
        </button>

        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">
            Account settings
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Edit your profile
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Keep your public profile accurate and control who can see your
            content.
          </p>
        </header>

        {error && (
          <StatusMessage
            tone="error"
            message={error}
            onClose={() => setError("")}
          />
        )}
        {success && (
          <StatusMessage
            tone="success"
            message={success}
            onClose={() => setSuccess("")}
          />
        )}

        {loading ? (
          <EditAccountSkeleton />
        ) : (
          <form
            onSubmit={handleSubmit}
            className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]"
          >
            <aside className="h-fit rounded-3xl border border-white/8 bg-black/45 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl lg:sticky lg:top-6">
              <div className="flex flex-col items-center text-center">
                <div className="group/avatar relative">
                  <div className="rounded-full bg-linear-to-br from-red-500 via-rose-500 to-red-950 p-1 shadow-[0_12px_50px_rgba(220,38,38,0.22)]">
                    <Image
                      src={preview || "/user.svg"}
                      alt="Profile preview"
                      width={144}
                      height={144}
                      unoptimized
                      className="size-36 rounded-full bg-zinc-950 object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Choose a profile image"
                    className="absolute bottom-1 right-1 grid size-11 place-items-center rounded-full border-4 border-[#0a0607] bg-red-600 text-white shadow-lg transition hover:scale-105 hover:bg-red-500"
                  >
                    <Camera className="size-5" />
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImage}
                  className="sr-only"
                />

                <h2 className="mt-5 truncate text-xl font-bold">
                  @{form.username || "username"}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  JPG, PNG or WebP · maximum 5 MB
                </p>

                {profileImage && (
                  <button
                    type="button"
                    onClick={discardSelectedImage}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-300 hover:text-red-200"
                  >
                    <X className="size-3.5" /> Discard selected image
                  </button>
                )}

                {saving && profileImage && (
                  <div className="mt-5 w-full">
                    <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
                      <span>Uploading securely</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
                      <div
                        className="h-full rounded-full bg-red-500 transition-[width]"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-3 border-t border-white/8 pt-5 text-xs leading-5 text-zinc-500">
                <Tip
                  icon={<UserRound />}
                  text="Use a recognizable profile photo and username."
                />
                <Tip
                  icon={<Globe2 />}
                  text="A complete website URL becomes clickable on your profile."
                />
                <Tip
                  icon={<Lock />}
                  text="Hidden accounts approve supporters before sharing content."
                />
              </div>
            </aside>

            <div className="space-y-7">
              <SettingsCard
                title="Public profile"
                description="This information appears on your profile and posts."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Username"
                    error={fieldErrors.username}
                    className="sm:col-span-2"
                  >
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600">
                        @
                      </span>
                      <input
                        value={form.username}
                        onChange={(event) =>
                          updateField(
                            "username",
                            event.target.value.toLowerCase().replace(/\s/g, ""),
                          )
                        }
                        maxLength={24}
                        autoComplete="username"
                        className="input-control pl-9"
                      />
                    </div>
                  </Field>

                  <Field
                    label="Bio"
                    error={fieldErrors.bio}
                    className="sm:col-span-2"
                    hint={`${form.bio.length}/300`}
                  >
                    <textarea
                      value={form.bio}
                      onChange={(event) =>
                        updateField("bio", event.target.value)
                      }
                      maxLength={300}
                      rows={5}
                      placeholder="Tell people a little about yourself..."
                      className="input-control resize-none"
                    />
                  </Field>

                  <Field
                    label="Website"
                    error={fieldErrors.website}
                    className="sm:col-span-2"
                  >
                    <div className="relative">
                      <Globe2 className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
                      <input
                        type="url"
                        value={form.website}
                        onChange={(event) =>
                          updateField("website", event.target.value)
                        }
                        placeholder="https://example.com"
                        className="input-control pl-11"
                      />
                    </div>
                  </Field>
                </div>
              </SettingsCard>

              <SettingsCard
                title="Personal details"
                description="These details help personalize your experience."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Gender">
                    <select
                      value={form.gender}
                      onChange={(event) =>
                        updateField("gender", event.target.value)
                      }
                      className="input-control"
                    >
                      <option value="">Prefer not to say</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>

                  <Field label="Mobile number" error={fieldErrors.mobile}>
                    <div className="relative">
                      <Smartphone className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
                      <input
                        value={form.mobile}
                        onChange={(event) =>
                          updateField(
                            "mobile",
                            event.target.value.replace(/\D/g, "").slice(0, 15),
                          )
                        }
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="10–15 digits"
                        className="input-control pl-11"
                      />
                    </div>
                  </Field>
                </div>
              </SettingsCard>

              <SettingsCard
                title="Profile privacy"
                description="Choose who can view the content on your profile."
              >
                <div className="flex items-center justify-between gap-5 rounded-2xl border border-white/7 bg-white/2.5 p-4">
                  <div>
                    <p className="font-semibold text-zinc-100">
                      Hidden account
                    </p>
                    <p className="mt-1 text-sm leading-5 text-zinc-500">
                      Only approved supporters can view your posts and stories.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.ishidden}
                    onClick={() => {
                      if (form.ishidden) {
                        updateField("ishidden", false);
                      } else {
                        setPrivacyDialogOpen(true);
                      }
                    }}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
                      form.ishidden ? "bg-red-600" : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute top-1 size-6 rounded-full bg-white shadow-md transition-transform ${
                        form.ishidden ? "translate-x-0" : "-translate-x-6"
                      }`}
                    />
                  </button>
                </div>
              </SettingsCard>

              <div className="flex flex-col-reverse gap-3 rounded-3xl border border-white/8 bg-black/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-600">
                  {dirty
                    ? "You have unsaved changes."
                    : "Everything is up to date."}
                </p>
                <button
                  type="submit"
                  disabled={saving || !dirty}
                  className="inline-flex min-w-40 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {saving ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>

              <section className="rounded-3xl border border-red-500/20 bg-red-950/10 p-6">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-400">
                    <ShieldAlert className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-red-100">Danger zone</h2>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">
                      Deactivation is reversible when you sign in again.
                      Permanent deletion removes your DynamoDB data and owned S3
                      media.
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setAccountDialog("deactivate")}
                    className="rounded-xl border border-amber-500/30 px-4 py-2.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/10"
                  >
                    Deactivate account
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteConfirmation("");
                      setAccountDialog("permanent_delete");
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/35 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10"
                  >
                    <Trash2 className="size-4" /> Delete permanently
                  </button>
                </div>
              </section>
            </div>
          </form>
        )}
      </main>

      {privacyDialogOpen && (
        <ConfirmDialog
          title="Make your account hidden?"
          description="People will need your approval before they can view your posts and stories. Existing approved supporters keep access."
          confirmLabel="Enable hidden account"
          onCancel={() => setPrivacyDialogOpen(false)}
          onConfirm={() => {
            updateField("ishidden", true);
            setPrivacyDialogOpen(false);
          }}
        />
      )}

      {accountDialog && (
        <ConfirmDialog
          danger
          busy={accountBusy}
          title={
            accountDialog === "deactivate"
              ? "Deactivate your account?"
              : "Permanently delete your account?"
          }
          description={
            accountDialog === "deactivate"
              ? "Your profile and content will be hidden until you sign in again."
              : "This cannot be undone. Your posts, messages, profile data, and owned media will be removed."
          }
          confirmLabel={
            accountDialog === "deactivate"
              ? "Deactivate account"
              : "Delete permanently"
          }
          confirmDisabled={
            accountDialog === "permanent_delete" &&
            deleteConfirmation !== "DELETE"
          }
          onCancel={() => {
            if (!accountBusy) setAccountDialog(null);
          }}
          onConfirm={() => void confirmAccountAction()}
        >
          {accountDialog === "permanent_delete" && (
            <div className="mt-4 text-left">
              <label
                htmlFor="delete-confirmation"
                className="mb-2 block text-xs font-semibold text-zinc-400"
              >
                Type DELETE to confirm
              </label>
              <input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                className="input-control"
                placeholder="DELETE"
              />
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

function SettingsCard({ title, description, children }) {
  return (
    <section className="rounded-3xl border border-white/8 bg-black/45 p-5 shadow-xl shadow-black/10 backdrop-blur-xl sm:p-7">
      <div className="mb-6 border-b border-white/7 pb-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, error, hint, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-zinc-300">
        {label}
        {hint && (
          <span className="text-xs font-normal text-zinc-600">{hint}</span>
        )}
      </span>
      {children}
      {error && (
        <span className="mt-1.5 block text-xs text-red-300">{error}</span>
      )}
    </label>
  );
}

function Tip({ icon, text }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-red-400 [&>svg]:size-3.5">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function StatusMessage({ tone, message, onClose }) {
  const success = tone === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      className={`mb-6 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${success ? "border-emerald-500/25 bg-emerald-950/30 text-emerald-100" : "border-red-500/25 bg-red-950/35 text-red-100"}`}
    >
      {success ? (
        <Check className="size-4 shrink-0" />
      ) : (
        <ShieldAlert className="size-4 shrink-0" />
      )}
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss message"
        className="rounded-full p-1 opacity-60 hover:bg-white/10 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmDisabled = false,
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
  children,
}) {
  return (
    <div
      className="fixed inset-0 z-80 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-red-950/70 bg-[#110809] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.75)]"
      >
        <div
          className={`mb-4 grid size-11 place-items-center rounded-2xl ${danger ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-300"}`}
        >
          {danger ? (
            <ShieldAlert className="size-5" />
          ) : (
            <Lock className="size-5" />
          )}
        </div>
        <h2 id="confirm-title" className="text-xl font-bold">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
        {children}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 ${danger ? "bg-red-600 hover:bg-red-500" : "bg-amber-600 hover:bg-amber-500"}`}
          >
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditAccountSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="h-96 rounded-3xl bg-white/5" />
      <div className="space-y-6">
        <div className="h-96 rounded-3xl bg-white/5" />
        <div className="h-64 rounded-3xl bg-white/5" />
      </div>
    </div>
  );
}
