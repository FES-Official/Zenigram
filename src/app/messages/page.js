"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IoAttach,
  IoArrowBack,
  IoArrowUndo,
  IoBan,
  IoBrush,
  IoChatbubbleOutline,
  IoCheckmark,
  IoCopy,
  IoClose,
  IoHappy,
  IoHeart,
  IoHeartOutline,
  IoMic,
  IoMicOff,
  IoFlag,
  IoEllipsisVertical,
  IoReturnUpForward,
  IoSearch,
  IoSend,
  IoTrash,
  IoWarning,
} from "react-icons/io5";
import DrawingPad from "../../../components/chat/DrawingPad";
import ClipReelPlayer from "../../../components/ClipReelPlayer";
import { getRealtimeSocket } from "@/app/lib/realtimeClient";
import { uploadMediaDirect } from "@/app/lib/directS3Upload";
import Navbar from "../../../components/navbar";

const MESSAGE_POLL_INTERVAL = 60000;
const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥"];

export default function MessagesPage() {
  const { data: session } = useSession();

  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(() => {
    if (typeof window === "undefined") return "";

    return (
      new URLSearchParams(window.location.search).get("conversation") || ""
    );
  });

  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [invitations, setInvitations] = useState([]);
  const [view, setView] = useState("chats");

  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [openActionsId, setOpenActionsId] = useState("");
  const [showDrawing, setShowDrawing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [isPageActive, setIsPageActive] = useState(true);
  const [sharedClipPreview, setSharedClipPreview] = useState(null);
  const [sharedClipMuted, setSharedClipMuted] = useState(true);
  const [mediaPreview, setMediaPreview] = useState(null);

  const [startingConversationId, setStartingConversationId] = useState("");
  const [invitationActionId, setInvitationActionId] = useState("");
  const [error, setError] = useState("");

  const messagesEndRef = useRef(null);
  const messageRequestRef = useRef(0);
  const mediaInputRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const markReadRequestsRef = useRef(new Set());

  const currentUserId = session?.user?.id;

  const loadConversations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoadingConversations(true);
    }

    try {
      const response = await fetch("/api/conversations", {
        cache: "no-store",
      });

      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to load conversations");
      }

      setConversations(
        dedupeConversations(
          Array.isArray(data.conversations) ? data.conversations : [],
        ),
      );
    } catch (requestError) {
      if (!silent) {
        setError(requestError.message || "Unable to load conversations");
      }
    } finally {
      if (!silent) {
        setIsLoadingConversations(false);
      }
    }
  }, []);

  const loadInvitations = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetch("/api/event-invitations", {
        cache: "no-store",
      });

      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to load invitations");
      }

      setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
    } catch (requestError) {
      if (!silent) {
        setError(requestError.message || "Unable to load invitations");
      }
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId, { silent = false } = {}) => {
      if (!conversationId) return;

      const requestId = ++messageRequestRef.current;

      if (!silent) {
        setIsLoadingMessages(true);
      }

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            cache: "no-store",
          },
        );

        const data = await parseResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Unable to load messages");
        }

        if (requestId !== messageRequestRef.current) {
          return;
        }

        setMessages(
          dedupeMessages(Array.isArray(data.messages) ? data.messages : []),
        );
      } catch (requestError) {
        if (!silent && requestId === messageRequestRef.current) {
          setError(requestError.message || "Unable to load messages");
        }
      } finally {
        if (!silent && requestId === messageRequestRef.current) {
          setIsLoadingMessages(false);
        }
      }
    },
    [],
  );

  const markMessagesAsSeen = useCallback(
    async (conversationId, messageIds) => {
      if (!conversationId || !currentUserId || !messageIds?.length) return;

      const uniqueMessageIds = [...new Set(messageIds.map(String))];
      const requestKey = `${conversationId}:${uniqueMessageIds.join(",")}`;

      if (markReadRequestsRef.current.has(requestKey)) return;
      markReadRequestsRef.current.add(requestKey);

      // Update the UI immediately. The next poll will reconcile with the server.
      setMessages((current) =>
        current.map((message) =>
          uniqueMessageIds.some((messageId) => sameId(messageId, message._id))
            ? {
                ...message,
                readBy: addReader(message.readBy, currentUserId),
              }
            : message,
        ),
      );

      setConversations((current) =>
        current.map((conversation) =>
          sameId(conversation._id, conversationId)
            ? {
                ...conversation,
                unreadCount: 0,
                lastMessage: conversation.lastMessage
                  ? {
                      ...conversation.lastMessage,
                      readBy: addReader(
                        conversation.lastMessage.readBy,
                        currentUserId,
                      ),
                    }
                  : conversation.lastMessage,
              }
            : conversation,
        ),
      );

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages/read`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageIds: uniqueMessageIds }),
          },
        );

        const data = await parseResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Unable to mark messages as seen");
        }

        void loadConversations({ silent: true });
      } catch (requestError) {
        setError(requestError.message || "Unable to mark messages as seen");
      } finally {
        markReadRequestsRef.current.delete(requestKey);
      }
    },
    [currentUserId, loadConversations],
  );

  useEffect(() => {
    const updatePageActivity = () => {
      setIsPageActive(
        document.visibilityState === "visible" && document.hasFocus(),
      );
    };

    updatePageActivity();
    document.addEventListener("visibilitychange", updatePageActivity);
    window.addEventListener("focus", updatePageActivity);
    window.addEventListener("blur", updatePageActivity);

    return () => {
      document.removeEventListener("visibilitychange", updatePageActivity);
      window.removeEventListener("focus", updatePageActivity);
      window.removeEventListener("blur", updatePageActivity);
    };
  }, []);

  useEffect(() => {
    void Promise.all([loadConversations(), loadInvitations()]);
  }, [loadConversations, loadInvitations]);

  useEffect(() => {
    if (!currentUserId) return undefined;
    const socket = getRealtimeSocket();
    if (!socket) return undefined;

    const register = () => socket.emit("register", currentUserId);
    const onNewMessage = ({ conversationId, message }) => {
      if (sameId(conversationId, selectedId) && message) {
        setMessages((current) => dedupeMessages([...current, message]));
      }

      const senderId = message?.sender?._id || message?.sender;
      const isIncoming = message && !sameId(senderId, currentUserId);
      const shouldRemainUnread =
        isIncoming && (!sameId(conversationId, selectedId) || !isPageActive);

      if (shouldRemainUnread) {
        setConversations((current) =>
          current.map((conversation) =>
            sameId(conversation._id, conversationId)
              ? {
                  ...conversation,
                  unreadCount:
                    getConversationUnreadCount(conversation, currentUserId) + 1,
                  lastMessage: message,
                  updatedAt: message.createdAt || conversation.updatedAt,
                }
              : conversation,
          ),
        );
      }

      void loadConversations({ silent: true });
    };
    const onMessageUpdate = ({ conversationId, message }) => {
      if (!sameId(conversationId, selectedId) || !message) return;
      setMessages((current) =>
        dedupeMessages(
          current.map((item) =>
            sameId(item._id, message._id) ? message : item,
          ),
        ),
      );
    };
    const onMessageDelete = ({ conversationId, messageId, scope, userId }) => {
      if (!sameId(conversationId, selectedId)) return;
      if (scope === "me" && !sameId(userId, currentUserId)) return;
      setMessages((current) =>
        current.filter((item) => !sameId(item._id, messageId)),
      );
      void loadConversations({ silent: true });
    };
    const onMessageRead = ({ conversationId, readerId, messageIds = [] }) => {
      if (sameId(readerId, currentUserId)) {
        setConversations((current) =>
          current.map((conversation) =>
            sameId(conversation._id, conversationId)
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        );
      }

      if (!sameId(conversationId, selectedId)) return;

      setMessages((current) =>
        current.map((item) =>
          messageIds.some((id) => sameId(id, item._id))
            ? {
                ...item,
                readBy: addReader(item.readBy, readerId),
              }
            : item,
        ),
      );
    };
    const onBlockUpdate = ({ conversationId, blockState }) => {
      if (conversationId) {
        setConversations((current) =>
          current.map((conversation) =>
            sameId(conversation._id, conversationId)
              ? { ...conversation, blockState }
              : conversation,
          ),
        );
      }
      void loadConversations({ silent: true });
    };
    const onConversationDelete = ({ conversationId, userId, purged }) => {
      if (!purged && !sameId(userId, currentUserId)) return;
      setConversations((current) =>
        current.filter((conversation) =>
          !sameId(conversation._id, conversationId),
        ),
      );
      if (sameId(conversationId, selectedId)) {
        messageRequestRef.current += 1;
        setMessages([]);
        setSelectedId("");
        setReplyTo(null);
        setOpenActionsId("");
        setChatMenuOpen(false);
      }
    };

    register();
    socket.on("connect", register);
    socket.on("message:new", onNewMessage);
    socket.on("message:update", onMessageUpdate);
    socket.on("message:delete", onMessageDelete);
    socket.on("message:read", onMessageRead);
    socket.on("conversation:delete", onConversationDelete);
    socket.on("block:update", onBlockUpdate);
    return () => {
      socket.off("connect", register);
      socket.off("message:new", onNewMessage);
      socket.off("message:update", onMessageUpdate);
      socket.off("message:delete", onMessageDelete);
      socket.off("message:read", onMessageRead);
      socket.off("conversation:delete", onConversationDelete);
      socket.off("block:update", onBlockUpdate);
    };
  }, [currentUserId, isPageActive, loadConversations, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return undefined;
    }

    messageRequestRef.current += 1;
    setMessages([]);

    void loadMessages(selectedId);

    const interval = window.setInterval(() => {
      void loadMessages(selectedId, { silent: true });
    }, MESSAGE_POLL_INTERVAL);

    return () => {
      window.clearInterval(interval);
      messageRequestRef.current += 1;
    };
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (!selectedId || !currentUserId || !isPageActive || !messages.length) {
      return;
    }

    const unseenMessageIds = messages
      .filter((message) => {
        const senderId = message.sender?._id || message.sender;
        const isIncoming = !sameId(senderId, currentUserId);
        const isSeen = (message.readBy || []).some((readerId) =>
          sameId(readerId, currentUserId),
        );

        return isIncoming && !isSeen && !message.deletedForEveryone;
      })
      .map((message) => message._id)
      .filter(Boolean);

    if (!unseenMessageIds.length) return;

    void markMessagesAsSeen(selectedId, unseenMessageIds);
  }, [currentUserId, isPageActive, markMessagesAsSeen, messages, selectedId]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }

    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(query)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const data = await parseResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Unable to search users");
        }

        const users = Array.isArray(data.users) ? data.users : [];

        setSearchResults(
          users.filter((user) => !sameId(user?._id, currentUserId)),
        );
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setSearchResults([]);
          setError(requestError.message || "Unable to search users");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [currentUserId, searchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);

    if (selectedId) {
      url.searchParams.set("conversation", selectedId);
    } else {
      url.searchParams.delete("conversation");
    }

    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [selectedId]);

  useEffect(() => {
    setChatMenuOpen(false);
    setOpenActionsId("");
    setReplyTo(null);
  }, [selectedId]);

  useEffect(() => {
    if (!messages.length) return;

    const animationFrame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [messages]);

  useEffect(() => {
    if (!error) return undefined;

    const timeout = window.setTimeout(() => {
      setError("");
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [error]);

  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) =>
        sameId(conversation._id, selectedId),
      ),
    [conversations, selectedId],
  );

  const otherParticipant = useMemo(
    () =>
      selectedConversation?.participants?.find(
        (participant) => !sameId(participant?._id, currentUserId),
      ),
    [currentUserId, selectedConversation],
  );

  const blockState = selectedConversation?.blockState || { blocked: false };
  const viewerIsBlocker =
    blockState.blocked && sameId(blockState.blockerId, currentUserId);
  const viewerIsBlocked =
    blockState.blocked && sameId(blockState.blockedUserId, currentUserId);

  const totalUnreadCount = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) =>
          total + getConversationUnreadCount(conversation, currentUserId),
        0,
      ),
    [conversations, currentUserId],
  );

  const pendingInvitationCount = useMemo(
    () =>
      invitations.filter((invitation) => invitation.status === "pending")
        .length,
    [invitations],
  );

  const startConversation = async (recipientId) => {
    if (!recipientId || startingConversationId) return;

    const existingConversation = conversations.find((conversation) =>
      isDirectConversationWith(conversation, currentUserId, recipientId),
    );

    if (existingConversation?._id) {
      setSelectedId(String(existingConversation._id));
      setSearchQuery("");
      setSearchResults([]);
      setView("chats");
      return;
    }

    setError("");
    setStartingConversationId(recipientId);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipientId }),
      });

      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to start conversation");
      }

      const conversationId = data.conversation?._id;

      if (!conversationId) {
        throw new Error("The conversation could not be created");
      }

      setSelectedId(conversationId);
      setSearchQuery("");
      setSearchResults([]);
      setView("chats");

      await loadConversations({ silent: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to start conversation");
    } finally {
      setStartingConversationId("");
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();

    const text = messageText.trim();

    if ((!text && pendingMedia.length === 0) || !selectedId || isSending)
      return;

    setError("");
    setIsSending(true);

    try {
      const response = await fetch(
        `/api/conversations/${selectedId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            media: pendingMedia,
            replyTo: replyTo?._id || null,
          }),
        },
      );

      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to send message");
      }

      if (!data.message) {
        throw new Error("The message was not returned by the server");
      }

      // Prevent an older polling request from overwriting this new message.
      messageRequestRef.current += 1;

      setMessages((currentMessages) => {
        const alreadyExists = currentMessages.some((message) =>
          sameId(message._id, data.message._id),
        );

        return alreadyExists
          ? currentMessages
          : dedupeMessages([...currentMessages, data.message]);
      });

      setMessageText("");
      setPendingMedia([]);
      setReplyTo(null);
      void loadConversations({ silent: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to send message");
    } finally {
      setIsSending(false);
    }
  };

  const uploadMedia = async (file, kind = "") => {
    if (!file || isUploading) return;
    setIsUploading(true);
    setError("");
    try {
      const uploaded = await uploadMediaDirect(file);
      const inferredType = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "audio";
      setPendingMedia((current) =>
        [
          ...current,
          {
            url: uploaded.url,
            publicId: uploaded.key,
            type: kind === "drawing" ? "drawing" : inferredType,
          },
        ].slice(0, 6),
      );
      setShowDrawing(false);
    } catch (requestError) {
      setError(requestError.message || "Unable to upload media");
    } finally {
      setIsUploading(false);
    }
  };

  const updateMessage = async (messageId, action, emoji = "") => {
    const response = await fetch(`/api/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, emoji }),
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.error || "Unable to update message");
    setMessages((current) =>
      current.map((item) =>
        sameId(item._id, messageId) ? data.message : item,
      ),
    );
    setOpenActionsId("");
  };

  const deleteMessage = async (message, scope) => {
    const response = await fetch(
      `/api/messages/${message._id}?scope=${scope}`,
      {
        method: "DELETE",
      },
    );
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.error || "Unable to delete message");
    setMessages((current) =>
      current.filter((item) => !sameId(item._id, message._id)),
    );
    setOpenActionsId("");
    void loadConversations({ silent: true });
  };

  const forwardMessage = async (message) => {
    const username = window.prompt("Forward to which username?");
    if (!username?.trim()) return;
    try {
      const searchResponse = await fetch(
        `/api/search/users?q=${encodeURIComponent(username.trim())}`,
        { cache: "no-store" },
      );
      const searchData = await parseResponse(searchResponse);
      const target = searchData.users?.find(
        (user) =>
          user.username?.toLowerCase() === username.trim().toLowerCase(),
      );
      if (!target) throw new Error("User not found");
      const conversationResponse = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: target._id }),
      });
      const conversationData = await parseResponse(conversationResponse);
      if (!conversationResponse.ok) {
        throw new Error(
          conversationData.error || "Unable to open conversation",
        );
      }
      const response = await fetch(
        `/api/conversations/${conversationData.conversation._id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forwardFrom: message._id }),
        },
      );
      const data = await parseResponse(response);
      if (!response.ok)
        throw new Error(data.error || "Unable to forward message");
      setOpenActionsId("");
    } catch (requestError) {
      setError(requestError.message || "Unable to forward message");
    }
  };

  const reportMessageSender = async (message) => {
    const senderId = message.sender?._id || message.sender;
    const reason = window.prompt(
      "Describe the unwanted, abusive, or unsafe behavior in this message.",
    );
    if (!reason?.trim()) return;
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: senderId,
          messageId: message._id,
          category: "message_abuse",
          reason,
        }),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || "Unable to submit report");
      }
      setOpenActionsId("");
      window.alert(
        "Report submitted. The message and sender were included for review.",
      );
    } catch (requestError) {
      setError(requestError.message || "Unable to submit report");
    }
  };

  const reportConversationUser = async () => {
    const targetUserId = otherParticipant?._id;
    if (!targetUserId) return;
    const reason = window.prompt(
      `Why are you reporting @${otherParticipant.username}?`,
    );
    if (!reason?.trim()) return;
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          category: "user",
          reason,
        }),
      });
      const data = await parseResponse(response);
      if (!response.ok)
        throw new Error(data.message || "Unable to report user");
      setChatMenuOpen(false);
      window.alert("User report submitted for review.");
    } catch (requestError) {
      setError(requestError.message || "Unable to report user");
    }
  };

  const deleteConversation = async () => {
    const conversationId = selectedId;
    if (
      !conversationId ||
      !window.confirm(
        "Delete this chat from your inbox? The other participant keeps their copy unless they also delete it.",
      )
    ) {
      return;
    }

    setError("");
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Unable to delete chat");
      }

      messageRequestRef.current += 1;
      setConversations((current) =>
        current.filter((conversation) =>
          !sameId(conversation._id, conversationId),
        ),
      );
      setMessages([]);
      setReplyTo(null);
      setPendingMedia([]);
      setOpenActionsId("");
      setChatMenuOpen(false);
      setSelectedId("");
    } catch (requestError) {
      setError(requestError.message || "Unable to delete chat");
    }
  };

  const blockConversationUser = async () => {
    const targetUserId = otherParticipant?._id;
    if (
      !targetUserId ||
      !window.confirm(
        `Block @${otherParticipant.username}? You will no longer see each other or be able to message.`,
      )
    ) {
      return;
    }
    try {
      const response = await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          conversationId: selectedId,
          action: "block",
        }),
      });
      const data = await parseResponse(response);
      if (!response.ok) throw new Error(data.message || "Unable to block user");
      setChatMenuOpen(false);
      await Promise.all([
        loadConversations({ silent: true }),
        loadMessages(selectedId, { silent: true }),
      ]);
    } catch (requestError) {
      setError(requestError.message || "Unable to block user");
    }
  };

  const unblockConversationUser = async () => {
    const targetUserId = otherParticipant?._id;
    if (
      !targetUserId ||
      !window.confirm(
        `Unblock @${otherParticipant.username}? You will both be able to message and view each other's profiles again.`,
      )
    ) {
      return;
    }
    try {
      const response = await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          conversationId: selectedId,
          action: "unblock",
        }),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || "Unable to unblock user");
      }
      setChatMenuOpen(false);
      await Promise.all([
        loadConversations({ silent: true }),
        loadMessages(selectedId, { silent: true }),
      ]);
    } catch (requestError) {
      setError(requestError.message || "Unable to unblock user");
    }
  };

  const sendUnblockRequest = async () => {
    const blockerId = blockState.blockerId;
    if (!blockerId || !viewerIsBlocked) return;
    try {
      const response = await fetch("/api/users/unblock-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockerId, conversationId: selectedId }),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || "Unable to send unblock request");
      }
      await loadConversations({ silent: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to send unblock request");
    }
  };

  const acceptUnblockRequest = async () => {
    const requesterId = blockState.blockedUserId;
    if (!requesterId || !viewerIsBlocker || !blockState.request) return;
    try {
      const response = await fetch("/api/users/unblock-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId, conversationId: selectedId }),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || "Unable to accept unblock request");
      }
      await Promise.all([
        loadConversations({ silent: true }),
        loadMessages(selectedId, { silent: true }),
      ]);
    } catch (requestError) {
      setError(requestError.message || "Unable to accept unblock request");
    }
  };

  const declineUnblockRequest = async () => {
    const requesterId = blockState.blockedUserId;
    if (!requesterId || !viewerIsBlocker || !blockState.request) return;
    try {
      const response = await fetch("/api/users/unblock-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId,
          conversationId: selectedId,
          action: "decline",
        }),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        throw new Error(data.message || "Unable to decline unblock request");
      }
      await loadConversations({ silent: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to decline unblock request");
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (type) => MediaRecorder.isTypeSupported?.(type),
      );
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = recorder.mimeType || preferredMimeType || "audio/webm";
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        void uploadMedia(
          new File([blob], `voice-${Date.now()}.${mimeType.includes("mp4") ? "m4a" : "webm"}`, {
            type: mimeType,
          }),
        );
        setIsRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setError("Microphone access is required to record a voice message");
    }
  };

  const respondToInvitation = async (invitationId, action) => {
    if (!invitationId || invitationActionId) return;

    setError("");
    setInvitationActionId(invitationId);

    try {
      const response = await fetch("/api/event-invitations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invitationId, action }),
      });

      const data = await parseResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to update invitation");
      }

      await Promise.all([
        loadInvitations({ silent: true }),
        loadConversations({ silent: true }),
      ]);
    } catch (requestError) {
      setError(requestError.message || "Unable to update invitation");
    } finally {
      setInvitationActionId("");
    }
  };

  return (
    <main className="min-h-dvh bg-[#080304] text-white">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at top left, rgba(127, 29, 29, 0.22), transparent 34%), radial-gradient(circle at bottom right, rgba(69, 10, 10, 0.18), transparent 30%)",
        }}
      />

      <div className="relative mx-auto flex h-dvh max-w-[1500px] overflow-hidden border-x border-red-950/50 bg-[#0d0506]/95 shadow-2xl shadow-black/60">
        <aside
          className={`w-full flex-col border-r border-red-950/60 bg-[#110708]/95 md:w-[390px] md:shrink-0 ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <header className="border-b border-red-950/60 px-4 pb-4 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  href="/"
                  aria-label="Back home"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-900/40 bg-red-950/20 text-red-100 transition hover:border-red-700/60 hover:bg-red-900/30"
                >
                  <IoArrowBack />
                </Link>

                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-red-400/70">
                    Inbox
                  </p>
                  <h1 className="truncate text-xl font-semibold tracking-tight">
                    Messages
                  </h1>
                </div>
              </div>

              <div className="flex rounded-xl border border-red-950/70 bg-black/20 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setView("chats")}
                  className={`rounded-lg px-3 py-2 font-medium transition ${
                    view === "chats"
                      ? "bg-red-700 text-white shadow-lg shadow-red-950/40"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Chats
                  {totalUnreadCount > 0 && (
                    <span className="ml-1.5 grid min-w-5 place-items-center rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                      {formatUnreadCount(totalUnreadCount)}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setView("invites")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium transition ${
                    view === "invites"
                      ? "bg-red-700 text-white shadow-lg shadow-red-950/40"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Invites
                  {pendingInvitationCount > 0 && (
                    <span className="grid min-w-5 place-items-center rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                      {pendingInvitationCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {view === "chats" && (
              <div className="relative mt-5">
                <IoSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-red-300/40" />

                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search for someone..."
                  aria-label="Search users"
                  className="w-full rounded-xl border border-red-950/70 bg-black/25 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-red-700/70 focus:bg-black/35 focus:ring-4 focus:ring-red-950/30"
                />

                {searchQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-xl border border-red-900/40 bg-[#16090b] shadow-2xl shadow-black/70">
                    {isSearching ? (
                      <div className="flex items-center gap-3 p-4 text-sm text-white/45">
                        <LoadingSpinner />
                        Searching...
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((user) => {
                        const isStarting = sameId(
                          startingConversationId,
                          user._id,
                        );

                        return (
                          <button
                            key={user._id}
                            type="button"
                            disabled={Boolean(startingConversationId)}
                            onClick={() => startConversation(user._id)}
                            className="flex w-full items-center gap-3 border-b border-red-950/50 p-3 text-left transition last:border-b-0 hover:bg-red-900/20 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Avatar user={user} />

                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">
                                {user.username || "User"}
                              </p>
                              <p className="truncate text-xs text-white/35">
                                {isStarting
                                  ? "Opening conversation..."
                                  : "Start a conversation"}
                              </p>
                            </div>

                            {isStarting && <LoadingSpinner />}
                          </button>
                        );
                      })
                    ) : (
                      <p className="p-4 text-sm text-white/40">
                        No users found for “{searchQuery.trim()}”.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
            {view === "chats" ? (
              <>
                {isLoadingConversations ? (
                  <ConversationSkeletons />
                ) : conversations.length > 0 ? (
                  <div className="space-y-1">
                    {conversations.map((conversation) => {
                      const participant = conversation.participants?.find(
                        (item) => !sameId(item?._id, currentUserId),
                      );

                      const isSelected = sameId(selectedId, conversation._id);
                      const unreadCount = getConversationUnreadCount(
                        conversation,
                        currentUserId,
                      );
                      const hasUnread = unreadCount > 0 && !isSelected;

                      return (
                        <button
                          key={conversation._id}
                          type="button"
                          onClick={() => setSelectedId(conversation._id)}
                          aria-label={`${participant?.username || "Conversation"}${
                            hasUnread
                              ? `, ${unreadCount} unread ${
                                  unreadCount === 1 ? "message" : "messages"
                                }`
                              : ""
                          }`}
                          className={`group flex w-full gap-3 rounded-xl p-3 text-left transition ${
                            isSelected
                              ? "bg-linear-to-r from-red-800/45 to-red-950/20 ring-1 ring-inset ring-red-700/30"
                              : "hover:bg-white/4"
                          }`}
                        >
                          <Avatar user={participant} />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p
                                className={`truncate font-semibold ${
                                  isSelected || hasUnread
                                    ? "text-white"
                                    : "text-white/85"
                                }`}
                              >
                                {participant?.username || "Conversation"}
                                {conversation.blockState?.blocked && (
                                  <span className="ml-2 text-xs text-red-400">
                                    Blocked
                                  </span>
                                )}
                              </p>

                              <div className="flex shrink-0 items-center gap-2">
                                <time
                                  className={`text-[10px] ${
                                    hasUnread
                                      ? "font-semibold text-red-300"
                                      : "text-white/25"
                                  }`}
                                >
                                  {formatListTime(
                                    conversation.lastMessage?.createdAt ||
                                      conversation.updatedAt,
                                  )}
                                </time>
                                {hasUnread && (
                                  <span className="grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    {formatUnreadCount(unreadCount)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {conversation.event?.title && (
                              <p className="mt-0.5 truncate text-xs font-medium text-red-400">
                                {conversation.event.title}
                              </p>
                            )}

                            <p
                              className={`mt-1 truncate text-sm ${
                                hasUnread
                                  ? "font-medium text-white/80"
                                  : "text-white/35"
                              }`}
                            >
                              {conversation.lastMessage?.systemType ===
                              "user_blocked"
                                ? "Blocking status updated"
                                : conversation.lastMessage?.systemType ===
                                    "user_unblocked"
                                  ? "Messaging restored"
                                  : conversation.lastMessage?.text ||
                                (conversation.lastMessage?.sharedPost
                                  ? "Shared a post"
                                  : null) ||
                                (conversation.lastMessage?.sharedClip
                                  ? "Shared a clip"
                                  : null) ||
                                (conversation.lastMessage?.media?.length
                                  ? "Shared media"
                                  : null) ||
                                "Start the conversation"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <EmptySidebarState
                    title="No conversations yet"
                    description="Search for someone above to start your first conversation."
                  />
                )}
              </>
            ) : invitations.length > 0 ? (
              <div className="space-y-2">
                {invitations.map((invitation) => {
                  const isUpdating = sameId(invitationActionId, invitation._id);

                  return (
                    <article
                      key={invitation._id}
                      className="rounded-xl border border-red-950/60 bg-black/15 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar user={invitation.sender} />

                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white/90">
                            {invitation.sender?.username || "Someone"}
                          </p>

                          <p className="mt-1 text-sm text-white/40">
                            Invited you to join
                          </p>

                          <p className="mt-1 truncate text-sm font-medium text-red-400">
                            {invitation.event?.title || "Live event"}
                          </p>
                        </div>
                      </div>

                      {invitation.status === "pending" ? (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() =>
                              respondToInvitation(invitation._id, "accept")
                            }
                            className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-wait disabled:opacity-50"
                          >
                            {isUpdating ? <LoadingSpinner /> : <IoCheckmark />}
                            Accept
                          </button>

                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() =>
                              respondToInvitation(invitation._id, "decline")
                            }
                            className="flex items-center justify-center gap-2 rounded-lg border border-red-900/50 bg-red-950/15 px-3 py-2.5 text-sm font-medium text-white/65 transition hover:bg-red-950/40 hover:text-white disabled:cursor-wait disabled:opacity-50"
                          >
                            <IoClose />
                            Decline
                          </button>
                        </div>
                      ) : (
                        <p className="mt-4 inline-flex rounded-full border border-red-900/40 bg-red-950/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-300/60">
                          {invitation.status}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptySidebarState
                title="No invitations"
                description="Event invitations sent to you will appear here."
              />
            )}
          </div>
        </aside>

        <section
          className={`min-w-0 flex-1 flex-col bg-[#0a0405] ${
            selectedId ? "flex" : "hidden md:flex"
          }`}
        >
          {selectedId ? (
            <>
              <header className="flex h-[76px] shrink-0 items-center gap-3 border-b border-red-950/60 bg-[#100607]/90 px-4 backdrop-blur-xl sm:px-6">
                <button
                  type="button"
                  onClick={() => setSelectedId("")}
                  aria-label="Back to conversations"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-900/40 bg-red-950/20 text-red-100 transition hover:bg-red-900/30 md:hidden"
                >
                  <IoArrowBack />
                </button>

                <Avatar user={otherParticipant} />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white/90">
                    {otherParticipant?.username || "Conversation"}
                  </p>

                  {selectedConversation?.event?.title ? (
                    <p className="truncate text-xs font-medium text-red-400">
                      {selectedConversation.event.title}
                    </p>
                  ) : (
                    <p className="text-xs text-white/30">Direct conversation</p>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setChatMenuOpen((open) => !open)}
                    aria-label="Conversation safety options"
                    className="grid h-10 w-10 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white"
                  >
                    <IoEllipsisVertical />
                  </button>
                  {chatMenuOpen && (
                    <div className="absolute right-0 top-12 z-30 w-52 rounded-xl border border-white/10 bg-zinc-950 p-2 text-sm shadow-2xl">
                      <button
                        type="button"
                        onClick={() => void reportConversationUser()}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-amber-200 hover:bg-white/10"
                      >
                        <IoFlag /> Report user
                      </button>
                      {!blockState.blocked && (
                        <button
                          type="button"
                          onClick={() => void blockConversationUser()}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-red-300 hover:bg-white/10"
                        >
                          <IoBan /> Block user
                        </button>
                      )}
                      {viewerIsBlocker && (
                        <button
                          type="button"
                          onClick={() => void unblockConversationUser()}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-emerald-300 hover:bg-white/10"
                        >
                          <IoCheckmark /> Unblock user
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteConversation()}
                        className="mt-1 flex w-full items-center gap-2 border-t border-white/10 px-3 py-2.5 text-left text-red-300 hover:bg-white/10"
                      >
                        <IoTrash /> Delete chat
                      </button>
                    </div>
                  )}
                </div>
              </header>

              <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at top, rgba(127, 29, 29, 0.10), transparent 40%)",
                }}
              >
                {isLoadingMessages ? (
                  <div className="grid h-full place-items-center">
                    <div className="flex items-center gap-3 text-sm text-white/40">
                      <LoadingSpinner />
                      Loading messages...
                    </div>
                  </div>
                ) : messages.length > 0 ? (
                  <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                    {messages.map((message) => {
                      const senderId = message.sender?._id || message.sender;
                      const mine = sameId(senderId, currentUserId);

                      if (message.systemType) {
                        return (
                          <BlockSystemMessage
                            key={message._id}
                            message={message}
                            currentUserId={currentUserId}
                          />
                        );
                      }

                      return (
                        <div
                          key={message._id}
                          className={`flex items-end gap-2 ${
                            mine ? "justify-end" : "justify-start"
                          }`}
                        >
                          {!mine && (
                            <Avatar
                              user={
                                message.sender &&
                                typeof message.sender === "object"
                                  ? message.sender
                                  : otherParticipant
                              }
                              small
                            />
                          )}

                          <div
                            className={`max-w-[82%] sm:max-w-[70%] ${
                              mine ? "items-end" : "items-start"
                            } flex flex-col`}
                          >
                            {!blockState.blocked &&
                              openActionsId === String(message._id) && (
                              <div className="mb-2 flex max-w-sm flex-wrap gap-1 rounded-xl border border-white/10 bg-zinc-950 p-2 text-sm shadow-xl">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyTo(message);
                                    setOpenActionsId("");
                                  }}
                                  className="rounded-lg p-2 hover:bg-white/10"
                                  title="Reply"
                                >
                                  <IoArrowUndo />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void navigator.clipboard.writeText(
                                      message.text || "",
                                    )
                                  }
                                  className="rounded-lg p-2 hover:bg-white/10"
                                  title="Copy"
                                >
                                  <IoCopy />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateMessage(
                                      message._id,
                                      "like",
                                    ).catch((actionError) =>
                                      setError(actionError.message),
                                    )
                                  }
                                  className="rounded-lg p-2 hover:bg-white/10"
                                  title="Like"
                                >
                                  {(message.likedBy || []).some((id) =>
                                    sameId(id, currentUserId),
                                  ) ? (
                                    <IoHeart className="text-red-400" />
                                  ) : (
                                    <IoHeartOutline />
                                  )}
                                </button>
                                {QUICK_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() =>
                                      void updateMessage(
                                        message._id,
                                        "react",
                                        emoji,
                                      ).catch((actionError) =>
                                        setError(actionError.message),
                                      )
                                    }
                                    className="rounded-lg px-1.5 py-1 hover:bg-white/10"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => void forwardMessage(message)}
                                  className="rounded-lg p-2 hover:bg-white/10"
                                  title="Forward"
                                >
                                  <IoReturnUpForward />
                                </button>
                                {!mine && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateMessage(
                                          message._id,
                                          "warn",
                                        ).catch((actionError) =>
                                          setError(actionError.message),
                                        )
                                      }
                                      className="rounded-lg p-2 text-amber-400 hover:bg-white/10"
                                      title="Warn sender"
                                    >
                                      <IoWarning />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void reportMessageSender(message)
                                      }
                                      className="rounded-lg p-2 text-amber-300 hover:bg-white/10"
                                      title="Report message and sender"
                                    >
                                      <IoFlag />
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    void deleteMessage(message, "me").catch(
                                      (actionError) =>
                                        setError(actionError.message),
                                    )
                                  }
                                  className="rounded-lg p-2 text-red-300 hover:bg-white/10"
                                  title="Delete for me"
                                >
                                  <IoTrash />
                                </button>
                                {mine && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void deleteMessage(
                                        message,
                                        "everyone",
                                      ).catch((actionError) =>
                                        setError(actionError.message),
                                      )
                                    }
                                    className="rounded-lg px-2 py-1 text-xs text-red-300 hover:bg-white/10"
                                  >
                                    Unsend
                                  </button>
                                )}
                              </div>
                            )}
                            <div
                              onClick={() => {
                                if (blockState.blocked) return;
                                setOpenActionsId((current) =>
                                  current === String(message._id)
                                    ? ""
                                    : String(message._id),
                                );
                              }}
                              className={`wrap-break-word px-4 py-2.5 text-sm leading-relaxed shadow-lg ${
                                mine
                                  ? "rounded-2xl rounded-br-md bg-linear-to-br from-red-600 to-red-800 text-white shadow-red-950/30"
                                  : "rounded-2xl rounded-bl-md border border-red-950/60 bg-[#1a0c0e] text-white/85 shadow-black/20"
                              }`}
                            >
                              {message.deletedForEveryone ? (
                                <span className="italic text-white/50">
                                  Message was unsent
                                </span>
                              ) : (
                                <>
                                  {message.forwardedFrom && (
                                    <p className="mb-1 text-[10px] uppercase tracking-wider text-white/45">
                                      Forwarded
                                    </p>
                                  )}
                                  {message.replyTo && (
                                    <div className="mb-2 rounded-lg border-l-2 border-white/40 bg-black/20 px-2 py-1 text-xs text-white/60">
                                      {message.replyTo.text || "Media message"}
                                    </div>
                                  )}
                                  {message.sharedPost && (
                                    <Link
                                      href={`/?post=${message.sharedPost._id}`}
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      className="mb-2 block overflow-hidden rounded-xl border border-white/15 bg-black/30"
                                    >
                                      {(() => {
                                        const sharedMedia =
                                          message.sharedPost.mediaItems?.[0] ||
                                          (message.sharedPost.mediaUrl
                                            ? {
                                                url: message.sharedPost
                                                  .mediaUrl,
                                                type: message.sharedPost
                                                  .mediaType,
                                              }
                                            : null);
                                        if (!sharedMedia) return null;
                                        return sharedMedia.type === "video" ? (
                                          <video
                                            src={sharedMedia.url}
                                            muted
                                            playsInline
                                            className="max-h-64 w-full object-cover"
                                          />
                                        ) : (
                                          <Image
                                            src={sharedMedia.url}
                                            alt="Shared post"
                                            width={520}
                                            height={420}
                                            unoptimized
                                            className="max-h-64 w-full object-cover"
                                          />
                                        );
                                      })()}
                                      <div className="p-3">
                                        <p className="text-[10px] uppercase tracking-wider text-white/45">
                                          Shared post · @
                                          {message.sharedPost.user?.username ||
                                            "user"}
                                        </p>
                                        <p className="mt-1 line-clamp-2 text-xs text-white/80">
                                          {message.sharedPost.caption}
                                        </p>
                                      </div>
                                    </Link>
                                  )}
                                  {message.sharedClip && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSharedClipPreview(message.sharedClip);
                                        setSharedClipMuted(true);
                                      }}
                                      className="mb-2 block w-full overflow-hidden rounded-xl border border-red-500/20 bg-black/35 text-left transition hover:border-red-400/40"
                                    >
                                      <div className="relative aspect-9/12 max-h-72 w-full overflow-hidden bg-black">
                                        {(() => {
                                          const sharedMedia =
                                            message.sharedClip.mediaItems?.[0] ||
                                            (message.sharedClip.mediaUrl
                                              ? { url: message.sharedClip.mediaUrl, type: message.sharedClip.mediaType }
                                              : null);
                                          if (!sharedMedia) return <div className="grid h-full place-items-center text-3xl text-white/40">▶</div>;
                                          return sharedMedia.type === "video" ? (
                                            <video src={sharedMedia.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                          ) : (
                                            <Image src={sharedMedia.url} alt="Shared clip" fill unoptimized className="object-cover" />
                                          );
                                        })()}
                                        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-transparent to-transparent" />
                                        <span className="absolute left-3 top-3 rounded-full bg-red-600/90 px-3 py-1 text-[10px] font-black uppercase tracking-wider">Clip</span>
                                        <span className="absolute bottom-3 left-3 grid h-10 w-10 place-items-center rounded-full bg-white text-lg text-black shadow-lg">▶</span>
                                      </div>
                                      <div className="p-3">
                                        <p className="text-[10px] uppercase tracking-wider text-red-300/80">Shared clip · @{message.sharedClip.user?.username || "user"}</p>
                                        {message.sharedClip.caption && <p className="mt-1 line-clamp-2 text-xs text-white/80">{message.sharedClip.caption}</p>}
                                        <p className="mt-2 text-[10px] font-semibold text-white/40">Tap to watch</p>
                                      </div>
                                    </button>
                                  )}
                                  {(message.media || []).map(
                                    (media, mediaIndex) => (
                                      <button
                                        type="button"
                                        key={`${media.url}-${mediaIndex}`}
                                        onClick={(event) => { event.stopPropagation(); setMediaPreview(media); }}
                                        className="mb-2 block w-full overflow-hidden rounded-lg text-left"
                                      >
                                        {media.type === "image" ||
                                        media.type === "drawing" ? (
                                          <Image
                                            src={media.url}
                                            alt={
                                              media.type === "drawing"
                                                ? "Shared drawing"
                                                : "Shared photo"
                                            }
                                            width={640}
                                            height={480}
                                            unoptimized
                                            className="max-h-80 w-full object-contain"
                                          />
                                        ) : media.type === "video" ? (
                                          <video
                                            src={media.url}
                                            muted
                                            playsInline
                                            className="max-h-80 w-full"
                                          />
                                        ) : (
                                          <div className="flex items-center gap-2 bg-black/30 p-3 text-sm"><span className="grid h-9 w-9 place-items-center rounded-full bg-red-600">▶</span><span>Voice message · tap to listen</span></div>
                                        )}
                                      </button>
                                    ),
                                  )}
                                  {message.text && <span>{message.text}</span>}
                                </>
                              )}
                            </div>

                            <div className="mt-1.5 flex items-center gap-2 px-1 text-[10px] text-white/30">
                              <time>
                                {formatMessageTime(message.createdAt)}
                              </time>
                              {(message.likedBy || []).length > 0 && (
                                <span>♥ {message.likedBy.length}</span>
                              )}
                              {(message.reactions || []).map((reaction) => (
                                <span
                                  key={`${reaction.user}-${reaction.emoji}`}
                                >
                                  {reaction.emoji}
                                </span>
                              ))}
                              {mine && (
                                <span>
                                  {(message.readBy || []).some(
                                    (id) => !sameId(id, currentUserId),
                                  )
                                    ? "Seen"
                                    : "Sent"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div className="grid h-full place-items-center text-center">
                    <div className="max-w-sm">
                      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-red-900/40 bg-red-950/20 text-3xl text-red-400">
                        <IoChatbubbleOutline />
                      </div>

                      <h2 className="mt-5 text-lg font-semibold">
                        Start the conversation
                      </h2>

                      <p className="mt-2 text-sm leading-6 text-white/35">
                        Send a message to{" "}
                        {otherParticipant?.username || "this user"} and begin
                        chatting.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {blockState.blocked ? (
                <div className="shrink-0 border-t border-red-950/60 bg-[#100607]/95 p-4 backdrop-blur-xl">
                  <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-red-800/50 bg-red-950/20 px-4 py-3 sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 text-sm text-red-200">
                      {viewerIsBlocked
                        ? `You have been blocked by @${otherParticipant?.username || "this user"}. You cannot send messages or media.`
                        : `You blocked @${otherParticipant?.username || "this user"}. Messaging and profile access are disabled.`}
                    </p>
                    {viewerIsBlocked ? (
                      <button
                        type="button"
                        disabled={Boolean(blockState.request)}
                        onClick={() => void sendUnblockRequest()}
                        className="shrink-0 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-950 disabled:text-red-200/50"
                      >
                        {blockState.request
                          ? `Request sent · expires ${formatShortDate(blockState.request.expiresAt)}`
                          : "Send unblock request"}
                      </button>
                    ) : (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {blockState.request && (
                          <>
                            <button
                              type="button"
                              onClick={() => void acceptUnblockRequest()}
                              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                            >
                              Accept unblock request
                            </button>
                            <button
                              type="button"
                              onClick={() => void declineUnblockRequest()}
                              className="rounded-xl border border-red-700/60 bg-red-950/40 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-900/50"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void unblockConversationUser()}
                          className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 px-4 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/40"
                        >
                          Unblock directly
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={sendMessage}
                  className="shrink-0 border-t border-red-950/60 bg-[#100607]/95 p-3 backdrop-blur-xl sm:p-4"
                >
                {replyTo && (
                  <div className="mx-auto mb-2 flex max-w-4xl items-center gap-3 rounded-xl border-l-2 border-red-500 bg-white/5 px-3 py-2 text-xs text-white/60">
                    <IoArrowUndo />
                    <span className="min-w-0 flex-1 truncate">
                      Replying to {replyTo.text || "a media message"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      aria-label="Cancel reply"
                    >
                      <IoClose />
                    </button>
                  </div>
                )}
                {pendingMedia.length > 0 && (
                  <div className="mx-auto mb-2 flex max-w-4xl gap-2 overflow-x-auto">
                    {pendingMedia.map((media, index) => (
                      <div
                        key={`${media.url}-${index}`}
                        className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs"
                      >
                        <span>{media.type}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingMedia((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          aria-label="Remove attachment"
                        >
                          <IoClose />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-2xl border border-red-950/70 bg-black/25 p-2 transition focus-within:border-red-700/60 focus-within:ring-4 focus-within:ring-red-950/30">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadMedia(file);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    disabled={isUploading}
                    className="grid h-11 w-9 place-items-center text-white/50 hover:text-white"
                    title="Attach media"
                  >
                    <IoAttach />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageText((current) => `${current}😊`)}
                    className="grid h-11 w-9 place-items-center text-white/50 hover:text-white"
                    title="Add emoji"
                  >
                    <IoHappy />
                  </button>
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`grid h-11 w-9 place-items-center ${isRecording ? "animate-pulse text-red-400" : "text-white/50 hover:text-white"}`}
                    title={
                      isRecording ? "Stop recording" : "Record voice message"
                    }
                  >
                    {isRecording ? <IoMicOff /> : <IoMic />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDrawing(true)}
                    className="grid h-11 w-9 place-items-center text-white/50 hover:text-white"
                    title="Create a drawing"
                  >
                    <IoBrush />
                  </button>
                  <textarea
                    rows={1}
                    maxLength={2000}
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Write a message..."
                    aria-label="Message"
                    className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-5 text-white outline-none placeholder:text-white/25"
                  />

                  <button
                    type="submit"
                    disabled={
                      (!messageText.trim() && pendingMedia.length === 0) ||
                      isSending ||
                      isUploading
                    }
                    aria-label="Send message"
                    title="Send message"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-600 text-lg text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-950 disabled:text-white/25 disabled:shadow-none"
                  >
                    {isSending || isUploading ? <LoadingSpinner /> : <IoSend />}
                  </button>
                </div>

                <p className="mx-auto mt-2 max-w-4xl px-2 text-[10px] text-white/20">
                  Press Enter to send. Use Shift + Enter for a new line.
                </p>
                </form>
              )}
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-red-900/40 bg-red-950/20 text-4xl text-red-400 shadow-xl shadow-red-950/20">
                  <IoChatbubbleOutline />
                </div>

                <h2 className="mt-6 text-xl font-semibold">
                  Your conversations
                </h2>

                <p className="mt-2 text-sm leading-6 text-white/35">
                  Select an existing conversation or search for someone to start
                  messaging.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-red-700/50 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <span className="min-w-0 flex-1">{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-red-200/60 transition hover:bg-white/10 hover:text-white"
          >
            <IoClose />
          </button>
        </div>
      )}
      {showDrawing && (
        <DrawingPad
          onCancel={() => setShowDrawing(false)}
          onSend={(file) => void uploadMedia(file, "drawing")}
        />
      )}
      {sharedClipPreview && (
        <div className="fixed inset-0 z-110 grid place-items-center bg-black/90 p-3 backdrop-blur-lg" onMouseDown={() => setSharedClipPreview(null)}>
          <section role="dialog" aria-modal="true" aria-label="Shared clip preview" onMouseDown={(event) => event.stopPropagation()} className="relative h-[min(88dvh,820px)] w-full max-w-[470px] overflow-hidden rounded-[28px] border border-red-500/20 bg-black shadow-[0_35px_120px_rgba(127,29,29,.45)]">
            <ClipReelPlayer clip={sharedClipPreview} isActive muted={sharedClipMuted} onMutedChange={setSharedClipMuted} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40 bg-linear-to-t from-black/90 to-transparent" />
            <div className="absolute bottom-5 left-4 right-4 z-30">
              <p className="font-black">@{sharedClipPreview.user?.username || "user"}</p>
              {sharedClipPreview.caption && <p className="mt-1 line-clamp-2 text-sm text-white/75">{sharedClipPreview.caption}</p>}
              <Link href={`/clips?clip=${encodeURIComponent(sharedClipPreview._id)}`} className="mt-3 inline-flex rounded-full bg-red-600 px-4 py-2 text-xs font-bold hover:bg-red-500">Open in Clips</Link>
            </div>
            <button type="button" onClick={() => setSharedClipPreview(null)} aria-label="Close clip preview" className="absolute left-4 top-4 z-50 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/55 text-xl backdrop-blur">×</button>
          </section>
        </div>
      )}
      {mediaPreview && (
        <div className="fixed inset-0 z-110 grid place-items-center bg-black/90 p-3 backdrop-blur-lg" onMouseDown={() => setMediaPreview(null)}>
          <section role="dialog" aria-modal="true" aria-label="Message media preview" onMouseDown={(event) => event.stopPropagation()} className="relative flex max-h-[90dvh] w-full max-w-4xl items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-black p-3 shadow-2xl">
            {mediaPreview.type === "video" ? <video src={mediaPreview.url} controls autoPlay playsInline className="max-h-[82dvh] max-w-full rounded-2xl" /> : mediaPreview.type === "audio" ? <div className="w-full max-w-md rounded-3xl bg-[#130608] p-7 text-center"><div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-red-600 text-2xl">♫</div><p className="font-black">Voice message</p><audio src={mediaPreview.url} controls autoPlay className="mt-5 w-full" /></div> : <Image src={mediaPreview.url} alt="Message media" width={1200} height={900} unoptimized className="max-h-[82dvh] w-auto max-w-full rounded-2xl object-contain" />}
            <button type="button" onClick={() => setMediaPreview(null)} aria-label="Close media preview" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-xl">×</button>
          </section>
        </div>
      )}
    </main>
  );
}

function BlockSystemMessage({ message, currentUserId }) {
  const data = message.systemData || {};
  const isBlockedUser = sameId(data.blockedUserId, currentUserId);
  const isBlockEvent = message.systemType === "user_blocked";
  const text = isBlockEvent
    ? isBlockedUser
      ? `You have been blocked by @${data.blockerUsername || "this user"}`
      : `You blocked @${data.blockedUsername || "this user"}`
    : isBlockedUser
      ? `@${data.blockerUsername || "This user"} unblocked you. You can message each other again.`
      : `You unblocked @${data.blockedUsername || "this user"}. Messaging is available again.`;

  return (
    <div className="flex justify-center" role="status">
      <div
        className={`max-w-xl rounded-xl border px-4 py-2.5 text-center text-sm font-semibold ${
          isBlockEvent
            ? "border-red-700/50 bg-red-950/35 text-red-300"
            : "border-emerald-700/50 bg-emerald-950/30 text-emerald-300"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function Avatar({ user, small = false }) {
  const sizeClass = small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  const username = user?.username || "User";
  const initial = username.charAt(0).toUpperCase();

  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-red-800/40 bg-linear-to-br from-red-800/60 to-red-950/60 font-semibold text-red-100 ${sizeClass}`}
    >
      {user?.profilePic ? (
        <Image
          src={user.profilePic}
          alt={`${username}'s avatar`}
          fill
          sizes={small ? "32px" : "40px"}
          unoptimized
          className="object-cover"
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

function ConversationSkeletons() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse items-center gap-3 rounded-xl p-3"
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-red-950/50" />

          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-2/5 rounded bg-red-950/50" />
            <div className="mt-2 h-3 w-4/5 rounded bg-red-950/30" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptySidebarState({ title, description }) {
  return (
    <div className="grid min-h-64 place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-red-900/30 bg-red-950/20 text-xl text-red-400/70">
          <IoChatbubbleOutline />
        </div>

        <p className="mt-4 font-semibold text-white/75">{title}</p>

        <p className="mt-2 text-sm leading-6 text-white/30">{description}</p>
      </div>
    </div>
  );
}

async function parseResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function sameId(firstId, secondId) {
  if (firstId == null || secondId == null) return false;
  return String(firstId) === String(secondId);
}

function dedupeMessages(items) {
  if (!Array.isArray(items)) return [];

  const uniqueMessages = [];
  const indexById = new Map();

  for (const message of items) {
    const messageId = message?._id;

    // Do not collapse messages without an ID because two identical texts can be
    // legitimate separate messages.
    if (messageId == null) {
      uniqueMessages.push(message);
      continue;
    }

    const key = String(messageId);
    const existingIndex = indexById.get(key);

    if (existingIndex == null) {
      indexById.set(key, uniqueMessages.length);
      uniqueMessages.push(message);
      continue;
    }

    // Keep the newest/populated version without changing its list position.
    uniqueMessages[existingIndex] = {
      ...uniqueMessages[existingIndex],
      ...message,
    };
  }

  return uniqueMessages;
}

function dedupeConversations(items) {
  if (!Array.isArray(items)) return [];

  const conversationByKey = new Map();

  for (const conversation of items) {
    if (!conversation) continue;

    const key = getConversationDedupeKey(conversation);
    const existing = conversationByKey.get(key);

    if (!existing) {
      conversationByKey.set(key, conversation);
      continue;
    }

    const existingTime = getConversationTimestamp(existing);
    const candidateTime = getConversationTimestamp(conversation);

    // A participant pair should appear once. Preserve the record with the most
    // recent activity so its latest message and conversation ID are used.
    if (candidateTime >= existingTime) {
      conversationByKey.set(key, conversation);
    }
  }

  return [...conversationByKey.values()].sort(
    (first, second) =>
      getConversationTimestamp(second) - getConversationTimestamp(first),
  );
}

function getConversationDedupeKey(conversation) {
  const participantIds = (conversation?.participants || [])
    .map((participant) => participant?._id || participant)
    .filter((participantId) => participantId != null)
    .map(String)
    .sort();

  const eventId = conversation?.event?._id || conversation?.event || "direct";

  if (participantIds.length > 0) {
    return `${String(eventId)}:${participantIds.join("|")}`;
  }

  return `conversation:${String(conversation?._id || "unknown")}`;
}

function getConversationTimestamp(conversation) {
  const value =
    conversation?.lastMessage?.createdAt ||
    conversation?.updatedAt ||
    conversation?.createdAt;
  const timestamp = value ? new Date(value).getTime() : 0;

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isDirectConversationWith(conversation, currentUserId, recipientId) {
  if (!conversation || conversation.event || !currentUserId || !recipientId) {
    return false;
  }

  const participantIds = (conversation.participants || [])
    .map((participant) => participant?._id || participant)
    .filter((participantId) => participantId != null);

  return (
    participantIds.some((participantId) =>
      sameId(participantId, currentUserId),
    ) &&
    participantIds.some((participantId) => sameId(participantId, recipientId))
  );
}

function addReader(readBy, readerId) {
  if (readerId == null) return Array.isArray(readBy) ? readBy : [];

  return [
    ...new Set([
      ...(Array.isArray(readBy) ? readBy : []).map(String),
      String(readerId),
    ]),
  ];
}

function getConversationUnreadCount(conversation, currentUserId) {
  if (!conversation || !currentUserId) return 0;

  const directCount = Number(conversation.unreadCount);

  if (Number.isFinite(directCount) && directCount >= 0) {
    return Math.floor(directCount);
  }

  const unreadCounts = conversation.unreadCounts;
  const userKey = String(currentUserId);
  const perUserCount =
    unreadCounts instanceof Map
      ? unreadCounts.get(userKey)
      : unreadCounts?.[userKey];
  const normalizedPerUserCount = Number(perUserCount);

  if (Number.isFinite(normalizedPerUserCount) && normalizedPerUserCount >= 0) {
    return Math.floor(normalizedPerUserCount);
  }

  // Fallback for APIs that only return the latest message. This can show 0 or 1;
  // return unreadCount from /api/conversations for an exact badge count.
  const lastMessage = conversation.lastMessage;
  const senderId = lastMessage?.sender?._id || lastMessage?.sender;

  if (!lastMessage || sameId(senderId, currentUserId)) return 0;

  const hasBeenSeen = (lastMessage.readBy || []).some((readerId) =>
    sameId(readerId, currentUserId),
  );

  return hasBeenSeen ? 0 : 1;
}

function formatUnreadCount(count) {
  return count > 99 ? "99+" : String(count);
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "in 3 days";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMessageTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatListTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isToday) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}
