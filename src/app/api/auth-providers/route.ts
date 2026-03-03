import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url = `${process.env.NCB_AUTH_API_URL}/providers?instance=${process.env.NCB_INSTANCE}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`auth-providers upstream error: ${res.status}`);
      return NextResponse.json({ providers: { email: true } });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("auth-providers fetch failed:", err);
    return NextResponse.json({ providers: { email: true } });
  }
}
