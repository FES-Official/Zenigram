"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { getRealtimeSocket } from "@/app/lib/realtimeClient";

/* -------------------------------------------------------------------------- */
/*                                   NAVBAR                                   */
/* -------------------------------------------------------------------------- */

export default function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const createMenuRef = useRef(null);

  const [user, setUser] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [notifications, setNotifications] = useState([]);

  const [badges, setBadges] = useState({
    messagesCount: 0,
    notificationsCount: 0,
  });

  const [processingNotificationId, setProcessingNotificationId] =
    useState(null);

  const sessionUserId = session?.user?.id;

  /* ------------------------------------------------------------------------ */
  /*                               PROFILE URL                                */
  /* ------------------------------------------------------------------------ */

  const profileHref = useMemo(() => {
    if (status !== "authenticated") {
      return "/login";
    }

    const profileSlug =
      user?.username || session?.user?.username || session?.user?.name;

    if (!profileSlug) {
      return "/profile";
    }

    return `/profile/${encodeURIComponent(profileSlug)}`;
  }, [session, status, user]);

  /* ------------------------------------------------------------------------ */
  /*                                API CALLS                                 */
  /* ------------------------------------------------------------------------ */

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Failed to fetch notifications");
      }

      setNotifications(Array.isArray(data) ? data : data?.notifications || []);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  }, []);

  const fetchBadges = useCallback(async () => {
    try {
      const response = await fetch("/api/badges", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Failed to fetch badges");
      }

      setBadges({
        messagesCount: Number(data?.messagesCount || 0),
        notificationsCount: Number(data?.notificationsCount || 0),
      });
    } catch (error) {
      console.error("Failed to fetch badges:", error);
    }
  }, []);

  const refreshNavigationData = useCallback(async () => {
    await Promise.all([fetchBadges(), fetchNotifications()]);
  }, [fetchBadges, fetchNotifications]);

  /* ------------------------------------------------------------------------ */
  /*                           MARK NOTIFICATIONS READ                        */
  /* ------------------------------------------------------------------------ */

  const markNotificationsRead = useCallback(async () => {
    setBadges((current) => ({
      ...current,
      notificationsCount: 0,
    }));

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        read: true,
      })),
    );

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Failed to mark notifications as read");
      }
    } catch (error) {
      console.error("Failed to mark notifications read:", error);

      void refreshNavigationData();
    }
  }, [refreshNavigationData]);

  /* ------------------------------------------------------------------------ */
  /*                          SUPPORT REQUEST RESPONSE                        */
  /* ------------------------------------------------------------------------ */

  const respondToSupportRequest = useCallback(
    async (id, action) => {
      if (processingNotificationId !== null) {
        return;
      }

      setProcessingNotificationId(id);

      try {
        const response = await fetch("/api/support/respond", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notificationId: id,
            action,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to respond to support request");
        }

        setNotifications((current) =>
          current.filter((notification) => notification._id !== id),
        );

        void fetchBadges();
      } catch (error) {
        console.error("Support request error:", error);
      } finally {
        setProcessingNotificationId(null);
      }
    },
    [fetchBadges, processingNotificationId],
  );

  /* ------------------------------------------------------------------------ */
  /*                          ACCEPT UNBLOCK REQUEST                          */
  /* ------------------------------------------------------------------------ */

  const respondToUnblockRequest = useCallback(
    async (notification, action = "accept") => {
      if (processingNotificationId !== null) {
        return;
      }

      const notificationId = notification?._id;

      if (!notificationId) {
        return;
      }

      setProcessingNotificationId(notificationId);

      try {
        const response = await fetch("/api/users/unblock-request", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requesterId: notification.event?.requesterId,
            conversationId: notification.event?.conversationId,
            action,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to ${action} unblock request`);
        }

        setNotifications((current) =>
          current.map((item) =>
            item._id === notificationId
              ? {
                  ...item,
                  status: action === "accept" ? "approved" : "rejected",
                  read: true,
                }
              : item,
          ),
        );

        void fetchBadges();
      } catch (error) {
        console.error(`Failed to ${action} unblock request:`, error);
      } finally {
        setProcessingNotificationId(null);
      }
    },
    [fetchBadges, processingNotificationId],
  );

  /* ------------------------------------------------------------------------ */
  /*                              FETCH USER                                  */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!sessionUserId) {
      setUser(null);
      return undefined;
    }

    let cancelled = false;

    const fetchUser = async () => {
      try {
        const response = await fetch("/api/user/me", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch user");
        }

        const data = await response.json();

        if (!cancelled) {
          setUser(data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch user:", error);
        }
      }
    };

    void fetchUser();

    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  /* ------------------------------------------------------------------------ */
  /*                                  POLLING                                 */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (status !== "authenticated" || !sessionUserId) {
      setNotifications([]);

      setBadges({
        messagesCount: 0,
        notificationsCount: 0,
      });

      setShowNotifications(false);
      setProcessingNotificationId(null);

      return undefined;
    }

    void refreshNavigationData();

    const interval = window.setInterval(() => {
      void refreshNavigationData();
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshNavigationData, sessionUserId, status]);

  /* ------------------------------------------------------------------------ */
  /*                               REALTIME                                   */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (status !== "authenticated" || !sessionUserId) {
      return undefined;
    }

    const socket = getRealtimeSocket();

    if (!socket) {
      return undefined;
    }

    const registerUser = () => {
      socket.emit("register:user", sessionUserId);
    };

    const refreshBadges = () => {
      void fetchBadges();
    };

    const refreshEverything = () => {
      void refreshNavigationData();
    };

    registerUser();

    socket.on("connect", registerUser);

    socket.on("badge:update", refreshBadges);
    socket.on("message:new", refreshBadges);
    socket.on("message:read", refreshBadges);

    socket.on("notification:new", refreshEverything);

    return () => {
      socket.off("connect", registerUser);

      socket.off("badge:update", refreshBadges);
      socket.off("message:new", refreshBadges);
      socket.off("message:read", refreshBadges);

      socket.off("notification:new", refreshEverything);
    };
  }, [fetchBadges, refreshNavigationData, sessionUserId, status]);

  /* ------------------------------------------------------------------------ */
  /*                         CLOSE CREATE MENU OUTSIDE                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        createMenuRef.current &&
        !createMenuRef.current.contains(event.target)
      ) {
        setCreateOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /*                              ESCAPE KEY                                  */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      setCreateOpen(false);
      setShowNotifications(false);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /*                         CLOSE ON ROUTE CHANGE                            */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    setCreateOpen(false);
    setShowNotifications(false);
  }, [pathname]);

  /* ------------------------------------------------------------------------ */
  /*                       LOCK BODY WHEN DRAWER OPENS                        */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!showNotifications) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showNotifications]);

  /* ------------------------------------------------------------------------ */
  /*                      NOTIFICATION NAV CLICK                             */
  /* ------------------------------------------------------------------------ */

  const handleNotificationsClick = (event) => {
    if (status === "authenticated") {
      void markNotificationsRead();
    }

    const desktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;

    if (!desktop) {
      return;
    }

    event.preventDefault();

    setShowNotifications((current) => !current);

    setCreateOpen(false);
  };

  /* ------------------------------------------------------------------------ */
  /*                                RENDER                                    */
  /* ------------------------------------------------------------------------ */

  return (
    <>
      <aside
        className="
          group/nav
          fixed inset-x-0 bottom-0
          z-40
          h-16
          border-t border-red-950/70
          bg-[#080203]/95
          px-2 py-2
          shadow-[0_-14px_45px_rgba(69,10,10,0.16)]
          backdrop-blur-2xl

          md:inset-y-0
          md:left-0
          md:right-auto
          md:h-screen
          md:w-20
          md:border-r
          md:border-t-0
          md:px-3
          md:py-6
          md:shadow-[14px_0_45px_rgba(69,10,10,0.12)]
          md:transition-[width,padding]
          md:duration-300
          md:ease-out
          md:hover:w-72
          md:hover:px-5
        "
      >
        {/* subtle red ambient glow */}
        <div
          aria-hidden="true"
          className="
            pointer-events-none
            absolute inset-0
            overflow-hidden
          "
        >
          <div
            className="
              absolute
              -left-20 top-16
              size-56
              rounded-full
              bg-red-950/20
              blur-3xl

              md:-left-32
              md:top-24
              md:size-72
            "
          />

          <div
            className="
              absolute
              bottom-0 right-0
              size-40
              rounded-full
              bg-rose-950/10
              blur-3xl
            "
          />
        </div>

        <div className="relative flex h-full flex-col">
          {/* Desktop logo */}
          <Link
            href="/"
            className="
              mb-10
              hidden
              items-center
              gap-3
              rounded-2xl
              px-3 py-2
              transition
              md:flex
            "
          >
            <div className="shrink-0">
              <Image
                src="/zenigram-logo.svg"
                alt="Zenigram logo"
                width={35}
                height={35}
                className="h-12 w-12 rounded-full object-cover"
              />
            </div>
            <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-xl font-black tracking-tight text-white opacity-0 transition-all duration-300 md:block group-hover/nav:max-w-40 group-hover/nav:opacity-100">
              Zenigram
            </span>
          </Link>

          <nav aria-label="Main navigation" className="h-full">
            <ul
              className="
                flex h-full
                items-center
                justify-around

                md:flex-col
                md:items-stretch
                md:justify-start
                md:gap-1.5
              "
            >
              <li>
                <NavbarLink
                  href="/"
                  label="Home"
                  active={pathname === "/"}
                  icon={<HomeIcon />}
                />
              </li>

              <li>
                <NavbarLink
                  href="/explore"
                  label="Explore"
                  active={isRouteActive(pathname, "/explore")}
                  icon={<SearchIcon />}
                />
              </li>

              <li>
                <NavbarLink
                  href="/clips"
                  label="Clips"
                  active={isRouteActive(pathname, "/clips")}
                  icon={<PlayIcon />}
                />
              </li>

              <li className="hidden md:block">
                <NavbarLink
                  href="/saved"
                  label="Saved"
                  active={isRouteActive(pathname, "/saved")}
                  icon={<BookmarkIcon />}
                />
              </li>

              <li>
                <NavbarLink
                  href="/messages"
                  label="Messages"
                  active={isRouteActive(pathname, "/messages")}
                  icon={<SendIcon />}
                  badge={badges.messagesCount}
                />
              </li>

              <li>
                <NavbarLink
                  href="/notifications"
                  label="Notifications"
                  active={
                    isRouteActive(pathname, "/notifications") ||
                    showNotifications
                  }
                  icon={<BellIcon />}
                  badge={badges.notificationsCount}
                  onClick={handleNotificationsClick}
                />
              </li>

              {/* Create */}
              <li ref={createMenuRef} className="relative">
                <button
                  type="button"
                  aria-label="Create"
                  aria-haspopup="menu"
                  aria-expanded={createOpen}
                  onClick={() => {
                    setCreateOpen((current) => !current);
                    setShowNotifications(false);
                  }}
                  className={navbarItemClasses(createOpen)}
                >
                  <span className={navbarIconClasses(createOpen)}>
                    <PlusIcon />
                  </span>

                  <span className="hidden max-w-0 overflow-hidden whitespace-nowrap font-medium opacity-0 transition-all duration-300 md:block group-hover/nav:max-w-40 group-hover/nav:opacity-100">
                    Create
                  </span>

                  <span className="sr-only md:hidden">Create</span>
                </button>

                <AnimatePresence>
                  {createOpen && (
                    <motion.div
                      role="menu"
                      initial={{
                        opacity: 0,
                        y: 10,
                        scale: 0.96,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                      }}
                      exit={{
                        opacity: 0,
                        y: 10,
                        scale: 0.96,
                      }}
                      transition={{
                        duration: 0.16,
                        ease: "easeOut",
                      }}
                      className="
                        absolute
                        bottom-full
                        left-1/2
                        z-70
                        mb-4
                        w-72
                        -translate-x-1/2

                        overflow-hidden
                        rounded-2xl

                        border
                        border-red-950/80

                        bg-[#100405]/98
                        p-2

                        shadow-[0_24px_70px_rgba(0,0,0,0.65),0_0_35px_rgba(127,29,29,0.16)]

                        ring-1
                        ring-inset
                        ring-white/2.5

                        backdrop-blur-2xl

                        md:bottom-auto
                        md:left-full
                        md:top-0
                        md:ml-3
                        md:translate-x-0

                      "
                    >
                      <div
                        aria-hidden="true"
                        className="
                          pointer-events-none
                          absolute inset-x-0 top-0
                          h-px
                          bg-linear-to-r
                          from-transparent
                          via-red-500/40
                          to-transparent
                        "
                      />

                      <CreateItem
                        href="/create-post"
                        title="Create post"
                        description="Share photos, thoughts or updates"
                        icon="✦"
                        onClick={() => setCreateOpen(false)}
                      />

                      <CreateItem
                        href="/create-story"
                        title="Create story"
                        description="Share a temporary moment"
                        icon="◉"
                        onClick={() => setCreateOpen(false)}
                      />
                      <CreateItem
                        href="/create-clip"
                        title="Create clip"
                        description="Edit a reel-style video up to 2 minutes"
                        icon="▶"
                        onClick={() => setCreateOpen(false)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>

              {/* Profile */}
              <li className="md:mt-auto">
                <NavbarLink
                  href={profileHref}
                  label="Profile"
                  active={
                    pathname === "/profile" || pathname?.startsWith("/profile/")
                  }
                  icon={
                    <ProfileAvatar
                      src={
                        user?.profilePic || session?.user?.image || "/user.svg"
                      }
                    />
                  }
                />
              </li>
            </ul>
          </nav>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/*                       NOTIFICATION DRAWER                          */}
      {/* ------------------------------------------------------------------ */}

      <AnimatePresence>
        {showNotifications && (
          <>
            <motion.button
              type="button"
              aria-label="Close notifications"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifications(false)}
              className="
                fixed inset-0
                z-50
                hidden
                cursor-default

                bg-black/75
                backdrop-blur-[3px]

                md:block
              "
            />

            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="notifications-title"
              initial={{
                x: "100%",
                opacity: 0,
              }}
              animate={{
                x: 0,
                opacity: 1,
              }}
              exit={{
                x: "100%",
                opacity: 0,
              }}
              transition={{
                type: "spring",
                stiffness: 360,
                damping: 36,
              }}
              className="
                fixed right-0 top-0
                z-60

                hidden
                h-dvh
                w-full
                max-w-[420px]
                flex-col

                border-l
                border-red-950/70

                bg-[#090304]/97

                shadow-[-30px_0_90px_rgba(0,0,0,0.7),-8px_0_40px_rgba(127,29,29,0.12)]

                ring-1
                ring-inset
                ring-white/2.5

                backdrop-blur-2xl

                md:flex
              "
            >
              {/* red glow */}
              <div
                aria-hidden="true"
                className="
                  pointer-events-none
                  absolute inset-x-0 top-0
                  h-64
                  overflow-hidden
                "
              >
                <div
                  className="
                    absolute
                    -right-20 -top-24
                    size-72
                    rounded-full
                    bg-red-900/15
                    blur-3xl
                  "
                />
              </div>

              {/* Drawer header */}
              <div
                className="
                  relative
                  flex items-center
                  justify-between

                  border-b
                  border-red-950/60

                  px-5 py-5
                "
              >
                <div>
                  <p
                    className="
                      text-[11px]
                      font-bold
                      uppercase
                      tracking-[0.22em]
                      text-red-400
                    "
                  >
                    Activity
                  </p>

                  <h2
                    id="notifications-title"
                    className="
                      mt-1
                      text-xl
                      font-bold
                      tracking-tight
                      text-white
                    "
                  >
                    Notifications
                  </h2>
                </div>

                <button
                  type="button"
                  autoFocus
                  onClick={() => setShowNotifications(false)}
                  aria-label="Close notifications"
                  className="
                    grid size-10
                    place-items-center

                    rounded-xl

                    border
                    border-transparent

                    text-zinc-500

                    transition-all
                    duration-200

                    hover:border-red-500/15
                    hover:bg-red-500/8
                    hover:text-red-300
                  "
                >
                  <ChevronRightIcon />
                </button>
              </div>

              {/* Notification content */}
              <div
                className="
                  relative
                  flex-1
                  overflow-y-auto
                  overscroll-contain
                  p-3
                "
              >
                {notifications.length === 0 ? (
                  <EmptyNotifications />
                ) : (
                  <div className="space-y-1">
                    <AnimatePresence initial={false}>
                      {notifications.map((notification) => (
                        <NotificationItem
                          key={
                            notification._id ||
                            `${notification.type}-${notification.createdAt}`
                          }
                          notification={notification}
                          processing={
                            processingNotificationId === notification._id
                          }
                          onRespond={respondToSupportRequest}
                          onRespondUnblock={respondToUnblockRequest}
                          onNavigate={() => setShowNotifications(false)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Drawer footer */}
              <div
                className="
                  relative
                  border-t
                  border-red-950/60

                  bg-black/10
                  p-4
                "
              >
                <Link
                  href="/notifications"
                  onClick={() => setShowNotifications(false)}
                  className="
                    flex w-full
                    items-center
                    justify-center

                    rounded-xl

                    border
                    border-red-500/15

                    bg-red-950/20

                    px-4 py-3

                    text-sm
                    font-semibold
                    text-zinc-200

                    transition-all
                    duration-200

                    hover:border-red-500/30
                    hover:bg-red-500/10
                    hover:text-red-200

                    hover:shadow-[0_0_24px_rgba(220,38,38,0.08)]
                  "
                >
                  View all notifications
                </Link>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                              NAVBAR LINK                                   */
/* -------------------------------------------------------------------------- */

function NavbarLink({ href, label, icon, badge = 0, active = false, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={navbarItemClasses(active)}
    >
      <span className={navbarIconClasses(active)}>
        {icon}
        <Badge count={badge} />
      </span>

      <span
        className="
          hidden
          max-w-0
          overflow-hidden
          truncate
          whitespace-nowrap
          font-medium
          opacity-0
          transition-all
          duration-300
          md:block
          group-hover/nav:max-w-40
          group-hover/nav:opacity-100
        "
      >
        {label}
      </span>

      <span className="sr-only md:hidden">{label}</span>

      {active && (
        <motion.span
          layoutId="navbar-active-indicator"
          transition={{
            type: "spring",
            stiffness: 420,
            damping: 34,
          }}
          className="
            absolute
            bottom-0

            h-0.5
            w-5

            rounded-full
            bg-red-500

            shadow-[0_0_14px_rgba(239,68,68,0.9)]

            md:bottom-auto
            md:left-0
            md:h-7
            md:w-0.5

          "
        />
      )}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*                               BADGE                                        */
/* -------------------------------------------------------------------------- */

function Badge({ count }) {
  if (!count || count <= 0) {
    return null;
  }

  return (
    <span
      aria-label={`${count} unread`}
      className="
        absolute
        -right-2
        -top-2

        grid
        min-h-5
        min-w-5
        place-items-center

        rounded-full

        border
        border-red-300/25

        bg-linear-to-br
        from-red-500
        via-red-600
        to-red-800

        px-1

        text-[10px]
        font-black
        leading-none
        text-white

        shadow-[0_0_14px_rgba(239,68,68,0.5)]

        ring-2
        ring-[#080203]
      "
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                              CREATE ITEM                                   */
/* -------------------------------------------------------------------------- */

function CreateItem({ href, title, description, icon, onClick }) {
  return (
    <Link
      role="menuitem"
      href={href}
      onClick={onClick}
      className="
        group/create

        relative
        flex items-center
        gap-3

        overflow-hidden
        rounded-xl

        border
        border-transparent

        px-3 py-3

        transition-all
        duration-200

        hover:border-red-500/10
        hover:bg-red-500/[0.07]
      "
    >
      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute inset-0

          bg-linear-to-r
          from-red-500/4
          to-transparent

          opacity-0

          transition-opacity
          duration-200

          group-hover/create:opacity-100
        "
      />

      <div
        className="
          relative
          grid size-10
          shrink-0
          place-items-center

          rounded-xl

          border
          border-red-500/15

          bg-red-950/40

          text-lg
          text-red-400

          shadow-inner
          shadow-red-950/20

          transition-all
          duration-200

          group-hover/create:scale-105
          group-hover/create:border-red-400/30
          group-hover/create:bg-red-600
          group-hover/create:text-white

          group-hover/create:shadow-[0_0_22px_rgba(220,38,38,0.18)]
        "
      >
        {icon}
      </div>

      <div className="relative min-w-0">
        <p
          className="
            text-sm
            font-semibold
            text-zinc-100

            transition-colors

            group-hover/create:text-white
          "
        >
          {title}
        </p>

        <p
          className="
            mt-0.5
            truncate
            text-xs
            text-zinc-500

            transition-colors

            group-hover/create:text-zinc-400
          "
        >
          {description}
        </p>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*                          NOTIFICATION ITEM                                 */
/* -------------------------------------------------------------------------- */

function NotificationItem({
  notification,
  processing,
  onRespond,
  onRespondUnblock,
  onNavigate,
}) {
  const username = notification.username || "Someone";

  const profileHref = notification.username
    ? `/profile/${encodeURIComponent(notification.username)}`
    : null;

  const avatar = (
    <Image
      src={
        notification.profilePic ||
        "/black-person-profile-icon-round-3d-ui-button-vector-illustration_541075-900.avif"
      }
      width={44}
      height={44}
      alt={`${username}'s profile`}
      className="
        size-11
        rounded-full
        border
        border-red-950/80
        object-cover

        ring-1
        ring-white/5
      "
    />
  );

  return (
    <motion.div
      layout
      initial={{
        opacity: 0,
        x: 20,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
      exit={{
        opacity: 0,
        x: 20,
        height: 0,
      }}
      transition={{
        duration: 0.2,
      }}
      className={`
        relative
        flex
        items-start
        gap-3

        overflow-hidden
        rounded-2xl

        border

        px-3 py-3

        transition-all
        duration-200

        ${
          notification.read
            ? `
              border-transparent
              hover:border-red-950/60
              hover:bg-white/2.5
            `
            : `
              border-red-500/15
              bg-red-950/20
              shadow-[inset_0_0_25px_rgba(127,29,29,0.05)]
              hover:border-red-500/20
              hover:bg-red-950/30
            `
        }
      `}
    >
      {!notification.read && (
        <span
          aria-label="Unread notification"
          className="
            absolute
            right-3
            top-3

            size-2

            rounded-full

            bg-red-500

            shadow-[0_0_10px_rgba(239,68,68,0.8)]
          "
        />
      )}

      {profileHref ? (
        <Link
          href={profileHref}
          onClick={onNavigate}
          className="
            shrink-0
            rounded-full
            outline-none

            transition-transform

            hover:scale-105

            focus-visible:ring-2
            focus-visible:ring-red-500/60
          "
        >
          {avatar}
        </Link>
      ) : (
        <div className="shrink-0">{avatar}</div>
      )}

      <div className="min-w-0 flex-1 pr-3">
        <div
          className="
            text-sm
            leading-relaxed
            text-zinc-300
          "
        >
          {profileHref ? (
            <Link
              href={profileHref}
              onClick={onNavigate}
              className="
                font-semibold
                text-white

                transition-colors

                hover:text-red-300
              "
            >
              {username}
            </Link>
          ) : (
            <span
              className="
                font-semibold
                text-white
              "
            >
              {username}
            </span>
          )}{" "}
          <NotificationContent
            notification={notification}
            processing={processing}
            onRespond={onRespond}
            onRespondUnblock={onRespondUnblock}
          />
        </div>

        {notification.createdAt && (
          <p
            className="
              mt-2
              text-[11px]
              font-medium
              text-zinc-600
            "
          >
            {formatNotificationDate(notification.createdAt)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        NOTIFICATION CONTENT                                */
/* -------------------------------------------------------------------------- */

function NotificationContent({
  notification,
  processing,
  onRespond,
  onRespondUnblock,
}) {
  switch (notification.type) {
    case "like":
      return (
        <>
          liked your post <span aria-hidden="true">❤️</span>
        </>
      );

    case "comment":
      return (
        <>
          commented on your post <span aria-hidden="true">💬</span>
        </>
      );

    case "story_mention":
      return (
        <>
          mentioned you in a story <span aria-hidden="true">@</span>
        </>
      );

    case "support_request":
      return (
        <>
          sent you a support request <span aria-hidden="true">🔒</span>
          {notification.status === "pending" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton
                disabled={processing}
                onClick={() => onRespond(notification._id, "accept")}
              >
                {processing ? "Processing..." : "Accept"}
              </ActionButton>

              <ActionButton
                variant="danger"
                disabled={processing}
                onClick={() => onRespond(notification._id, "reject")}
              >
                Decline
              </ActionButton>
            </div>
          )}
        </>
      );

    case "support":
      return (
        <span className="text-rose-300">accepted your support request ✓</span>
      );

    case "user_blocked":
      return (
        <span className="text-red-400">
          blocked you. Messaging and profile access are disabled.
        </span>
      );

    case "user_unblocked":
      return (
        <span className="text-rose-300">
          unblocked you. You can message each other again.
        </span>
      );

    case "unblock_request":
      return (
        <UnblockRequestContent
          notification={notification}
          processing={processing}
          onRespondUnblock={onRespondUnblock}
        />
      );

    case "unblock_request_declined":
      return (
        <span className="text-red-400">
          declined your unblock request. The block remains active.
        </span>
      );

    default:
      return <>{notification.message || "sent you a notification."}</>;
  }
}

/* -------------------------------------------------------------------------- */
/*                       UNBLOCK REQUEST CONTENT                              */
/* -------------------------------------------------------------------------- */

function UnblockRequestContent({
  notification,
  processing,
  onRespondUnblock,
}) {
  const [currentTime, setCurrentTime] = useState(null);

  const expiresAt = notification.event?.expiresAt;

  useEffect(() => {
    const updateCurrentTime = () => {
      setCurrentTime(Date.now());
    };

    updateCurrentTime();

    const interval = window.setInterval(updateCurrentTime, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const expirationTime = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;

  const hasValidExpiry = Number.isFinite(expirationTime);

  const isActive =
    notification.status === "pending" &&
    currentTime !== null &&
    hasValidExpiry &&
    expirationTime > currentTime;

  const isExpired =
    notification.status === "pending" &&
    currentTime !== null &&
    hasValidExpiry &&
    expirationTime <= currentTime;

  return (
    <>
      <span className="text-red-300">requested to be unblocked.</span>

      {isActive && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton
            disabled={processing}
            onClick={() => onRespondUnblock(notification, "accept")}
          >
            {processing ? "Processing..." : "Accept request"}
          </ActionButton>
          <ActionButton
            variant="danger"
            disabled={processing}
            onClick={() => onRespondUnblock(notification, "decline")}
          >
            Decline
          </ActionButton>
        </div>
      )}

      {isExpired && (
        <p
          className="
            mt-2
            text-xs
            font-medium
            text-zinc-500
          "
        >
          This request has expired
        </p>
      )}

      {notification.status === "approved" && (
        <p
          className="
            mt-2
            text-xs
            font-semibold
            text-rose-300
          "
        >
          Request accepted
        </p>
      )}
      {notification.status === "rejected" && (
        <p className="mt-2 text-xs font-semibold text-red-400">
          Request declined
        </p>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                             ACTION BUTTON                                  */
/* -------------------------------------------------------------------------- */

function ActionButton({ children, onClick, disabled, variant = "primary" }) {
  const variants = {
    primary: `
      border-red-400/20

      bg-linear-to-r
      from-red-600
      to-red-700

      text-white

      shadow-[0_6px_18px_rgba(220,38,38,0.18)]

      hover:from-red-500
      hover:to-red-600
      hover:shadow-[0_8px_24px_rgba(220,38,38,0.25)]
    `,

    danger: `
      border-red-500/20

      bg-red-950/40

      text-red-300

      hover:border-red-500/35
      hover:bg-red-950/70
      hover:text-red-200
    `,
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        rounded-lg

        border

        px-3 py-1.5

        text-xs
        font-semibold

        transition-all
        duration-200

        disabled:cursor-not-allowed
        disabled:opacity-50

        ${variants[variant] || variants.primary}
      `}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                       EMPTY NOTIFICATIONS                                  */
/* -------------------------------------------------------------------------- */

function EmptyNotifications() {
  return (
    <div
      className="
        flex h-full
        min-h-[400px]
        flex-col
        items-center
        justify-center

        px-6

        text-center
      "
    >
      <div
        className="
          relative

          grid size-16
          place-items-center

          rounded-2xl

          border
          border-red-500/10

          bg-red-950/25

          text-red-400

          shadow-[0_0_35px_rgba(127,29,29,0.1)]
        "
      >
        <div
          aria-hidden="true"
          className="
            absolute inset-0
            rounded-2xl
            bg-linear-to-br
            from-red-500/6
            to-transparent
          "
        />

        <span className="relative">
          <BellIcon />
        </span>
      </div>

      <h3
        className="
          mt-5
          font-semibold
          text-white
        "
      >
        You&apos;re all caught up
      </h3>

      <p
        className="
          mt-2
          max-w-60

          text-sm
          leading-relaxed
          text-zinc-500
        "
      >
        Likes, comments, requests and other activity will appear here.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             PROFILE AVATAR                                 */
/* -------------------------------------------------------------------------- */

function ProfileAvatar({ src }) {
  return (
    <Image
      src={src}
      alt=""
      width={30}
      height={30}
      className="
        size-7
        rounded-full

        border
        border-red-500/20

        object-cover

        ring-1
        ring-white/6
      "
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                             STYLE HELPERS                                  */
/* -------------------------------------------------------------------------- */

function navbarItemClasses(active) {
  return `
    group

    relative

    flex
    w-full
    items-center
    justify-center

    rounded-2xl

    border
    border-transparent

    px-3 py-2.5

    text-zinc-400

    outline-none

    transition-all
    duration-200

    hover:border-red-500/10
    hover:bg-red-500/[0.06]
    hover:text-red-100

    focus-visible:border-red-500/30
    focus-visible:ring-2
    focus-visible:ring-red-500/20

    md:min-h-12
    md:px-3
    md:py-3

    md:gap-0
    md:group-hover/nav:justify-start
    md:group-hover/nav:gap-4
    md:group-hover/nav:px-4

    ${
      active
        ? `
          border-red-500/15

          bg-linear-to-r
          from-red-500/[0.14]
          via-red-950/[0.12]
          to-transparent

          text-red-300

          shadow-[inset_0_0_24px_rgba(220,38,38,0.04),0_0_20px_rgba(127,29,29,0.04)]
        `
        : ""
    }
  `;
}

function navbarIconClasses(active) {
  return `
    relative

    grid
    size-8
    shrink-0
    place-items-center

    transition-all
    duration-200

    group-hover:scale-110

    ${
      active
        ? `
          text-red-400
          drop-shadow-[0_0_10px_rgba(239,68,68,0.38)]
        `
        : `
          text-zinc-400
          group-hover:text-red-400
        `
    }
  `;
}

/* -------------------------------------------------------------------------- */
/*                               HELPERS                                      */
/* -------------------------------------------------------------------------- */

function isRouteActive(pathname, href) {
  if (!pathname) {
    return false;
  }

  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatNotificationDate(date) {
  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

/* -------------------------------------------------------------------------- */
/*                                  ICONS                                     */
/* -------------------------------------------------------------------------- */

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />

      <path d="m10 8 6 4-6 4V8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7 -rotate-25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
