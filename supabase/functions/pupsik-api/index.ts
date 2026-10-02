import admin from "./generated/api/admin.js";
import external from "./generated/api/external.js";
import movieRatings from "./generated/api/movie-ratings.js";
import trailerRatings from "./generated/api/trailer-ratings.js";
import trailerWatchlist from "./generated/api/trailer-watchlist.js";
import boostyReviews from "./generated/api/boosty-reviews.js";
import boostyReviewImage from "./generated/api/boosty-review-image.js";
import kinopoiskActors from "./generated/api/kinopoisk-actors.js";
import preview from "./generated/api/preview.js";
import translateDescription from "./generated/api/translate-description.js";
import { createRouter } from "./router.js";

Deno.serve(createRouter({
  admin,
  external,
  preview,
  "movie-ratings": movieRatings,
  "trailer-ratings": trailerRatings,
  "trailer-watchlist": trailerWatchlist,
  "boosty-reviews": boostyReviews,
  "boosty-review-image": boostyReviewImage,
  "kinopoisk-actors": kinopoiskActors,
  "translate-description": translateDescription,
}));
