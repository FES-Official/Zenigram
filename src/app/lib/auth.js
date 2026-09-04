import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { normalizeEmail, normalizeString } from "@/app/lib/api";
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByIdentifier,
  getUserByUsername,
  updateUser,
} from "@/app/lib/socialStore";

function usernameBase(value) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 20);

  return normalized.length >= 3
    ? normalized
    : `user${Date.now().toString().slice(-8)}`;
}

async function createUniqueUsername(value) {
  const base = usernameBase(value);
  for (let suffix = 0; suffix < 10000; suffix += 1) {
    const username = suffix === 0
      ? base
      : `${base.slice(0, 20 - String(suffix).length)}${suffix}`.slice(0, 24);
    if (!(await getUserByUsername(username))) return username;
  }
  throw new Error("Unable to allocate a username");
}

function authUser(user) {
  return {
    id: String(user._id),
    name: user.username,
    email: user.email,
  };
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return getUserByEmail(normalized);
}

async function ensureGoogleUser(user, profile) {
  const email = normalizeEmail(user.email || profile?.email);
  if (!email) return null;

  let dbUser = await findUserByEmail(email);
  if (!dbUser) {
    const username = await createUniqueUsername(
      profile?.email?.split("@")[0] || profile?.name || user.name,
    );
    dbUser = await createUser({
      fullname: normalizeString(profile?.name || user.name) || username,
      username,
      email,
      profilePic: user.image || profile?.picture || "",
      authProvider: "google",
      lastLogin: new Date().toISOString(),
    });
  } else {
    if (dbUser.accountStatus !== "active") return null;
    const updates = {
      email,
      lastLogin: new Date().toISOString(),
    };
    if (!dbUser.fullname) {
      updates.fullname = normalizeString(profile?.name || user.name) || dbUser.username;
    }
    if (!dbUser.username) {
      updates.username = await createUniqueUsername(
        profile?.email?.split("@")[0] || profile?.name || user.name,
      );
    }
    if (!dbUser.profilePic && (user.image || profile?.picture)) {
      updates.profilePic = user.image || profile.picture;
    }
    dbUser = await updateUser(dbUser._id, updates);
  }

  return dbUser;
}

const providers = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      username: {
        label: "Username or email",
        type: "text",
        placeholder: "Username or email",
      },
      password: {
        label: "Password",
        type: "password",
        placeholder: "Password",
      },
    },
    async authorize(credentials) {
      const identifier = normalizeString(credentials?.username).toLowerCase();
      const password = credentials?.password;
      if (!identifier || typeof password !== "string" || password.length > 128) return null;

      const user = await getUserByIdentifier(identifier);
      if (!user?.password || user.accountStatus !== "active") return null;

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return null;

      const updated = await updateUser(user._id, {
        lastLogin: new Date().toISOString(),
      });
      return updated?.accountStatus === "active" ? authUser(updated) : null;
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const authOptions = {
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const dbUser = await ensureGoogleUser(user, profile);
      if (!dbUser || dbUser.accountStatus !== "active") return false;
      Object.assign(user, authUser(dbUser));
      return true;
    },

    async jwt({ token, user }) {
      let dbUser = null;
      if (user?.id) dbUser = await getUserById(user.id);
      if (!dbUser && user?.email) dbUser = await findUserByEmail(user.email);
      if (!dbUser && token.id) dbUser = await getUserById(token.id);
      if (!dbUser && token.email) dbUser = await findUserByEmail(token.email);

      if (dbUser?.accountStatus === "active") {
        const normalizedUser = authUser(dbUser);
        token.id = normalizedUser.id;
        token.name = normalizedUser.name;
        token.email = normalizedUser.email;
      } else {
        token.id = "";
        token.name = "";
        token.email = "";
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id || "";
        session.user.name = token.name || "";
        session.user.email = token.email || "";
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};

export default authOptions;
