"use client";

import { SessionProvider } from "next-auth/react";
import { ClipUploadProvider } from "@/app/lib/ClipUploadContext";

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <ClipUploadProvider>{children}</ClipUploadProvider>
    </SessionProvider>
  );
}
