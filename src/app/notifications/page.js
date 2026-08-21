"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

export default function NotificationsPage() {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const res = await fetch("/api/notifications");
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message || "Failed to fetch notifications");
        }
        setData(Array.isArray(json) ? json : json.notifications || []);
        fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
      } catch (err) {
        console.error("Failed to fetch notifications:", err);
        setError(err.message || "Failed to fetch notifications");
      }
    };

    loadNotifications();
  }, []);

  const respond = async (id, action) => {
    try {
      setError("");

      const res = await fetch("/api/support/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id, action }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to respond to request");
      }

      setData((prev) => prev.filter((n) => n._id !== id));
    } catch (err) {
      console.error("Error responding:", err);
      setError(err.message || "Failed to respond to request");
    }
  };

  const respondToUnblockRequest = async (notification, action) => {
    try {
      setError("");
      const res = await fetch("/api/users/unblock-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId: notification.event?.requesterId,
          conversationId: notification.event?.conversationId,
          action,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || `Failed to ${action} unblock request`);
      }
      setData((current) =>
        current.map((item) =>
          item._id === notification._id
            ? {
                ...item,
                status: action === "accept" ? "approved" : "rejected",
                read: true,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err.message || `Failed to ${action} unblock request`);
    }
  };

  return (
    <div className="p-6 bg-black text-white min-h-screen">
      {/* Back Button */}
      <Link href="/" className="text-red-500 hover:text-red-300">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="24px"
          viewBox="0 -960 960 960"
          width="24px"
          fill="#FFFFFF"
        >
          <path d="M400-80 0-480l400-400 71 71-329 329 329 329-71 71Z" />
        </svg>
      </Link>

      <h1 className="text-2xl font-bold mb-4">Notifications</h1>

      {error && (
        <p className="mb-4 rounded bg-red-950 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {data.map((n) => (
          <motion.div
            key={n._id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-3 rounded-lg flex gap-3 items-start bg-neutral-900"
          >
            {/* Profile Image */}
            <Link href={`/profile/${n.username}`}>
              <Image
                src={
                  n.profilePic ||
                  "/black-person-profile-icon-round-3d-ui-button-vector-illustration_541075-900.avif"
                }
                onError={(e) =>
                  (e.currentTarget.src =
                    "/black-person-profile-icon-round-3d-ui-button-vector-illustration_541075-900.avif")
                }
                width={40}
                height={40}
                alt={n.username}
                className="w-9 h-9 rounded-full object-cover"
              />
            </Link>

            {/* Content */}
            <div className="flex-1">
              {["user_blocked", "unblock_request"].includes(n.type) ? (
                <span className="font-semibold">{n.username}</span>
              ) : (
                <Link
                  href={`/profile/${n.username}`}
                  className="font-semibold hover:underline"
                >
                  {n.username}
                </Link>
              )}{" "}
              {n.type === "like" && "liked your post ❤️"}
              {n.type === "comment" && "commented on your post 💬"}
              {n.type === "story_comment" && <p>commented on your story</p>}
              {n.type === "story_mention" && <p>mentioned you in a story</p>}
              {n.type === "event_invitation" && (
                <p>
                  invited you to{" "}
                  <Link href="/messages" className="text-cyan-300 underline">
                    {n.event?.title || "a live event"}
                  </Link>
                </p>
              )}
              {n.type === "support_request" && n.status === "pending" && (
                <>
                  <p>sent you a support request 🔒</p>

                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => respond(n._id, "accept")}
                      className="bg-sky-600 px-3 py-1 rounded"
                    >
                      Accept
                    </button>

                    <button
                      onClick={() => respond(n._id, "reject")}
                      className="bg-red-600 px-3 py-1 rounded"
                    >
                      Decline
                    </button>
                  </div>
                </>
              )}
              {n.type === "support" && <p>supported you 🤝</p>}
              {n.type === "support_approved" && <p>approved your request ✅</p>}
              {n.type === "support_rejected" && <p>declined your request ❌</p>}
              {n.type === "user_blocked" && (
                <p className="font-medium text-red-400">
                  blocked you. Messaging, media sharing, and profile access are
                  disabled.
                </p>
              )}
              {n.type === "user_unblocked" && (
                <p className="font-medium text-emerald-400">
                  unblocked you. You can message and view each other again.
                </p>
              )}
              {n.type === "unblock_request" && (
                <div>
                  <p className="text-amber-300">requested to be unblocked.</p>
                  {n.status === "pending" &&
                  new Date(n.event?.expiresAt).getTime() > Date.now() ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void respondToUnblockRequest(n, "accept")}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
                      >
                        Accept unblock request
                      </button>
                      <button
                        type="button"
                        onClick={() => void respondToUnblockRequest(n, "decline")}
                        className="rounded-lg bg-red-950 px-3 py-1.5 text-sm font-semibold text-red-200 hover:bg-red-900"
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-white/40">
                      {n.status === "approved"
                        ? "Accepted"
                        : n.status === "rejected"
                          ? "Declined"
                          : "Expired"}
                    </p>
                  )}
                </div>
              )}
              {n.type === "unblock_request_declined" && (
                <p className="font-medium text-red-400">
                  declined your unblock request. The block remains active.
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
