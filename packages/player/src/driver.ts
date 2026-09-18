/**
 * The two things the store cannot know how to do itself.
 *
 * A driver is whatever actually makes sound: expo-audio on the phone, an
 * `<audio>` element on the web. The store never imports either — it holds the
 * queue, the segment bounds and the repeat rules, calls these four methods,
 * and is told the result through `onStatus`.
 *
 * Keeping the seam this narrow is what makes the interesting half of the
 * player testable with a fake.
 */
export interface AudioDriver {
  /** Point at a URL and begin at `startAt` seconds on the file's clock. */
  load(url: string, startAt: number): void;
  play(): void;
  pause(): void;
  /** Absolute seconds into the file, not into the segment. */
  seek(seconds: number): void;
}

/**
 * Where the queue, the resume positions and the repeat mode persist.
 *
 * Async because React Native's storage is, and a synchronous interface cannot
 * be widened later without touching every caller. `localStorage` wraps in
 * three lines.
 */
export interface PlayerStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** What the driver reports back, on whatever interval it was configured with. */
export interface DriverStatus {
  /** Absolute seconds on the file's clock. */
  position: number;
  duration: number;
  playing: boolean;
}
