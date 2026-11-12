
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  IoArrowBack,
  IoClose,
  IoEarth,
  IoFlash,
  IoSearch,
} from "react-icons/io5";

import PowerDashboard from "./PowerDashboard";
import StoryMarker from "./StoryMarker";
import StoryModal from "./StoryModal";

// ======================================================
// CONFIGURATION
// ======================================================

const DEFAULT_CENTER = {
  lat: 18,
  lng: 15,
};

const DEFAULT_RANGE = 24000000;

const STORY_GROUP_RADIUS_METERS = 700;

const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const GOOGLE_MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

const STORIES_API = "/api/story-globe";
const DASHBOARD_API = "/api/user/me";

const STORY_LIMIT = 80;

const STORY_TABS = [
  ["all", "All"],
  ["trending", "Trending"],
  ["close", "Close Ones"],
  ["supporting", "Supporting"],
];

// ======================================================
// GOOGLE MAPS LOADER
// ======================================================

let googleMapsLoaderPromise = null;

function loadGoogleMaps(apiKey) {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Google Maps can only load in a browser.")
    );
  }

  if (!apiKey) {
    return Promise.reject(
      new Error("Google Maps API key is missing.")
    );
  }

  if (window.google?.maps?.importLibrary) {
    return Promise.resolve(window.google);
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const callbackName = "__zenigramGoogleMapsReady";

    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
    };

    const succeed = () => {
      if (settled) return;

      const google = window.google;

      if (!google?.maps?.importLibrary) {
        fail(
          new Error("Google Maps loaded without the Maps API.")
        );
        return;
      }

      settled = true;
      cleanup();
      resolve(google);
    };

    const fail = (error) => {
      if (settled) return;

      settled = true;
      cleanup();

      googleMapsLoaderPromise = null;

      reject(error);
    };

    window[callbackName] = succeed;

    const existingScript = document.getElementById(
      "zenigram-google-maps-script"
    );

    if (existingScript) {
      if (window.google?.maps?.importLibrary) {
        succeed();
        return;
      }

      existingScript.addEventListener(
        "load",
        succeed,
        { once: true }
      );

      existingScript.addEventListener(
        "error",
        () => {
          fail(
            new Error("Google Maps failed to load.")
          );
        },
        { once: true }
      );

      return;
    }

    const script = document.createElement("script");

    script.id = "zenigram-google-maps-script";

    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      libraries: "maps3d,marker,geocoding",
      callback: callbackName,
    });

    script.src =
      "https://maps.googleapis.com/maps/api/js?" +
      params.toString();

    script.async = true;
    script.defer = true;

    script.onerror = () => {
      fail(
        new Error("Unable to load Google Maps.")
      );

      script.remove();
    };

    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

// ======================================================
// STORY VALIDATION
// ======================================================

