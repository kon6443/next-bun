import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export async function GET(
  request: Request,
  context: { params: { nextauth: string[] } }
) {
  const start = Date.now();
  const response = await handler(request, context);
  const elapsed = Date.now() - start;
  console.info(`[next-auth] GET ${request.url} ${elapsed}ms`);
  return response;
}

export async function POST(
  request: Request,
  context: { params: { nextauth: string[] } }
) {
  const start = Date.now();
  const response = await handler(request, context);
  const elapsed = Date.now() - start;
  console.info(`[next-auth] POST ${request.url} ${elapsed}ms`);
  return response;
}
