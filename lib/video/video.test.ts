import { describe, expect, it } from "vitest";
import { normalizeVideo, normalizeVideoSettings, videoFrameCount } from "../image/video-settings";
import { buildVideoEncodeScript } from "./dgl";
import { cropRect, segmentInfo } from "./motion";

describe("local video settings", () => {
  it("clamps untrusted values before they reach the CPU pipeline", () => {
    const settings = normalizeVideoSettings({
      keyframes: 99,
      fps: -4,
      seconds: 100,
      motion: "teleport",
      strength: 500,
    });
    expect(settings).toEqual({
      keyframes: 4,
      fps: 4,
      seconds: 6,
      motion: "drift",
      strength: 100,
    });
    expect(videoFrameCount(settings)).toBe(24);
    expect(videoFrameCount({ ...settings, fps: 12, seconds: 6 })).toBe(72);
  });

  it("rejects imported records that do not point at a local generated WebM", () => {
    expect(normalizeVideo({ id: "vid-1", videoUrl: "https://example.com/video.webm" })).toBeNull();
    expect(normalizeVideo({ id: "vid-1", videoUrl: "/api/video/generated/vid-1" })?.id).toBe("vid-1");
  });
});

describe("local WebM encoder script", () => {
  it("only muxes a real frame directory with the installed DGL media functions", () => {
    const script = buildVideoEncodeScript({
      framesDir: "C:\\project\\data\\videos\\vid-1-frames",
      outputPath: "C:\\project\\data\\videos\\vid-1.webm",
      fps: 8,
      frameCount: 24,
    });
    expect(script).toContain('image::load_dir(frames_dir, max_images = frame_count)');
    expect(script).toContain('video::encode(video, format = "webm")');
    expect(script).toContain("media::save(output, clip)");
    expect(script).toContain("fps = 8");
    expect(script).toContain("frame_count = 24");
    expect(script).toContain("C:/project/data/videos/vid-1.webm");
    expect(script).not.toContain("\\\\");
    expect(script).not.toContain("model");
  });
});

describe("deterministic motion frames", () => {
  it("keeps pans inside the source canvas", () => {
    const start = cropRect(384, 384, 0, "pan-right", 100);
    const end = cropRect(384, 384, 1, "pan-right", 100);
    expect(start.left).toBe(0);
    expect(end.left).toBeGreaterThan(0);
    expect(end.left + end.width).toBeLessThanOrEqual(384);
    expect(end.top + end.height).toBeLessThanOrEqual(384);
  });

  it("renders a smaller crop for zoom-in and no crop for none", () => {
    const zoom = cropRect(384, 256, 1, "zoom-in", 100);
    const none = cropRect(384, 256, 1, "none", 100);
    expect(zoom.width).toBeLessThan(384);
    expect(zoom.height).toBeLessThan(256);
    expect(none).toEqual({ left: 0, top: 0, width: 384, height: 256 });
  });

  it("blends neighbouring AI keyframes with eased weights", () => {
    expect(segmentInfo(0, 24, 3)).toEqual({ source: 0, target: 1, weight: 0 });
    expect(segmentInfo(12, 24, 3)).toEqual({ source: 1, target: 2, weight: 0.5 });
    expect(segmentInfo(23, 24, 3).source).toBe(2);
  });
});
