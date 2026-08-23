import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { getToken } from "next-auth/jwt";

const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "7860", 10);
const maxHeaderSize = 64 * 1024;
const authCookieCleanupThreshold = 12 * 1024;
const productionFlag = process.argv.includes("--prod");
const dev = !productionFlag && process.env.NODE_ENV !== "production";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function clearOversizedAuthCookies(req, res) {
  const cookieHeader = req.headers.cookie || "";
  const canRedirect = req.method === "GET" || req.method === "HEAD";

  if (
    !canRedirect ||
    Buffer.byteLength(cookieHeader) < authCookieCleanupThreshold
  ) {
    return false;
  }

  const authCookieNames = [
    ...new Set(
      cookieHeader
        .split(";")
        .map((cookie) => cookie.trim().split("=", 1)[0])
        .filter((name) => /(?:next-auth|authjs)\./i.test(name)),
    ),
  ];

  if (authCookieNames.length === 0) return false;

  const expiredCookies = authCookieNames.flatMap((name) => {
    const secure = name.startsWith("__Secure-") || name.startsWith("__Host-");
    const attributes = `Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

    return [
      `${name}=; Path=/; ${attributes}`,
      `${name}=; Path=/api/auth; ${attributes}`,
    ];
  });

  res.writeHead(307, {
    Location: req.url || "/",
    "Cache-Control": "no-store",
    "Set-Cookie": expiredCookies,
  });
  res.end();
  return true;
}

app.prepare().then(() => {
  const httpServer = createServer({ maxHeaderSize }, (req, res) => {
    if (clearOversizedAuthCookies(req, res)) return;
    handle(req, res);
  });

  httpServer.on("clientError", (error, socket) => {
    if (!socket.writable) return;

    if (error.code === "HPE_HEADER_OVERFLOW") {
      socket.end(
        [
          "HTTP/1.1 302 Found",
          'Clear-Site-Data: "cookies"',
          "Location: /",
          "Cache-Control: no-store",
          "Connection: close",
          "Content-Length: 0",
          "",
          "",
        ].join("\r\n"),
      );
      return;
    }

    socket.end(
      [
        "HTTP/1.1 400 Bad Request",
        "Connection: close",
        "Content-Length: 0",
        "",
        "",
      ].join("\r\n"),
    );
  });

  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    false;

  const io = new Server(httpServer, {
    path: "/api/socket_io",
    cors: {
      origin: configuredOrigin,
      methods: ["GET", "POST"],
    },
  });

  globalThis.__linkexIo = io;

  io.use(async (socket, nextMiddleware) => {
    try {
      if (!process.env.NEXTAUTH_SECRET) {
        return nextMiddleware(new Error("Realtime authentication is not configured"));
      }

      const token = await getToken({
        req: socket.request,
        secret: process.env.NEXTAUTH_SECRET,
      });
      const userId = typeof token?.id === "string" ? token.id.trim() : "";

      if (!userId) {
        return nextMiddleware(new Error("Unauthorized"));
      }

      socket.data.userId = userId;
      return nextMiddleware();
    } catch (error) {
      console.error("Socket authentication error:", error);
      return nextMiddleware(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${userId}`);

    // Backward-compatible events: never trust the client-supplied ID.
    const registerUser = () => {
      socket.join(`user:${userId}`);
    };
    socket.on("register", registerUser);
    socket.on("register:user", registerUser);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`Zenigram ready on http://${hostname}:${port}`);
  });
});
