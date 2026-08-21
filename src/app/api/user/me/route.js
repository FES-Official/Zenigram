import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { NextResponse } from "next/server";
import {
  EXPLORATION_ACHIEVEMENTS,
  LAST_HOURS_GOAL,
} from "@/app/lib/progression";
import { getUserById } from "@/app/lib/socialStore";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      username: user.username,
      bio: user.bio,
      website: user.website,
      gender: user.gender,
      mobile: user.mobile,
      ishidden: user.ishidden,
      profilePic: user.profilePic,
      progression: {
        currentPower: Number(user.progression?.currentPower || 0),
        bestPower: Number(user.progression?.bestPower || 0),
        totalPower: Number(user.progression?.totalPower || 0),
        storiesViewed: Number(user.progression?.storiesViewed || 0),
        achievementIds: user.progression?.achievementIds || [],
        lastHoursPoints: Number(user.progression?.lastHoursPoints || 0),
        lastHoursGoal: LAST_HOURS_GOAL,
      },
      achievements: EXPLORATION_ACHIEVEMENTS,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
