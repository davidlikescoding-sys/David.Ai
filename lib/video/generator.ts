/**
 * Server-only local video pipeline.
 *
 * Honest capability boundary: this machine has no video diffusion checkpoint.
 * The pipeline renders several real AI images with the installed SD model,
 * creates deterministic pan/zoom crossfade frames on the CPU, and muxes those
 * frames into a WebM with the bundled stable-diffusion.cpp DGL encoder. It is
 * local image-to-video animation, not text-to-video.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { dataRoot } from "../runtime-paths";
import {
  deleteGeneratedImage,
  generateLocalImages,
  getImageEngineStatus,
  imageFilePath,
  inspectGeneratedImage,
} from "../image/generator";
import { normalizeVideoSettings, videoFrameCount } from "../image/video-settings";
import type {
  GeneratedVideo,
  ImageGenerationSettings,
  VideoEngineStatus,
  VideoGenerationSettings,
} from "../image/types";
import { buildVideoEncodeScript } from "./dgl";
import { renderMotionFrame, segmentInfo } from "./motion";

const projectRoot = process.cwd();
const videoDir = join(dataRoot(), "videos");
const ENCODER_NAME = "stable-diffusion.cpp DGL · VP8 WebM";
const MAX_KEYFRAMES = 4;
const MAX_FRAMES = 96;
const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function safeName(relative: string | undefined, fallback: string): string {
  const name = (relative ?? "").replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? fallback;
  return /^[a-zA-Z0-9._-]+$/.test(name) ? name : fallback;
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || randomUUID();
}

function localBinaryPath(): { path: string; relative: string } {
  const image = getImageEngineStatus();
  const name = safeName(image.binary, "sd-cli.exe");
  return { path: join(projectRoot, "bin", "sd-cpp", name), relative: `bin/sd-cpp/${name}` };
}

export function getVideoEngineStatus(): VideoEngineStatus {
  const image = getImageEngineStatus();
  const binary = localBinaryPath();
  const bytes = existsSync(binary.path) ? statSync(binary.path).size : 0;
  const ready = image.ready && bytes > 0;
  return {
    ready,
    message: ready
      ? "Local keyframe renderer and VP8 WebM encoder are installed. Runs entirely on this CPU."
      : image.message,
    encoder: ENCODER_NAME,
    binary: binary.relative,
    binaryBytes: bytes,
    limits: {
      maxKeyframes: MAX_KEYFRAMES,
      maxFrames: MAX_FRAMES,
      minFps: 4,
      maxFps: 12,
      maxSeconds: 6,
      maxWidth: 384,
      maxHeight: 384,
    },
    queue: image.queue,
  };
}

export interface GenerateVideoOptions {
  prompt: string;
  negativePrompt?: string;
  generation: ImageGenerationSettings;
  video: VideoGenerationSettings;
  /** Optional explicit local checkpoint file. */
  modelFile?: string;
  onProgress?: (progress: number, detail?: string) => void;
  onHeartbeat?: (detail: string) => void;
  signal?: AbortSignal;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Video generation was cancelled.");
}

function runEncoder(args: string[], options: GenerateVideoOptions): Promise<void> {
  const binary = localBinaryPath().path;
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(binary, args, { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] });
    let engineOutput = "";
    let settled = false;
    const heartbeat = setInterval(() => {
      if (!settled) options.onHeartbeat?.("Local WebM encoder still running.");
    }, 15_000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      if (error) reject(error);
      else resolvePromise();
    };
    const onAbort = () => { child.kill("SIGTERM"); finish(new Error("Video generation was cancelled.")); };
    checkAbort(options.signal);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Video encoding timed out. Try fewer frames or a smaller canvas."));
    }, VIDEO_TIMEOUT_MS);
    const consume = (chunk: Buffer) => {
      engineOutput = (engineOutput + chunk.toString("utf8")).slice(-8000);
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.on("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      finish(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (code !== 0) {
        finish(new Error(engineOutput.trim().slice(-1200) || `Local video encoder exited with code ${code}.`));
      } else finish();
    });
  });
}

