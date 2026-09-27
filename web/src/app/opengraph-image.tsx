import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f1a",
          color: "#f5f7fa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 8, textTransform: "uppercase", color: "#7c9cff", display: "flex" }}>
          Market Intelligence
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, marginTop: 24, display: "flex" }}>{SITE_NAME}</div>
        <div style={{ fontSize: 32, marginTop: 24, color: "#a3adc2", display: "flex" }}>
          Trading signals that show their work
        </div>
      </div>
    ),
    { ...size }
  );
}
