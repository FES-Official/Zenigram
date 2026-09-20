"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IoArrowBack,
  IoClose,
  IoEarth,
  IoFlash,
  IoPlay,
  IoSearch,
} from "react-icons/io5";

import PowerDashboard from "./PowerDashboard";
import StoryMarker from "./StoryMarker";
import StoryModal from "./StoryModal";

const DEFAULT_CENTER = { lat: 18, lng: 15 };
const DEFAULT_ZOOM = 1;
const STORY_GROUP_RADIUS_METERS = 700;
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

let googleMapsLoaderPromise = null;

function loadGoogleMaps(apiKey) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in a browser."));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google);
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(
      "zenigram-google-maps-script"
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google), {
        once: true,
      });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Google Maps failed to load.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "zenigram-google-maps-script";
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(apiKey) +
      "&v=weekly&libraries=marker";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google?.maps?.Map) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps loaded without the Maps API."));
      }
    };

    script.onerror = () =>
      reject(new Error("Unable to load Google Maps."));

    document.head.appendChild(script);
  });

  return googleMapsLoaderPromise;
}

function valid(story) {
  const lng = Number(story?.longitude);
  const lat = Number(story?.latitude);

  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function distance(a, b) {
  const R = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;

  const lat1 = toRadians(Number(a.latitude));
  const lat2 = toRadians(Number(b.latitude));
  const dLat = toRadians(Number(b.latitude) - Number(a.latitude));
  const dLng = toRadians(Number(b.longitude) - Number(a.longitude));

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function groupStories(stories) {
  const groups = [];

  for (const story of stories.filter(valid)) {
    const existingGroup = groups.find(
      (group) => distance(group, story) <= STORY_GROUP_RADIUS_METERS
    );

    if (!existingGroup) {
      groups.push({
        latitude: Number(story.latitude),
        longitude: Number(story.longitude),
        stories: [story],
      });
      continue;
    }

    existingGroup.stories.push(story);

    existingGroup.latitude =
      existingGroup.stories.reduce(
        (sum, item) => sum + Number(item.latitude),
        0
      ) / existingGroup.stories.length;

    existingGroup.longitude =
      existingGroup.stories.reduce(
        (sum, item) => sum + Number(item.longitude),
        0
      ) / existingGroup.stories.length;
  }

  return groups.map((group, index) => ({
    ...group,
    id:
      group.stories
        .map((story) => story?._id)
        .filter(Boolean)
        .sort()
        .join("-") || `group-${index}`,
  }));
}

function DashboardDialog({
  open,
  onClose,
  data,
  loading,
  error,
  triggerRef,
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-3 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
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
            className="grid h-10 w-10 place-items-center border border-white/15 text-xl text-white/70"
          >
            <IoClose />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <PowerDashboard data={data} loading={loading} error={error} />
        </div>
      </section>
    </div>
  );
}

export default function StoryGlobe() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const triggerRef = useRef(null);

  const router = useRouter();

  const [mapsReady, setMapsReady] = useState(false);
  const [mapError, setMapError] = useState("");

  const [tab, setTab] = useState("all");
  const [stories, setStories] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  

const [mapInstance, setMapInstance] = useState(null);

  const loadStories = useCallback(
    async (reset = false, cursor = "") => {
      if (!reset && !cursor) return;

      const controller = new AbortController();

      try {
        if (reset) setLoading(true);
        else setLoadingMore(true);

        setError("");

        const params = new URLSearchParams({
          tab,
          limit: "80",
        });

        if (cursor) params.set("cursor", cursor);

        const response = await fetch(
          `/api/story-globe?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.error || "Unable to load stories.");
        }

        const incomingStories = Array.isArray(data?.stories)
          ? data.stories
          : [];

        setStories((current) =>
          reset ? incomingStories : [...current, ...incomingStories]
        );
        setNextCursor(data?.nextCursor || null);
      } catch (loadError) {
        if (loadError?.name !== "AbortError") {
          setError(
            loadError?.message || "Stories could not be loaded right now."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }

      return () => controller.abort();
    },
    [tab]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (cancelled) return;

      setStories([]);
      setNextCursor(null);
      setSelectedGroupId(null);
      await loadStories(true);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [tab, loadStories]);

  useEffect(() => {
    if (!dashboardOpen || dashboardData) return undefined;

    const controller = new AbortController();

    const loadDashboard = async () => {
      try {
        setDashboardLoading(true);
        setDashboardError("");

        const response = await fetch("/api/user/me", {
          signal: controller.signal,
          cache: "no-store",
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.error || "Unable to load Power Dashboard."
          );
        }

        setDashboardData(data);
      } catch (dashboardLoadError) {
        if (dashboardLoadError?.name !== "AbortError") {
          setDashboardError(
            dashboardLoadError?.message || "Unable to load Power Dashboard."
          );
        }
      } finally {
        if (!controller.signal.aborted) setDashboardLoading(false);
      }
    };

    void loadDashboard();

    return () => controller.abort();
  }, [dashboardOpen, dashboardData]);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setMapError("Google Maps API key is missing.");
      return undefined;
    }

    let cancelled = false;

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then((google) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) {
          return;
        }

        const map = new google.maps.Map(mapContainerRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: 1,
          maxZoom: 18,
          mapTypeId: "satellite",
          mapId: GOOGLE_MAP_ID,
          gestureHandling: "greedy",
          disableDefaultUI: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          rotateControl: true,
          cameraControl: false,
          clickableIcons: false,
          keyboardShortcuts: true,
          isFractionalZoomEnabled: true,
          backgroundColor: "#03070d",
          tilt: 0,
          heading: 0,
        });

        mapRef.current = map;
        setMapsReady(true);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setMapError(
            loadError?.message || "Unable to load Google Maps."
          );
        }
      });

    return () => {
      cancelled = true;

      if (mapRef.current) {
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapsReady) return undefined;

    const resize = () => {
      window.google?.maps?.event?.trigger(mapRef.current, "resize");
    };

    const timer = window.setTimeout(resize, 80);
    window.addEventListener("resize", resize);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
    };
  }, [mapsReady]);

  const groups = useMemo(() => groupStories(stories), [stories]);

  const selectedGroup = useMemo(() => {
    const existingGroup = groups.find(
      (group) => group.id === selectedGroupId
    );

    if (existingGroup) return existingGroup;

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
  }, [groups, selectedGroupId, stories]);

  const searchPlace = useCallback(async () => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchError("Enter a city or location.");
      return;
    }

    if (!mapRef.current || !window.google?.maps?.Geocoder) {
      setSearchError("Google Maps is still loading.");
      return;
    }

    try {
      setSearching(true);
      setSearchError("");

      const geocoder = new window.google.maps.Geocoder();

      const response = await geocoder.geocode({
        address: query,
      });

      const result = response?.results?.[0];
      const location = result?.geometry?.location;

      if (!location) {
        throw new Error("No matching location was found.");
      }

      const target = {
        lat: location.lat(),
        lng: location.lng(),
      };

      mapRef.current.panTo(target);

      window.setTimeout(() => {
        mapRef.current?.setZoom(6);
      }, 300);
    } catch (searchLoadError) {
      setSearchError(
        searchLoadError?.message || "Location search failed."
      );
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const updateStory = useCallback((storyId, updates) => {
    setStories((current) =>
      current.map((story) =>
        story?._id === storyId ? { ...story, ...updates } : story
      )
    );
  }, []);

  const resetWorld = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    map.panTo(DEFAULT_CENTER);
    window.setTimeout(() => {
      mapRef.current?.setZoom(DEFAULT_ZOOM + 0.65);
      mapRef.current?.setTilt(0);
      mapRef.current?.setHeading(-8);
    }, 300);
  }, []);

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
            Enable the Google Maps JavaScript API for the configured Google
            Cloud project and provide a Maps JavaScript API key.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="story-globe relative h-screen w-screen overflow-hidden bg-[#03070d] text-white">
      <div
        ref={mapContainerRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Zenigram Stories Globe"
      />

      <div className="pointer-events-none absolute inset-0 z-1 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,8,16,.08)_70%,rgba(0,4,10,.42)_100%)]" />

      <header className="pointer-events-none absolute left-1/2 top-4 z-20 w-[min(96vw,900px)] -translate-x-1/2 text-center md:top-7">
        <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/65">
          Live for 24 hours
        </p>

        <h1 className="mt-1 text-xl font-semibold uppercase text-cyan-100 drop-shadow-[0_0_18px_rgba(103,232,249,.55)] sm:text-2xl md:text-4xl">
          The Global Storyscape
        </h1>

        <div className="pointer-events-auto mx-auto mt-4 flex w-fit overflow-x-auto border border-cyan-300/35 bg-black/50 text-[10px] font-semibold uppercase tracking-[0.1em] backdrop-blur">
          {[
            ["all", "All"],
            ["trending", "Trending"],
            ["close", "Close Ones"],
            ["supporting", "Supporting"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
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

        <div className="mx-auto mt-2 w-fit border border-white/10 bg-black/45 px-3 py-1.5 text-xs text-white/65">
          {stories.length} loaded · {nextCursor ? "more available" : "end of feed"}
        </div>
      </header>

      <aside className="absolute left-3 top-40 z-20 w-[min(72vw,210px)] border border-cyan-200/20 bg-[#06101a]/80 p-3 backdrop-blur-md md:left-7 md:top-1/2 md:-translate-y-1/2">
        <button
          type="button"
          disabled={!stories.length}
          onClick={() => setSelectedGroupId("all-stories")}
          className="flex w-full items-center justify-center gap-2 border border-cyan-300/50 bg-cyan-300/10 px-3 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 disabled:opacity-40"
        >
          <IoPlay />
          Watch loaded stories
        </button>

        <label
          htmlFor="story-location-search"
          className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/60"
        >
          Search location
        </label>

        <div className="mt-2 flex border border-cyan-200/45 bg-black/25">
          <input
            id="story-location-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void searchPlace();
            }}
            placeholder="City..."
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-white outline-none placeholder:text-white/30"
          />

          <button
            type="button"
            onClick={() => void searchPlace()}
            disabled={searching || !mapsReady}
            aria-label="Search location"
            className="grid w-9 place-items-center text-cyan-200 disabled:opacity-40"
          >
            <IoSearch />
          </button>
        </div>

        {searchError && (
          <p className="mt-2 text-[11px] text-red-300">{searchError}</p>
        )}

        <p className="mt-3 text-[11px] text-white/40">
          {groups.length} nearby groups
        </p>

        {nextCursor && (
          <button
            type="button"
            onClick={() => void loadStories(false, nextCursor)}
            disabled={loadingMore}
            className="mt-3 w-full border border-white/10 bg-white/5 py-2 text-[10px] uppercase tracking-[0.12em] text-white/70 disabled:opacity-40"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </aside>

      <div className="absolute bottom-5 left-4 z-20 flex gap-2 md:left-7">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Back home"
          className="grid h-10 w-10 place-items-center border border-white/15 bg-black/55 backdrop-blur"
        >
          <IoArrowBack />
        </button>

        <button
          type="button"
          onClick={resetWorld}
          aria-label="Reset world"
          className="grid h-10 w-10 place-items-center border border-cyan-300/45 bg-cyan-300/10 text-cyan-200"
        >
          <IoEarth />
        </button>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDashboardOpen(true)}
          className="flex h-10 items-center gap-2 border border-amber-300/50 bg-amber-300/10 px-3 text-amber-200"
        >
          <IoFlash />
          <span className="hidden text-[10px] font-semibold uppercase sm:inline">
            Power
          </span>
        </button>
      </div>

      {(loading || error || (!loading && stories.length === 0)) && (
        <div className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 border border-white/10 bg-black/65 px-4 py-2 text-sm text-white/70 backdrop-blur">
          {loading
            ? "Locating active stories..."
            : error || `No ${tab} stories right now.`}
        </div>
      )}

      {mapsReady &&
        !loading &&
        groups.map((group) => (
          <StoryMarker
            key={group.id}
            map={mapRef.current}
            group={group}
            onClick={(value) => setSelectedGroupId(value.id)}
          />
        ))}

      <DashboardDialog
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        data={dashboardData}
        loading={dashboardLoading}
        error={dashboardError}
        triggerRef={triggerRef}
      />

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
