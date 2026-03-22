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

const client = axios.create({
  baseURL: "http://127.0.0.1:8000/api",
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
};
