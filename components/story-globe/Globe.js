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
import MapboxMap, {
  FullscreenControl,
  NavigationControl,
} from "react-map-gl/mapbox";

import PowerDashboard from "./PowerDashboard";
import StoryMarker from "./StoryMarker";
import StoryModal from "./StoryModal";

import "mapbox-gl/dist/mapbox-gl.css";

const DEFAULT_VIEW_STATE = {
  longitude: 15,
  latitude: 18,
  zoom: 1.65,
  pitch: 18,
  bearing: -8,
};

const SATELLITE_MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

const STORY_GROUP_RADIUS_METERS = 700;

function isValidCoordinate(story) {
  const longitude = Number(story.longitude);
  const latitude = Number(story.latitude);

  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function distanceInMeters(a, b) {
  const earthRadius = 6_371_000;
  const toRadians = (value) => (value * Math.PI) / 180;

  const startLatitude = toRadians(Number(a.latitude));
  const endLatitude = toRadians(Number(b.latitude));
  const latitudeDelta = endLatitude - startLatitude;
  const longitudeDelta = toRadians(Number(b.longitude) - Number(a.longitude));

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function groupStoriesByProximity(
  stories,
  radiusMeters = STORY_GROUP_RADIUS_METERS,
) {
  const validStories = stories
    .filter(isValidCoordinate)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  const groups = [];

  validStories.forEach((story) => {
    const matchingGroup = groups.find(
      (group) => distanceInMeters(group, story) <= radiusMeters,
    );

    if (!matchingGroup) {
      groups.push({
        latitude: Number(story.latitude),
        longitude: Number(story.longitude),
        stories: [story],
      });

      return;
    }

    matchingGroup.stories.push(story);

    const totals = matchingGroup.stories.reduce(
      (result, item) => ({
        latitude: result.latitude + Number(item.latitude),
        longitude: result.longitude + Number(item.longitude),
      }),
      {
        latitude: 0,
        longitude: 0,
      },
    );

    matchingGroup.latitude = totals.latitude / matchingGroup.stories.length;

    matchingGroup.longitude = totals.longitude / matchingGroup.stories.length;
  });

  return groups.map((group) => ({
    ...group,
    id: group.stories
      .map((story) => story._id)
      .sort()
      .join("-"),
  }));
}

function PowerDashboardDialog({
  open,
  onClose,
  triggerRef,
  data,
  loading,
  error,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;

      // eslint-disable-next-line react-hooks/exhaustive-deps
      triggerRef.current?.focus();
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        id="power-dashboard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="power-dashboard-title"
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border border-cyan-300/30 bg-[#040b12] shadow-[0_0_70px_rgba(34,211,238,.2)]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-cyan-200/15 bg-[#07131e] px-4 py-3 sm:px-6 sm:py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/55">
              World progression
            </p>

            <h2
              id="power-dashboard-title"
              className="mt-1 flex items-center gap-2 text-lg font-semibold uppercase tracking-wide text-cyan-100 sm:text-xl"
            >
              <IoFlash className="text-cyan-300" />
              Power Dashboard
            </h2>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close Power Dashboard"
            title="Close dashboard"
            className="grid h-10 w-10 place-items-center border border-white/15 bg-black/30 text-xl text-white/70 transition hover:border-cyan-300/60 hover:bg-cyan-300/10 hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300"
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
  const mapRef = useRef(null);
  const storyOpenTimerRef = useRef(null);
  const searchControllerRef = useRef(null);
  const dashboardTriggerRef = useRef(null);

  const router = useRouter();
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const [stories, setStories] = useState([]);
  const [storyTab, setStoryTab] = useState("all");
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapMoving, setMapMoving] = useState(false);

  const [isPowerDashboardOpen, setIsPowerDashboardOpen] = useState(false);
  const [hasLoadedPower, setHasLoadedPower] = useState(false);
  const [powerData, setPowerData] = useState(null);
  const [powerLoading, setPowerLoading] = useState(false);
  const [powerError, setPowerError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadStories = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/story-upload", {
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Unable to load stories.");
        }

        setStories(Array.isArray(data.stories) ? data.stories : []);
      } catch (loadError) {
        if (loadError.name === "AbortError") return;

        console.error("Failed to fetch stories:", loadError);

        setError(loadError.message || "Stories could not be loaded right now.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadStories();

    return () => controller.abort();
  }, []);

  /*
   * Load the dashboard only when the user opens it.
   * A failed request will be retried the next time it is opened.
   */
  useEffect(() => {
    if (!isPowerDashboardOpen || hasLoadedPower) {
      return undefined;
    }

    const controller = new AbortController();

    const loadPower = async () => {
      try {
        setPowerLoading(true);
        setPowerError("");

        const response = await fetch("/api/user/me", {
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Sign in to track your world progression."
              : data.error || "Unable to load Power Dashboard.",
          );
        }

        setPowerData(data);
        setHasLoadedPower(true);
      } catch (loadError) {
        if (loadError.name === "AbortError") return;

        console.error("Failed to fetch Power Dashboard:", loadError);

        setPowerError(
          loadError.message || "The Power Dashboard could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setPowerLoading(false);
        }
      }
    };

    loadPower();

    return () => controller.abort();
  }, [hasLoadedPower, isPowerDashboardOpen]);

  useEffect(() => {
    return () => {
      if (storyOpenTimerRef.current) {
        window.clearTimeout(storyOpenTimerRef.current);
      }

      searchControllerRef.current?.abort();
    };
  }, []);

  const visibleStories = useMemo(() => {
    if (storyTab === "trending") {
      const highestViews = Math.max(...stories.map((story) => Number(story.viewsCount || 0)), 0);
      return stories.filter((story) => Number(story.viewsCount || 0) === highestViews);
    }
    if (storyTab === "close") return stories.filter((story) => story.closeOne);
    return stories;
  }, [stories, storyTab]);

  const proximityGroups = useMemo(
    () => groupStoriesByProximity(visibleStories),
    [visibleStories],
  );

  const activeStoriesCount = visibleStories.length;

  const allStoriesGroup = useMemo(
    () => ({
      id: "all-stories",
      stories: [...visibleStories].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }),
    [visibleStories],
  );

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return null;

    if (selectedGroupId === allStoriesGroup.id) {
      return allStoriesGroup;
    }

    return (
      proximityGroups.find((group) => group.id === selectedGroupId) || null
    );
  }, [allStoriesGroup, proximityGroups, selectedGroupId]);

  const closePowerDashboard = useCallback(() => {
    setIsPowerDashboardOpen(false);
  }, []);

  const openPowerDashboard = useCallback(() => {
    setIsPowerDashboardOpen(true);
  }, []);

  const openStoryGroup = useCallback((group) => {
    if (storyOpenTimerRef.current) {
      window.clearTimeout(storyOpenTimerRef.current);
    }

    mapRef.current?.getMap()?.flyTo({
      center: [group.longitude, group.latitude],
      zoom: 19,
      pitch: 30,
      duration: 650,
      essential: true,
    });

    storyOpenTimerRef.current = window.setTimeout(() => {
      setSelectedGroupId(group.id);
      storyOpenTimerRef.current = null;
    }, 500);
  }, []);

  const updateStory = useCallback((storyId, updates) => {
    setStories((currentStories) =>
      currentStories.map((story) =>
        story._id === storyId
          ? {
              ...story,
              likesCount: updates.likesCount ?? story.likesCount,
              viewsCount: updates.viewsCount ?? story.viewsCount,
              viewerLiked: updates.viewerLiked ?? story.viewerLiked,
              viewers: updates.viewers ?? story.viewers,
            }
          : story,
      ),
    );

    if (updates.progression) {
      setPowerData((currentData) =>
        currentData
          ? {
              ...currentData,
              progression: {
                ...currentData.progression,
                ...updates.progression,
              },
            }
          : currentData,
      );
    }
  }, []);

  const searchPlace = useCallback(async () => {
    const query = searchQuery.trim();

    if (!query) {
      setSearchError("Enter a city or location.");
      return;
    }

    if (!mapboxToken) {
      setSearchError("Mapbox token is missing.");
      return;
    }

    searchControllerRef.current?.abort();

    const controller = new AbortController();
    searchControllerRef.current = controller;

    try {
      setSearching(true);
      setSearchError("");

      const endpoint =
        "https://api.mapbox.com/geocoding/v5/" +
        `mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${mapboxToken}&limit=1`;

      const response = await fetch(endpoint, {
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Location search failed.");
      }

      const place = data.features?.[0];

      if (!place?.center) {
        setSearchError("No matching location was found.");
        return;
      }

      mapRef.current?.getMap()?.flyTo({
        center: place.center,
        zoom: 5,
        pitch: 20,
        duration: 900,
        essential: true,
      });
    } catch (searchRequestError) {
      if (searchRequestError.name === "AbortError") return;

      console.error("Location search failed:", searchRequestError);

      setSearchError(searchRequestError.message || "Location search failed.");
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }, [mapboxToken, searchQuery]);

  const resetWorldView = useCallback(() => {
    mapRef.current?.getMap()?.flyTo({
      center: [DEFAULT_VIEW_STATE.longitude, DEFAULT_VIEW_STATE.latitude],
      zoom: DEFAULT_VIEW_STATE.zoom,
      pitch: DEFAULT_VIEW_STATE.pitch,
      bearing: DEFAULT_VIEW_STATE.bearing,
      duration: 700,
      essential: true,
    });
  }, []);

  return (
    <main className="story-globe relative h-screen w-screen overflow-hidden bg-[#03070d] text-white">
      <style jsx global>{`
        @media (max-width: 640px) {
          .story-globe .mapboxgl-ctrl-top-right {
            top: auto;
            right: 12px;
            bottom: 16px;
          }
        }
      `}</style>

      {!mapboxToken && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black px-5 text-center">
          Mapbox token is missing.
        </div>
      )}

      <MapboxMap
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        mapStyle={SATELLITE_MAP_STYLE}
        projection="globe"
        initialViewState={DEFAULT_VIEW_STATE}
        minZoom={1}
        maxZoom={18}
        maxPitch={60}
        fadeDuration={0}
        renderWorldCopies={false}
        reuseMaps
        antialias={false}
        attributionControl={false}
        onLoad={() => {
          const map = mapRef.current?.getMap();

          map?.setFog({
            color: "rgb(10, 24, 32)",
            "high-color": "rgb(40, 110, 125)",
            "horizon-blend": 0.08,
            "space-color": "rgb(1, 4, 9)",
            "star-intensity": 0.5,
          });
        }}
        onMoveStart={() => setMapMoving(true)}
        onMoveEnd={() => setMapMoving(false)}
      >
        <div className="pointer-events-none absolute inset-0 z-1 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,8,16,.08)_70%,rgba(0,4,10,.42)_100%)]" />

        <header className="pointer-events-none absolute left-1/2 top-4 z-20 w-[min(94vw,760px)] -translate-x-1/2 text-center md:top-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/65">
            Live for 24 hours
          </p>

          <h1 className="mt-1 text-xl font-semibold uppercase text-cyan-100 drop-shadow-[0_0_18px_rgba(103,232,249,.55)] sm:text-2xl md:text-4xl">
            The Global Storyscape
          </h1>

          <div className="mx-auto mt-4 w-fit border border-cyan-300/35 bg-black/45 px-4 py-2 text-sm text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,.16)] backdrop-blur">
            <span className="text-xl font-semibold">{activeStoriesCount}</span>{" "}
            active {activeStoriesCount === 1 ? "story" : "stories"}
          </div>
          <div className="mx-auto mt-3 flex w-fit overflow-hidden border border-cyan-300/35 bg-black/45 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur">
            {[
              ["all", "All"],
              ["trending", "Trending"],
              ["close", "Close ones"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setStoryTab(id);
                  setSelectedGroupId(null);
                }}
                className={`px-3 py-2 transition sm:px-4 ${storyTab === id ? "bg-cyan-300/20 text-cyan-100" : "text-white/55 hover:bg-white/10"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <aside className="absolute left-3 top-40 z-20 w-[min(72vw,190px)] border border-cyan-200/20 bg-[#06101a]/78 p-3 shadow-[0_0_28px_rgba(34,211,238,.08)] backdrop-blur-md md:left-7 md:top-1/2 md:-translate-y-1/2">
          <button
            type="button"
            disabled={visibleStories.length === 0}
            onClick={() => setSelectedGroupId(allStoriesGroup.id)}
            className="flex w-full items-center justify-center gap-2 border border-cyan-300/50 bg-cyan-300/10 px-3 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IoPlay />
            Watch all stories
          </button>

          <label
            htmlFor="story-location-search"
            className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/60"
          >
            Search location
          </label>

          <div className="mt-2 flex border border-cyan-200/45 bg-black/25 focus-within:border-cyan-300">
            <input
              id="story-location-search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);

                if (searchError) {
                  setSearchError("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchPlace();
                }
              }}
              placeholder="City..."
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs text-white outline-none placeholder:text-white/30"
            />

            <button
              type="button"
              onClick={searchPlace}
              disabled={searching || !searchQuery.trim()}
              aria-label={
                searching ? "Searching for location" : "Search location"
              }
              title="Search"
              className="grid w-9 place-items-center text-cyan-200 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IoSearch className={searching ? "animate-pulse" : ""} />
            </button>
          </div>

          {searchError && (
            <p role="alert" className="mt-2 text-[11px] text-red-300">
              {searchError}
            </p>
          )}

          <p className="mt-3 text-[11px] text-white/40">
            {proximityGroups.length} active{" "}
            {proximityGroups.length === 1 ? "location" : "locations"}
          </p>
        </aside>

        <div className="absolute bottom-5 left-4 z-20 flex gap-2 md:left-7">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Back home"
            title="Home"
            className="grid h-10 w-10 place-items-center border border-white/15 bg-black/55 text-white backdrop-blur transition hover:border-cyan-300/60 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <IoArrowBack />
          </button>

          <button
            type="button"
            onClick={resetWorldView}
            aria-label="Reset world view"
            title="World view"
            className="grid h-10 w-10 place-items-center border border-cyan-300/45 bg-cyan-300/10 text-cyan-200 backdrop-blur transition hover:bg-cyan-300/20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            <IoEarth />
          </button>

          <button
            ref={dashboardTriggerRef}
            type="button"
            onClick={openPowerDashboard}
            aria-label="Open Power Dashboard"
            aria-haspopup="dialog"
            aria-expanded={isPowerDashboardOpen}
            aria-controls="power-dashboard-dialog"
            title="Power Dashboard"
            className="group flex h-10 items-center gap-2 border border-amber-300/50 bg-amber-300/10 px-3 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,.08)] backdrop-blur transition hover:bg-amber-300/20 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            <IoFlash className="transition group-hover:scale-110" />

            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] sm:inline">
              Power
            </span>
          </button>
        </div>

        <NavigationControl showCompass visualizePitch />

        <FullscreenControl />

        {(loading || error || (!loading && activeStoriesCount === 0)) && (
          <div
            aria-live="polite"
            className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 border border-white/10 bg-black/65 px-4 py-2 text-sm text-white/70 backdrop-blur"
          >
            {loading
              ? "Locating active stories..."
              : error || "No active stories for this view."}
          </div>
        )}

        {!mapMoving &&
          proximityGroups.map((group) => (
            <StoryMarker
              key={group.id}
              group={group}
              onClick={openStoryGroup}
            />
          ))}
      </MapboxMap>

      <PowerDashboardDialog
        open={isPowerDashboardOpen}
        onClose={closePowerDashboard}
        triggerRef={dashboardTriggerRef}
        data={powerData}
        loading={powerLoading}
        error={powerError}
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
