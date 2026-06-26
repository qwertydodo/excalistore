import axios from "axios";
import { GOOGLE_API_ORIGIN } from "@/shared/config";

export const googleClient = axios.create({
  baseURL: GOOGLE_API_ORIGIN,
  timeout: 15_000,
});
