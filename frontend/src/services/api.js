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

const isDev = Boolean(import.meta.env.DEV);

/** Centralized API client for the FastAPI backend (`/api` routes). */
export const api = {
  async getListings(params) {
    if (isDev && params?.map_mode) {
      console.debug("[api:listings:map_mode:request]", params);
    }
    try {
      const { data } = await client.get("/listings", { params });
      if (isDev && params?.map_mode) {
        const count = Array.isArray(data?.listings) ? data.listings.length : 0;
        console.debug("[api:listings:map_mode:success]", { count });
      }
      return data;
    } catch (error) {
      if (isDev && params?.map_mode) {
        console.error("[api:listings:map_mode:error]", {
          message: error?.message,
          detail: error?.response?.data?.detail,
          status: error?.response?.status,
        });
      }
      throw error;
    }
  },

  async getMapPois(params) {
    if (isDev) {
      console.debug("[api:map_pois:request]", params);
    }
    try {
      const { data } = await client.get("/map/pois", { params });
      if (isDev) {
        const count = Array.isArray(data?.pois) ? data.pois.length : 0;
        console.debug("[api:map_pois:success]", {
          count,
          cached: Boolean(data?.cached),
          upstream: data?.upstream ?? null,
          fallback_used: Boolean(data?.fallback_used),
        });
      }
      return data;
    } catch (error) {
      if (isDev) {
        console.error("[api:map_pois:error]", {
          message: error?.message,
          detail: error?.response?.data?.detail,
          status: error?.response?.status,
        });
      }
      throw error;
    }
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

  async getProfile(userId) {
    const { data } = await client.get("/profile", { params: { user_id: userId } });
    return data;
  },

  async updateProfile(body) {
    const { data } = await client.put("/profile", body);
    return data;
  },

  async getUserFavorites(userId) {
    const { data } = await client.get(`/users/${userId}/favorites`);
    return data;
  },

  async addUserFavorite(userId, listingId) {
    const { data } = await client.post(
      `/users/${userId}/favorites/${listingId}`,
    );
    return data;
  },

  async removeUserFavorite(userId, listingId) {
    const { data } = await client.delete(
      `/users/${userId}/favorites/${listingId}`,
    );
    return data;
  },

  async getUserStays(userId) {
    const { data } = await client.get(`/users/${userId}/stays`);
    return data;
  },

  async getUserReviewConfig(userId) {
    const { data } = await client.get(`/users/${userId}/stays/review-config`);
    return data;
  },

  async getUserStayReview(userId, listingId) {
    const { data } = await client.get(`/users/${userId}/stays/${listingId}/review`);
    return data;
  },

  async saveUserReview(userId, listingId, payload) {
    const { data } = await client.post(`/users/${userId}/stays/${listingId}/review`, payload);
    return data;
  },

  async removeUserReview(userId, listingId) {
    const { data } = await client.delete(`/users/${userId}/stays/${listingId}/review`);
    return data;
  },

  async getListingStayReviews(listingId) {
    const { data } = await client.get(`/listings/${listingId}/stay-reviews`);
    return data;
  },

  async addUserStay(userId, listingId) {
    const { data } = await client.post(`/users/${userId}/stays/${listingId}`);
    return data;
  },

  async removeUserStay(userId, listingId) {
    const { data } = await client.delete(`/users/${userId}/stays/${listingId}`);
    return data;
  },

  /** @param {number[]} listingIds */
  async getUserListingFlags(userId, listingIds) {
    const ids = Array.isArray(listingIds)
      ? listingIds.filter((x) => x != null).join(",")
      : "";
    const { data } = await client.get(`/users/${userId}/listing-flags`, {
      params: { listing_ids: ids },
    });
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

  /** Fetch user's vibe-tag preferences. */
  async getPreferences(userId) {
    const { data } = await client.get(`/auth/preferences/${userId}`);
    return data;
  },

  // ============ Admin APIs ============

  /** @param {{ username: string, password: string }} credentials */
  async adminLogin(credentials) {
    const { data } = await client.post("/admin/login", credentials);
    return data;
  },

  // --- Scenic Spots ---
  async getScenics() {
    const { data } = await client.get("/admin/scenics");
    return data;
  },

  async createScenic(scenic) {
    const { data } = await client.post("/admin/scenics", scenic);
    return data;
  },

  async updateScenic(scenicId, scenic) {
    const { data } = await client.put(`/admin/scenics/${scenicId}`, scenic);
    return data;
  },

  async deleteScenic(scenicId) {
    const { data } = await client.delete(`/admin/scenics/${scenicId}`);
    return data;
  },

  // --- Strategy Config ---
  async getStrategy() {
    const { data } = await client.get("/admin/strategy");
    return data;
  },

  async updateStrategy(strategy) {
    const { data } = await client.put("/admin/strategy", strategy);
    return data;
  },

  // --- Sync Logs ---
  async getSyncLogs() {
    const { data } = await client.get("/admin/sync-logs");
    return data;
  },

  async createSyncLog(log) {
    const { data } = await client.post("/admin/sync-logs", log);
    return data;
  },
};
