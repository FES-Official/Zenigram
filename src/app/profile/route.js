import { NextResponse } from "next/server";
import {
  EXPLORATION_ACHIEVEMENTS,
  LAST_HOURS_GOAL,
} from "@/app/lib/progression";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { normalizeString } from "@/app/lib/api";
import {
  getUserById,
  getUserByUsername,
  getUserRelations,
  getUsersByIds,
  listClips,
  recordProfileVisit,
} from "@/app/lib/socialStore";
import { listStories } from "@/app/lib/storyStore";

export async function POST(req) {
  try {
    const body = await req.json();
    const username = normalizeString(body.username);

    // Validate input
    if (!username) {
      return NextResponse.json(
        { message: "Username is required" },
        { status: 400 },
      );
    }

    // Find user and only return safe fields
    let user = await getUserByUsername(username);

    // A JWT can briefly contain the previous username after a profile rename.
    if (!user) {
      const session = await getServerSession(authOptions);
      if (
        session?.user?.id &&
        normalizeString(session.user.name).toLowerCase() ===
          username.toLowerCase()
      ) {
        user = await getUserById(session.user.id);
      }
    }

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const viewerSession = await getServerSession(authOptions);
    const [relations, viewerRelations] = await Promise.all([
      getUserRelations(user._id),
      viewerSession?.user?.id
        ? getUserRelations(viewerSession.user.id)
        : Promise.resolve({ blockedUsers: [], blockedByUsers: [], supporting: [] }),
    ]);
    if (viewerSession?.user?.id && String(user._id) !== viewerSession.user.id) {
      const blocked =
        viewerRelations.blockedUsers.includes(String(user._id)) ||
        relations.blockedUsers.includes(viewerSession.user.id);
      if (blocked) {
        return NextResponse.json({ message: "User not found" }, { status: 404 });
      }
    }

    const isOwnProfile = String(user._id) === String(viewerSession?.user?.id || "");
    if (!isOwnProfile && viewerSession?.user?.id) {
      await recordProfileVisit(user._id, viewerSession.user.id);
    }
    const connectionsVisible = !user.ishidden || isOwnProfile;
    const contentVisible =
      !user.ishidden ||
      isOwnProfile ||
      (viewerRelations.supporting || []).includes(String(user._id));
    const [supporterProfiles, supportingProfiles, mutualProfiles, visibleStories, visibleClips] =
      await Promise.all([
        connectionsVisible ? getUsersByIds(relations.supporters) : [],
        connectionsVisible ? getUsersByIds(relations.supporting) : [],
        viewerSession?.user?.id && !isOwnProfile
          ? getUsersByIds(
              relations.supporters.filter((id) =>
                (viewerRelations.supporting || []).includes(id),
              ),
            )
          : [],
        contentVisible
          ? listStories(viewerSession?.user?.id).then((stories) =>
              stories.filter((story) => String(story.userId?._id) === String(user._id)),
            )
          : [],
        contentVisible
          ? listClips(viewerSession?.user?.id || "guest").then((clips) =>
              clips.filter((clip) => String(clip.userId) === String(user._id)),
            )
          : [],
      ]);
    const safeProfile = (profile) => ({
      _id: profile._id,
      username: profile.username,
      fullname: profile.fullname,
      profilePic: profile.profilePic,
      ishidden: Boolean(profile.ishidden),
    });

    return NextResponse.json(
      {
        _id: user._id,
        fullname: user.fullname,
        username: user.username,
        bio: user.bio,
        website: user.website,
        profilePic: user.profilePic,
        posts: Array.from({ length: user.postCount || 0 }),
        supporters: relations.supporters,
        supporting: relations.supporting,
        connectionsVisible,
        supporterProfiles: supporterProfiles.map(safeProfile),
        supportingProfiles: supportingProfiles.map(safeProfile),
        mutualSupporters: mutualProfiles.slice(0, 3).map(safeProfile),
        mutualSupportersCount: mutualProfiles.length,
        stories: visibleStories,
        clips: visibleClips,
        ishidden: user.ishidden,
        progression: {
          currentPower: Number(user.progression?.currentPower || 0),
          bestPower: Number(user.progression?.bestPower || 0),
          totalPower: Number(user.progression?.totalPower || 0),
          storiesViewed: Number(user.progression?.storiesViewed || 0),
          achievementIds: user.progression?.achievementIds || [],
          lastHoursPoints: Number(
            user.progression?.lastHoursPoints || 0,
          ),
          lastHoursGoal: LAST_HOURS_GOAL,
        },
        achievements: EXPLORATION_ACHIEVEMENTS,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Profile API Error:", error);

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
