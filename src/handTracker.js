import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.results = null;
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  detect(video) {
    if (!this.landmarker || video.readyState < 2) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    this.results = this.landmarker.detectForVideo(video, performance.now());
  }

  // Returns array of hand objects with mirrored canvas coords
  getHands(cw, ch) {
    if (!this.results?.landmarks?.length) return [];
    return this.results.landmarks.map((lms, i) => {
      const handedness = this.results.handednesses[i]?.[0]?.categoryName ?? "Unknown";
      const pts = lms.map((lm) => ({
        x: (1 - lm.x) * cw,
        y: lm.y * ch,
      }));
      // Palm center: wrist + 4 knuckle bases
      const palmCenter = {
        x: (pts[0].x + pts[5].x + pts[9].x + pts[13].x + pts[17].x) / 5,
        y: (pts[0].y + pts[5].y + pts[9].y + pts[13].y + pts[17].y) / 5,
      };
      return { handedness, landmarks: pts, palmCenter };
    });
  }
}
