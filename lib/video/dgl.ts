/**
 * Pure DGL source compiler for the local VP8 WebM encoder.
 *
 * The installed stable-diffusion.cpp build exposes `image::load_dir`,
 * `video::encode` and `media::save` through its DGL mode. Those functions are
 * used only to mux locally generated PNG frames; no video diffusion model or
 * external encoder is involved.
 */
export interface EncodeScriptInput {
  framesDir: string;
  outputPath: string;
  fps: number;
  frameCount: number;
}

function dglString(path: string): string {
  return JSON.stringify(path.replace(/\\/g, "/"));
}

export function buildVideoEncodeScript(input: EncodeScriptInput): string {
  const fps = Math.max(1, Math.round(input.fps));
  const frameCount = Math.max(2, Math.round(input.frameCount));
  return `# version: 0.0.0
var {
    frames_dir = ${dglString(input.framesDir)}
    output = ${dglString(input.outputPath)}
    fps = ${fps}
    frame_count = ${frameCount}
}

fn to_frame(image) {
    return tensor::unsqueeze(image, axis = 3)
}

fn main() {
    images = image::load_dir(frames_dir, max_images = frame_count)
    frames = tensor::concat(map(images, process = to_frame), axis = 3)
    video = {frames = frames, fps_num = fps, fps_den = 1}
    clip = video::encode(video, format = "webm")
    media::save(output, clip)
    return {mime_type = clip.mime_type, frames = frames}
}
`;
}
