import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export const GET = async (...args: Parameters<typeof handler>) => {
  const request = args[0] as Request;
  const start = Date.now();
  const response = await handler(...args);
  const elapsed = Date.now() - start;
  return response;
};

export const POST = async (...args: Parameters<typeof handler>) => {
  const request = args[0] as Request;
  const start = Date.now();
  const response = await handler(...args);
  const elapsed = Date.now() - start;
  return response;
};
