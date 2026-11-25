import sharp from "sharp";
import type { VideoMotion } from "../image/types";

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SegmentInfo {
  source: number;
  target: number;
  /** Eased blend weight from source keyframe to target keyframe. */
  weight: number;
}

const MAX_TRAVEL = 0.12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ease(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic crop for one output frame. No randomness or model call. */
export function cropRect(
  width: number,
  height: number,
  progress: number,
  motion: VideoMotion,
  strength: number,
): CropRect {
  const p = clamp(progress, 0, 1);
  const intensity = clamp(strength, 0, 100) / 100;
  let cropWidth = width;
  let cropHeight = height;

  if (motion === "pan-right" || motion === "pan-left") {
    cropWidth = Math.max(16, Math.round(width * (1 - MAX_TRAVEL * intensity)));
  } else if (motion === "zoom-in") {
    const factor = 1 - MAX_TRAVEL * intensity * p;
    cropWidth = Math.max(16, Math.round(width * factor));
    cropHeight = Math.max(16, Math.round(height * factor));
  } else if (motion === "zoom-out") {
    const factor = 1 - MAX_TRAVEL * intensity * (1 - p);
    cropWidth = Math.max(16, Math.round(width * factor));
    cropHeight = Math.max(16, Math.round(height * factor));
  } else if (motion === "drift") {
    const factor = 1 - MAX_TRAVEL * intensity * 0.6;
    cropWidth = Math.max(16, Math.round(width * factor));
    cropHeight = Math.max(16, Math.round(height * factor));
  }

  const maxX = Math.max(0, width - cropWidth);
  const maxY = Math.max(0, height - cropHeight);
  let x = Math.round(maxX / 2);
  let y = Math.round(maxY / 2);

  if (motion === "pan-right") x = Math.round(maxX * p);
  if (motion === "pan-left") x = Math.round(maxX * (1 - p));
  if (motion === "drift") {
    x = Math.round(maxX * p);
    y = Math.round(maxY * p);
  }

  return {
    left: clamp(x, 0, maxX),
    top: clamp(y, 0, maxY),
    width: Math.min(width, cropWidth),
    height: Math.min(height, cropHeight),
  };
}

/** Maps an output frame onto a pair of neighbouring AI keyframes. */
export function segmentInfo(frameIndex: number, frameCount: number, segmentCount: number): SegmentInfo {
  const safeFrames = Math.max(1, frameCount);
  const safeSegments = Math.max(1, segmentCount);
  const position = (clamp(frameIndex, 0, safeFrames - 1) * safeSegments) / safeFrames;
  const source = Math.min(safeSegments - 1, Math.floor(position));
  const target = Math.min(safeSegments - 1, source + 1);
  return { source, target, weight: ease(position - source) };
}

async function renderCrop(
  source: string,
  sourceWidth: number,
  sourceHeight: number,
  crop: CropRect,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(source)
    .extract({
      left: Math.min(crop.left, sourceWidth - 1),
      top: Math.min(crop.top, sourceHeight - 1),
      width: Math.min(crop.width, sourceWidth),
      height: Math.min(crop.height, sourceHeight),
    })
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
}

async function blendPngs(a: Buffer, b: Buffer, weight: number, width: number, height: number): Promise<Buffer> {
  if (weight <= 0.001) return a;
  if (weight >= 0.999) return b;
  const first = await sharp(a).raw().toBuffer({ resolveWithObject: true });
  const second = await sharp(b).raw().toBuffer({ resolveWithObject: true });
  const channels = Math.min(first.info.channels, second.info.channels, 4);
  const count = first.data.length;
  if (second.data.length !== count || first.info.width !== width || first.info.height !== height) {
    throw new Error("Motion frames could not be blended because their pixel layouts differ.");
  }
  const output = Buffer.allocUnsafe(count);
  for (let index = 0; index < count; index += 1) {
    output[index] = Math.round(first.data[index] * (1 - weight) + second.data[index] * weight);
  }
  return sharp(output, { raw: { width, height, channels: channels as 1 | 2 | 3 | 4 } }).png().toBuffer();
}

export interface MotionFrameInput {
  sourceA: string;
  sourceB: string;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  progress: number;
  segment: SegmentInfo;
  motion: VideoMotion;
  strength: number;
}

/** Produces one real PNG frame: interpolated crop + crossfade between keyframes. */
export async function renderMotionFrame(input: MotionFrameInput): Promise<Buffer> {
  const crop = cropRect(input.sourceWidth, input.sourceHeight, input.progress, input.motion, input.strength);
  const a = await renderCrop(input.sourceA, input.sourceWidth, input.sourceHeight, crop, input.width, input.height);
  if (input.segment.target === input.segment.source || input.segment.weight >= 0.999) return a;
  const b = await renderCrop(input.sourceB, input.sourceWidth, input.sourceHeight, crop, input.width, input.height);
  return blendPngs(a, b, input.segment.weight, input.width, input.height);
}