function isValidStory(story) {
  const lat = Number(story?.latitude);
  const lng = Number(story?.longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// ======================================================
// GEOGRAPHIC DISTANCE
// ======================================================

function distance(a, b) {
  const EARTH_RADIUS = 6371000;

  const toRadians = (value) =>
    (value * Math.PI) / 180;

  const lat1 = toRadians(Number(a.latitude));
  const lat2 = toRadians(Number(b.latitude));

  const dLat = lat2 - lat1;

  const dLng = toRadians(
    Number(b.longitude) - Number(a.longitude)
  );

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  const safeH = Math.min(1, Math.max(0, h));

  return (
    2 *
    EARTH_RADIUS *
    Math.atan2(
      Math.sqrt(safeH),
      Math.sqrt(1 - safeH)
    )
  );
}

// ======================================================
// STORY GROUPING
// ======================================================

function calculateGroupCenter(stories) {
  if (!stories.length) {
    return {
      latitude: 0,
      longitude: 0,
    };
  }

  let latitudeSum = 0;
  let longitudeSinSum = 0;
  let longitudeCosSum = 0;

  for (const story of stories) {
    const lat = Number(story.latitude);
    const lng = Number(story.longitude);

    latitudeSum += lat;

    const radians = (lng * Math.PI) / 180;

    longitudeSinSum += Math.sin(radians);
    longitudeCosSum += Math.cos(radians);
  }

  const longitude =
    Math.atan2(
      longitudeSinSum,
      longitudeCosSum
    ) *
    (180 / Math.PI);

  return {
    latitude: latitudeSum / stories.length,
    longitude,
  };
}

function groupStories(stories) {
  const groups = [];

  const validStories = stories.filter(isValidStory);

  for (const story of validStories) {
    let existingGroup = groups.find((group) => {
      return (
        distance(group.center, story) <=
        STORY_GROUP_RADIUS_METERS
      );
    });

    if (!existingGroup) {
      const center = {
        latitude: Number(story.latitude),
        longitude: Number(story.longitude),
      };

      groups.push({
        center,
        latitude: center.latitude,
        longitude: center.longitude,
        stories: [story],
      });

      continue;
    }

    existingGroup.stories.push(story);

    const newCenter = calculateGroupCenter(
      existingGroup.stories
    );

    existingGroup.center = newCenter;

    existingGroup.latitude =
      newCenter.latitude;

    existingGroup.longitude =
      newCenter.longitude;
  }

  return groups.map((group, index) => {
    const storyIds = group.stories
      .map((story) => story?._id)
      .filter(Boolean)
      .map(String)
      .sort();

    return {
      ...group,

      id:
        storyIds.length > 0
          ? storyIds.join("-")
          : `group-${index}`,
    };
  });
}

// ======================================================
// DASHBOARD DIALOG
// ======================================================

function DashboardDialog({
  open,
  onClose,
  data,
  loading,
  error,
  triggerRef,
}) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow =
      document.body.style.overflow;

    const triggerElement = triggerRef.current;

    document.body.style.overflow = "hidden";

    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements =
        dialogRef.current?.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

      if (!focusableElements?.length) return;

      const first = focusableElements[0];

      const last =
        focusableElements[
          focusableElements.length - 1
        ];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      triggerElement?.focus();
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-3 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="power-dashboard-title"
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border border-cyan-300/30 bg-[#040b12]"
      >
        <header className="flex items-center justify-between border-b border-cyan-200/15 bg-[#07131e] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/55">
              World progression
            </p>

            <h2
              id="power-dashboard-title"
              className="mt-1 flex items-center gap-2 text-lg font-semibold uppercase text-cyan-100"
            >
              <IoFlash />
              Power Dashboard
            </h2>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close Power Dashboard"
            className="grid h-10 w-10 place-items-center border border-white/15 text-xl text-white/70 transition hover:bg-white/10"
          >
            <IoClose />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <PowerDashboard
            data={data}
            loading={loading}
            error={error}
          />
        </div>
      </section>
    </div>
  );
}

// ======================================================
// MAIN STORY GLOBE
// ======================================================

export default function StoryGlobe() {
  const router = useRouter();

  // ----------------------------------------------------
  // REFERENCES
  // ----------------------------------------------------

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const triggerRef = useRef(null);

  const storiesRequestRef = useRef(null);
  const dashboardRequestRef = useRef(null);

  // ----------------------------------------------------
  // MAP STATE
  // ----------------------------------------------------

  const [mapsReady, setMapsReady] = useState(false);

  const [maps3dLibrary, setMaps3dLibrary] =
    useState(null);

  const [mapError, setMapError] = useState("");

  // ----------------------------------------------------
  // STORIES STATE
  // ----------------------------------------------------

  const [tab, setTab] = useState("all");

  const [stories, setStories] = useState([]);

  const [nextCursor, setNextCursor] =
    useState(null);

  const [loading, setLoading] = useState(true);

  const [loadingMore, setLoadingMore] =
    useState(false);

  const [error, setError] = useState("");

  const [selectedGroupId, setSelectedGroupId] =
    useState(null);

  // ----------------------------------------------------
  // SEARCH STATE
  // ----------------------------------------------------

  const [searchQuery, setSearchQuery] =
    useState("");

  const [searching, setSearching] =
    useState(false);

  const [searchError, setSearchError] =
    useState("");

  // ----------------------------------------------------
  // DASHBOARD STATE
  // ----------------------------------------------------

  const [dashboardOpen, setDashboardOpen] =
    useState(false);

  const [dashboardData, setDashboardData] =
    useState(null);

  const [dashboardLoading, setDashboardLoading] =
    useState(false);

  const [dashboardError, setDashboardError] =
    useState("");

  // ====================================================
  // LOAD STORIES
  // ====================================================

  const loadStories = useCallback(
    async (reset = false, cursor = "") => {
      if (!reset && !cursor) return;

      // Prevent simultaneous pagination requests.
      if (
        !reset &&
        storiesRequestRef.current
      ) {
        return;
      }

      // Cancel previous request.
      storiesRequestRef.current?.abort();

      const controller = new AbortController();

      storiesRequestRef.current = controller;

      try {
        if (reset) {
          setLoading(true);
          setStories([]);
          setNextCursor(null);
        } else {
          setLoadingMore(true);
        }

        setError("");

        const params = new URLSearchParams({
          tab,
          limit: String(STORY_LIMIT),
        });

        if (cursor) {
          params.set("cursor", cursor);
        }

        const response = await fetch(
          `${STORIES_API}?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Unable to load stories."
          );
        }

        if (controller.signal.aborted) return;

        const incomingStories = Array.isArray(
          data?.stories
        )
          ? data.stories
          : [];

        setStories((current) => {
          if (reset) {
            return incomingStories;
          }

          // Prevent duplicated records across pages.
          const existingIds = new Set(
            current.map((story) =>
              String(story?._id)
            )
          );

          const uniqueIncoming =
            incomingStories.filter((story) => {
              const id = String(story?._id);

              if (existingIds.has(id)) {
                return false;
              }

              existingIds.add(id);

              return true;
            });

          return [
            ...current,
            ...uniqueIncoming,
          ];
        });

        setNextCursor(
          data?.nextCursor || null
        );
      } catch (loadError) {
        if (
          loadError?.name !== "AbortError" &&
          !controller.signal.aborted
        ) {
          setError(
            loadError?.message ||
              "Stories could not be loaded right now."
          );
        }
      } finally {
        if (
          storiesRequestRef.current === controller
        ) {
          storiesRequestRef.current = null;

          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [tab]
  );

  // ====================================================
  // INITIAL STORIES / TAB CHANGES
  // ====================================================

  useEffect(() => {
    setSelectedGroupId(null);

    void loadStories(true);

    return () => {
      storiesRequestRef.current?.abort();
      storiesRequestRef.current = null;
    };
  }, [loadStories]);

  // ====================================================
  // LOAD POWER DASHBOARD
  // ====================================================

  useEffect(() => {
    if (!dashboardOpen || dashboardData) {
      return undefined;
    }

    const controller = new AbortController();

    dashboardRequestRef.current = controller;

    const loadDashboard = async () => {
      try {
        setDashboardLoading(true);
        setDashboardError("");

        const response = await fetch(
          DASHBOARD_API,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Unable to load Power Dashboard."
          );
        }

        if (controller.signal.aborted) return;

        setDashboardData(data);
      } catch (dashboardLoadError) {
        if (
          dashboardLoadError?.name !==
            "AbortError" &&
          !controller.signal.aborted
        ) {
          setDashboardError(
            dashboardLoadError?.message ||
              "Unable to load Power Dashboard."
          );
        }
      } finally {
        if (
          dashboardRequestRef.current === controller
        ) {
          dashboardRequestRef.current = null;

          setDashboardLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      controller.abort();

      if (
        dashboardRequestRef.current === controller
      ) {
        dashboardRequestRef.current = null;
      }
    };
  }, [dashboardOpen, dashboardData]);

  // ====================================================
  // GOOGLE MAPS INITIALIZATION
  // ====================================================

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setMapError(
        "Google Maps API key is missing."
      );

      return undefined;
    }

    let cancelled = false;

    let createdMap = null;

    const initializeMap = async () => {
      try {
        const google = await loadGoogleMaps(
          GOOGLE_MAPS_API_KEY
        );

        if (cancelled) return;

        const [maps3d] = await Promise.all([
          google.maps.importLibrary("maps3d"),
          google.maps.importLibrary("geocoding"),
        ]);

        if (
          cancelled ||
          !mapContainerRef.current
        ) {
          return;
        }

        const Map3DElement =
          maps3d?.Map3DElement;

        const GestureHandling =
          maps3d?.GestureHandling;

        if (
          !Map3DElement ||
          !GestureHandling
        ) {
          throw new Error(
            "Google 3D Maps is unavailable. Check your API configuration."
          );
        }

        const map = new Map3DElement({
          center: {
            ...DEFAULT_CENTER,
            altitude: 0,
          },

          range: DEFAULT_RANGE,

          tilt: 0,

          heading: -8,

          mode:
            maps3d.MapMode?.HYBRID ||
            "HYBRID",

          mapId: GOOGLE_MAP_ID,

          gestureHandling:
            GestureHandling.GREEDY,

          defaultUIHidden: false,

          minTilt: 0,

          maxTilt: 80,

          minAltitude: 0,

          maxAltitude: 63170000,

          fov: 55,

          language: "en",
        });

        map.setAttribute(
          "aria-label",
          "Zenigram Stories Globe"
        );

        Object.assign(map.style, {
          width: "100%",
          height: "100%",
          display: "block",
          background: "#03070d",
        });

        if (cancelled) {
          map.remove();
          return;
        }

        mapContainerRef.current.appendChild(map);

        createdMap = map;
        mapRef.current = map;

        setMaps3dLibrary(maps3d);

        setMapsReady(true);

        setMapError("");
      } catch (loadError) {
        if (!cancelled) {
          setMapError(
            loadError?.message ||
              "Unable to initialize Google Maps."
          );

          setMapsReady(false);
        }
      }
    };

    void initializeMap();

    return () => {
      cancelled = true;

      if (createdMap) {
        createdMap.remove();
      }

      if (mapRef.current === createdMap) {
        mapRef.current = null;
      }

      if (mapContainerRef.current) {
        mapContainerRef.current.replaceChildren();
      }

      setMapsReady(false);
      setMaps3dLibrary(null);
    };
  }, []);

  // ====================================================
  // MAP RESIZE
  // ====================================================

  useEffect(() => {
    if (!mapRef.current || !mapsReady) {
      return undefined;
    }

    const map = mapRef.current;

    const resize = () => {
      if (!map.isConnected) return;

      map.style.width = "100%";
      map.style.height = "100%";
    };

    const timer = window.setTimeout(
      resize,
      100
    );

    window.addEventListener(
      "resize",
      resize
    );

    return () => {
      window.clearTimeout(timer);

      window.removeEventListener(
        "resize",
        resize
      );
    };
  }, [mapsReady]);

  // ====================================================
  // GROUP STORIES
  // ====================================================

  const groups = useMemo(
    () => groupStories(stories),
    [stories]
  );

  // ====================================================
  // SELECTED STORY GROUP
  // ====================================================

  const selectedGroup = useMemo(() => {
    const existingGroup = groups.find(
      (group) => group.id === selectedGroupId
    );

    if (existingGroup) {
      return existingGroup;
    }

    if (selectedGroupId === "all-stories") {
      return {
        id: "all-stories",

        stories: [...stories].sort(
          (a, b) =>
            new Date(b?.createdAt || 0) -
            new Date(a?.createdAt || 0)
        ),
      };
    }

    return null;
  }, [
    groups,
    selectedGroupId,
    stories,
  ]);

  // ====================================================
  // SEARCH LOCATION
  // ====================================================

  const searchPlace = useCallback(async () => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchError(
        "Enter a city or location."
      );

      return;
    }

    const map = mapRef.current;

    if (
      !map ||
      !mapsReady ||
      !window.google?.maps?.importLibrary
    ) {
      setSearchError(
        "Google Maps is still loading."
      );

      return;
    }

    try {
      setSearching(true);
      setSearchError("");

      const { Geocoder } =
        await window.google.maps.importLibrary(
          "geocoding"
        );

      if (!Geocoder) {
        throw new Error(
          "Location search is unavailable."
        );
      }

      const geocoder = new Geocoder();

      const response = await geocoder.geocode({
        address: query,
      });

      const result = response?.results?.[0];

      const location =
        result?.geometry?.location;

      if (!location) {
        throw new Error(
          "No matching location was found."
        );
      }

      const target = {
        lat: location.lat(),
        lng: location.lng(),
      };

      const types = result.types || [];

      let range = 120000;

      if (types.includes("country")) {
        range = 2400000;
      } else if (
        types.includes(
          "administrative_area_level_1"
        )
      ) {
        range = 650000;
      } else if (
        types.includes("locality") ||
        types.includes(
          "administrative_area_level_2"
        )
      ) {
        range = 90000;
      } else if (
        types.includes("street_address") ||
        types.includes("premise")
      ) {
        range = 12000;
      }

      if (mapRef.current !== map) return;

      map.flyCameraTo({
        endCamera: {
          center: {
            lat: target.lat,
            lng: target.lng,
            altitude: 0,
          },

          range,

          tilt: types.includes("locality")
            ? 55
            : 35,

          heading: -8,
        },

        durationMillis: 1400,
      });
    } catch (searchLoadError) {
      setSearchError(
        searchLoadError?.message ||
          "Location search failed."
      );
    } finally {
      setSearching(false);
    }
  }, [searchQuery, mapsReady]);

  // ====================================================
  // GROUP CLICK
  // ====================================================

  const handleGroupClick = useCallback(
    (group) => {
      if (group?.id) {
        setSelectedGroupId(group.id);
      }
    },
    []
  );

  // ====================================================
  // UPDATE STORY
  // ====================================================

  const updateStory = useCallback(
    (storyId, updates) => {
      setStories((current) =>
        current.map((story) =>
          String(story?._id) === String(storyId)
            ? {
                ...story,
                ...updates,
              }
            : story
        )
      );
    },
    []
  );

  // ====================================================
  // RESET GLOBE
  // ====================================================

  const resetWorld = useCallback(() => {
    const map = mapRef.current;

    if (!map) return;

    map.flyCameraTo({
      endCamera: {
        center: {
          lat: DEFAULT_CENTER.lat,
          lng: DEFAULT_CENTER.lng,
          altitude: 0,
        },

        range: DEFAULT_RANGE,

        tilt: 0,

        heading: -8,
      },

      durationMillis: 900,
    });
  }, []);

  // ====================================================
  // RETRY DASHBOARD
  // ====================================================

  const retryDashboard = useCallback(() => {
    setDashboardData(null);
    setDashboardError("");
    setDashboardOpen(false);

    // Reopen after the current state update.
    requestAnimationFrame(() => {
      setDashboardOpen(true);
    });
  }, []);

  // ====================================================
  // MAP ERROR SCREEN
  // ====================================================

  if (!GOOGLE_MAPS_API_KEY || mapError) {
    return (
      <main className="grid h-screen w-screen place-items-center bg-black p-6 text-center text-white">
        <div className="max-w-lg">
          <IoEarth className="mx-auto text-4xl text-cyan-300" />

          <h1 className="mt-4 text-xl font-semibold">
            Stories Globe could not load
          </h1>

          <p className="mt-2 text-sm text-white/55">
            {mapError ||
              "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing."}
          </p>

          <p className="mt-3 text-xs text-white/35">
            Enable the Google Maps JavaScript API
            and the required 3D Maps functionality
            for your Google Cloud project.
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 border border-cyan-300/40 bg-cyan-300/10 px-5 py-2 text-sm text-cyan-200 transition hover:bg-cyan-300/20"
          >
            Retry loading
          </button>
        </div>
      </main>
    );
  }

  // ====================================================
  // MAIN UI
  // ====================================================

  return (
    <main className="story-globe relative h-[100dvh] w-screen overflow-hidden bg-[#03070d] text-white">

      {/* ============================================== */}
      {/* GOOGLE 3D MAP */}
      {/* ============================================== */}

      <div
        ref={mapContainerRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Zenigram Stories Globe"
      />

      {/* ============================================== */}
      {/* MAP OVERLAY */}
      {/* ============================================== */}

      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,8,16,.08)_70%,rgba(0,4,10,.42)_100%)]" />

      {/* ============================================== */}
      {/* HEADER */}
      {/* ============================================== */}

      <header className="pointer-events-none absolute left-1/2 top-4 z-20 w-[min(96vw,900px)] -translate-x-1/2 text-center md:top-7">

        <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/65">
          Live for 24 hours
        </p>

        <h1 className="mt-1 text-xl font-semibold uppercase text-cyan-100 drop-shadow-[0_0_18px_rgba(103,232,249,.55)] sm:text-2xl md:text-4xl">
          The Global Storyscape
        </h1>

        {/* STORY TABS */}

        <div className="pointer-events-auto mx-auto mt-4 flex w-fit max-w-full overflow-x-auto border border-cyan-300/35 bg-black/50 text-[10px] font-semibold uppercase tracking-[0.1em] backdrop-blur">

          {STORY_TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`whitespace-nowrap px-3 py-2.5 transition sm:px-4 ${
                tab === id
                  ? "bg-cyan-300/20 text-cyan-100"
                  : "text-white/55 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}

        </div>

        {/* STORY COUNTER */}

        <div
          className="mx-auto mt-2 w-fit border border-white/10 bg-black/45 px-3 py-1.5 text-xs text-white/65"
          aria-live="polite"
        >
          {stories.length} loaded
          {" · "}
          {nextCursor
            ? "more available"
            : "end of feed"}
        </div>

      </header>

      {/* ============================================== */}
      {/* LEFT SIDEBAR */}
      {/* ============================================== */}

      <aside className="absolute left-3 top-40 z-20 w-[min(72vw,210px)] border border-cyan-200/20 bg-[#06101a]/80 p-3 backdrop-blur-md md:left-7 md:top-1/2 md:-translate-y-1/2">

        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/60">
          Explore the world
        </p>

        {/* LOCATION SEARCH */}

        <label
          htmlFor="story-location-search"
          className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/60"
        >
          Search location
        </label>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void searchPlace();
          }}
          className="mt-2 flex border border-cyan-200/45 bg-black/25"
        >
          <input
            id="story-location-search"
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchError("");
            }}
            placeholder="City..."
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-white outline-none placeholder:text-white/30"
          />

          <button
            type="submit"
            disabled={searching || !mapsReady}
            aria-label="Search location"
            className="grid w-9 place-items-center text-cyan-200 transition hover:bg-cyan-300/10 disabled:opacity-40"
          >
            <IoSearch />
          </button>
        </form>

        {searchError && (
          <p
            role="alert"
            className="mt-2 text-[11px] text-red-300"
          >
            {searchError}
          </p>
        )}

        {/* GROUP COUNT */}

        <p className="mt-3 text-[11px] text-white/40">
          {groups.length} nearby groups
        </p>

        {/* LOAD MORE */}

        {nextCursor && (
          <button
            type="button"
            onClick={() => {
              void loadStories(
                false,
                nextCursor
              );
            }}
            disabled={loadingMore || loading}
            className="mt-3 w-full border border-white/10 bg-white/5 py-2 text-[10px] uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/10 disabled:opacity-40"
          >
            {loadingMore
              ? "Loading..."
              : "Load more"}
          </button>
        )}

      </aside>

      {/* ============================================== */}
      {/* BOTTOM NAVIGATION */}
      {/* ============================================== */}

      <div className="absolute bottom-5 left-4 z-20 flex gap-2 md:left-7">

        {/* BACK HOME */}

        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Back home"
          className="grid h-10 w-10 place-items-center border border-white/15 bg-black/55 backdrop-blur transition hover:bg-white/10"
        >
          <IoArrowBack />
        </button>

        {/* RESET GLOBE */}

        <button
          type="button"
          onClick={resetWorld}
          aria-label="Reset world"
          className="grid h-10 w-10 place-items-center border border-cyan-300/45 bg-cyan-300/10 text-cyan-200 transition hover:bg-cyan-300/20"
        >
          <IoEarth />
        </button>

        {/* POWER DASHBOARD */}

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDashboardOpen(true)}
          className="flex h-10 items-center gap-2 border border-amber-300/50 bg-amber-300/10 px-3 text-amber-200 transition hover:bg-amber-300/20"
        >
          <IoFlash />

          <span className="hidden text-[10px] font-semibold uppercase sm:inline">
            Power
          </span>
        </button>

      </div>

      {/* ============================================== */}
      {/* LOADING / ERROR STATUS */}
      {/* ============================================== */}

      {(loading ||
        error ||
        (!loading && stories.length === 0)) && (
        <div
          className="absolute bottom-20 left-1/2 z-20 max-w-[90vw] -translate-x-1/2 border border-white/10 bg-black/65 px-4 py-2 text-center text-sm text-white/70 backdrop-blur"
          aria-live="polite"
        >
          {loading
            ? "Locating active stories..."
            : error ||
              `No ${tab} stories right now.`}
        </div>
      )}

      {/* RETRY STORIES */}

      {error && !loading && (
        <button
          type="button"
          onClick={() => void loadStories(true)}
          className="absolute bottom-32 left-1/2 z-20 -translate-x-1/2 border border-cyan-300/30 bg-black/80 px-4 py-2 text-xs text-cyan-200 transition hover:bg-cyan-300/10"
        >
          Retry loading stories
        </button>
      )}

      {/* ============================================== */}
      {/* STORY MARKERS */}
      {/* ============================================== */}

      {mapsReady &&
        !loading &&
        groups.map((group) => (
          <StoryMarker
            key={group.id}
            map={mapRef.current}
            maps3d={maps3dLibrary}
            group={group}
            onClick={handleGroupClick}
          />
        ))}

      {/* ============================================== */}
      {/* POWER DASHBOARD */}
      {/* ============================================== */}

      <DashboardDialog
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        data={dashboardData}
        loading={dashboardLoading}
        error={dashboardError}
        triggerRef={triggerRef}
      />

      {/* DASHBOARD RETRY */}

      {dashboardOpen && dashboardError && (
        <div className="fixed bottom-5 right-5 z-[110]">
          <button
            type="button"
            onClick={retryDashboard}
            className="border border-amber-300/40 bg-[#07131e] px-4 py-2 text-xs text-amber-200 transition hover:bg-amber-300/10"
          >
            Retry Dashboard
          </button>
        </div>
      )}

      {/* ============================================== */}
      {/* STORY MODAL */}
      {/* ============================================== */}

      {selectedGroup && (
        <StoryModal
          key={selectedGroup.id}
          storyGroup={selectedGroup}
          initialIndex={0}
          onClose={() => setSelectedGroupId(null)}
          onStoryUpdate={updateStory}
        />
      )}

    </main>
  );
}
