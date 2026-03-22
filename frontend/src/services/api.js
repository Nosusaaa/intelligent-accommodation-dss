import axios from "axios";

/** FastAPI `List[str]` expects repeated keys: `vibe_tags=a&vibe_tags=b`. */
function serializeParams(params) {
  const usp = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item === undefined || item === null) continue;
        const s = String(item);
        if (s !== "") usp.append(key, s);
      }
    } else {
      usp.append(key, String(raw));
    }
  }
  return usp.toString();
}

/**
 * Default `/api` uses the Vite dev/preview proxy → FastAPI on :8000 (see `vite.config.js`).
 * Override with `VITE_API_BASE_URL` (e.g. `http://127.0.0.1:8000/api`) if you serve the UI without a proxy.
 */
const apiBase =
  typeof import.meta.env.VITE_API_BASE_URL === "string" &&
  import.meta.env.VITE_API_BASE_URL.trim() !== ""
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
    : "/api";

const client = axios.create({
  baseURL: apiBase,
  paramsSerializer: { serialize: serializeParams },
});

/** Centralized API client for the FastAPI backend (`/api` routes). */
export const api = {
  async getListings(params) {
    const { data } = await client.get("/listings", { params });
    return data;
  },

  async getListingById(id) {
    const { data } = await client.get(`/listings/${id}`);
    return data;
  },

  async getListingForecast(id) {
    const { data } = await client.get(`/listings/${id}/forecast`);
    return data;
  },

  async getListingReviews(id) {
    const { data } = await client.get(`/listings/${id}/reviews`);
    return data;
  },

  /** @param {{ email: string, password: string }} credentials */
  async login(credentials) {
    const { data } = await client.post("/auth/login", credentials);
    return data;
  },

  /** @param {{ email: string, password: string }} credentials */
  async signup(credentials) {
    const { data } = await client.post("/auth/signup", credentials);
    return data;
  },

  /** Fetch 8 random rooms with vibe tags for onboarding swipe cards. */
  async getOnboardingRooms() {
    const { data } = await client.get("/onboarding/rooms");
    return data;
  },

  /**
   * Save onboarding vibe-tag preferences for a user.
   * @param {{ user_id: number, tag_scores: Record<string, number> }} body
   */
  async savePreferences(body) {
    const { data } = await client.post("/auth/preferences", body);
    return data;
  },
};
