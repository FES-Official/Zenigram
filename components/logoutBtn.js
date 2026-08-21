import { signOut } from "next-auth/react";

export default function LogoutBtn() {
  return (
    <button
      className="text-white px-4 py-2 border cursor-pointer border-red-500 rounded"
      onClick={() => signOut({ callbackUrl: "http://0.0.0.0:7860/login" })}
    >
      Logout
    </button>
  );
}
