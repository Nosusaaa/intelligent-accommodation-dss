import axios from "axios";

const client = axios.create({
  baseURL: "http://127.0.0.1:8000/api",
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