export async function generateLocalVideo(options: GenerateVideoOptions): Promise<GeneratedVideo> {
  const status = getVideoEngineStatus();
  if (!status.ready) throw new Error(status.message);
  checkAbort(options.signal);

  const video = normalizeVideoSettings(options.video);
  const frameCount = Math.min(videoFrameCount(video), MAX_FRAMES);
  const keyframeCount = Math.min(video.keyframes, MAX_KEYFRAMES);
  const width = clamp(options.generation.width, 256, status.limits.maxWidth, 256);
  const height = clamp(options.generation.height, 256, status.limits.maxHeight, 256);
  // One or two steps are unstable with this engine's sigma schedules and can
  // produce non-finite tensors. Four is the lowest tested keyframe setting.
  const steps = clamp(options.generation.steps, 4, 20, 8);
  const seed = typeof options.generation.seed === "number" && Number.isFinite(options.generation.seed)
    ? Math.max(0, Math.floor(options.generation.seed))
    : Math.floor(Math.random() * 2_147_483_647);
  const renderSettings: ImageGenerationSettings = {
    ...options.generation,
    width,
    height,
    steps,
    // Keyframes are rendered in separate processes. Asking sd-cli for a batch
    // allocates several UNet weight graphs at once and can exceed this CPU's
    // memory budget, which is the most common local video failure.
    batchCount: 1,
    seed,
    hires: false,
    autoEnhance: false,
    editMode: "text",
    initImageId: undefined,
    maskImageId: undefined,
  };

  mkdirSync(videoDir, { recursive: true });
  const id = `vid-${safeId(randomUUID())}`;
  const webmPath = join(videoDir, `${id}.webm`);
  const posterPath = join(videoDir, `${id}-poster.png`);
  const scriptPath = join(videoDir, `${id}.dgl`);
  const framesDir = join(videoDir, `${id}-frames`);
  const metadataPath = join(videoDir, `${id}.json`);
  let keyframeIds: string[] = [];
  let modelLabel = "local diffusion";
  const started = Date.now();

  const cleanup = () => {
    for (const path of [webmPath, posterPath, scriptPath, metadataPath]) rmSync(path, { force: true });
    rmSync(framesDir, { recursive: true, force: true });
    for (const keyframeId of keyframeIds) deleteGeneratedImage(keyframeId);
  };

  try {
    options.onProgress?.(2, `Rendering ${keyframeCount} local AI keyframes`);
    // Sequential, low-memory renders. Each later keyframe is guided by the
    // previous one at low denoise strength, so the subject stays recognisable
    // while the scene genuinely changes between keyframes.
    let previousFramePath: string | undefined;
    for (let index = 0; index < keyframeCount; index += 1) {
      checkAbort(options.signal);
      const frameSettings: ImageGenerationSettings = {
        ...renderSettings,
        seed: seed + index,
        editMode: index === 0 ? "text" : "img2img",
        strength: index === 0 ? 0.55 : 0.38,
      };
      const generated = await generateLocalImages({
        prompt: options.prompt,
        negativePrompt: options.negativePrompt ?? "",
        settings: frameSettings,
        modelFile: options.modelFile,
        initImagePath: previousFramePath,
        lowMemory: true,
        signal: options.signal,
        onProgress: (progress, detail) => options.onProgress?.(
          Math.round(((index + progress / 100) / keyframeCount) * 50),
          `Keyframe ${index + 1} of ${keyframeCount}: ${detail ?? "rendering"}`,
        ),
        onHeartbeat: (detail) => options.onHeartbeat?.(detail),
      });
      const result = generated.results[0];
      if (!result) throw new Error("The local renderer did not produce a keyframe.");
      modelLabel = result.model;
      keyframeIds.push(result.id);
      previousFramePath = imageFilePath(result.id) ?? undefined;
      if (!previousFramePath) throw new Error("A local AI keyframe could not be read back from disk.");
    }
    checkAbort(options.signal);

    const inspections = keyframeIds.map((keyframeId) => {
      const inspection = inspectGeneratedImage(keyframeId);
      if (!inspection.valid || !inspection.width || !inspection.height) {
        throw new Error("A video keyframe failed PNG validation.");
      }
      return inspection;
    });
    const sourceWidth = inspections[0].width!;
    const sourceHeight = inspections[0].height!;
    if (inspections.some((item) => item.width !== sourceWidth || item.height !== sourceHeight)) {
      throw new Error("Video keyframes must share one canvas size.");
    }
    const keyframePaths = keyframeIds.map((keyframeId) => imageFilePath(keyframeId)!);

    mkdirSync(framesDir, { recursive: true });
    let poster: Buffer | null = null;
    for (let index = 0; index < frameCount; index += 1) {
      checkAbort(options.signal);
      const segment = segmentInfo(index, frameCount, keyframePaths.length);
      const progress = frameCount <= 1 ? 0 : index / (frameCount - 1);
      const frame = await renderMotionFrame({
        sourceA: keyframePaths[segment.source],
        sourceB: keyframePaths[segment.target],
        sourceWidth,
        sourceHeight,
        width,
        height,
        progress,
        segment,
        motion: video.motion,
        strength: video.strength,
      });
      if (index === 0) poster = frame;
      writeFileSync(join(framesDir, `frame-${String(index).padStart(4, "0")}.png`), frame);
      options.onProgress?.(
        50 + Math.round((index / frameCount) * 30),
        `Local motion frame ${index + 1} of ${frameCount}`,
      );
    }
    if (!poster) throw new Error("No local video frames were produced.");
    writeFileSync(posterPath, poster);

    options.onProgress?.(82, "Encoding the WebM locally");
    const script = buildVideoEncodeScript({
      framesDir,
      outputPath: webmPath,
      fps: video.fps,
      frameCount,
    });
    writeFileSync(scriptPath, script);
    await runEncoder([
      "-M", "dgl",
      "--script", scriptPath,
      "--log-level", "info",
      "--compression-quality", "90",
    ], options);
    checkAbort(options.signal);

    if (!existsSync(webmPath) || statSync(webmPath).size < 1000 || !inspectGeneratedVideo(id).valid) {
      throw new Error("The local encoder did not produce a valid WebM file.");
    }

    const record: GeneratedVideo = {
      id,
      originalPrompt: options.prompt,
      finalPrompt: options.prompt,
      negativePrompt: options.negativePrompt ?? "",
      videoUrl: `/api/video/generated/${id}`,
      posterUrl: `/api/video/generated/${id}?poster=1`,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      status: "complete",
      settings: video,
      generation: renderSettings,
      model: modelLabel,
      sourceKeyframeIds: keyframeIds,
      frameCount,
      keyframeCount: keyframePaths.length,
      fps: video.fps,
      width,
      height,
      bytes: statSync(webmPath).size,
      encoder: ENCODER_NAME,
      pipelineNotes: [
        "Not text-to-video: no video diffusion model is installed on this machine.",
        `${keyframePaths.length} AI keyframe${keyframePaths.length === 1 ? "" : "s"} rendered one at a time in low-memory mode; later keyframes were guided by the previous frame so the subject stays coherent.`,
        `${frameCount} motion frame${frameCount === 1 ? "" : "s"} interpolated on the CPU from those real AI keyframes.`,
        "Frames were encoded to VP8 WebM by the bundled stable-diffusion.cpp DGL encoder. No external service was used.",
      ],
    };
    writeFileSync(metadataPath, JSON.stringify(record, null, 2));
    options.onProgress?.(100, "Local WebM saved");
    return record;
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function videoFilePath(id: string): string | null {
  const path = join(videoDir, `${safeId(id)}.webm`);
  return existsSync(path) ? path : null;
}

export function posterFilePath(id: string): string | null {
  const path = join(videoDir, `${safeId(id)}-poster.png`);
  return existsSync(path) ? path : null;
}

export function readVideoMetadata(id: string): GeneratedVideo | null {
  try {
    const path = join(videoDir, `${safeId(id)}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as GeneratedVideo;
  } catch {
    return null;
  }
}

/** Verifies the real EBML signature written by the local encoder. */
export function inspectGeneratedVideo(id: string): { bytes: number; valid: boolean } {
  const path = videoFilePath(id);
  if (!path) return { bytes: 0, valid: false };
  const bytes = statSync(path).size;
  const header = readFileSync(path).subarray(0, 4);
  const valid = bytes >= 1000 && header.equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return { bytes, valid };
}

export function deleteGeneratedVideo(id: string): boolean {
  const metadata = readVideoMetadata(id);
  let removed = false;
  for (const path of [
    join(videoDir, `${safeId(id)}.webm`),
    join(videoDir, `${safeId(id)}.json`),
    join(videoDir, `${safeId(id)}-poster.png`),
    join(videoDir, `${safeId(id)}.dgl`),
    join(videoDir, `${safeId(id)}-frames`),
  ]) {
    if (!existsSync(path)) continue;
    rmSync(path, { recursive: true, force: true });
    removed = true;
  }
  for (const keyframeId of metadata?.sourceKeyframeIds ?? []) deleteGeneratedImage(keyframeId);
  return removed;
}
