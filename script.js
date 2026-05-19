import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const API_KEY = "21466d0f";
const API_URL = "https://www.omdbapi.com/";

const firebaseConfig = {
  apiKey: "AIzaSyA765XF3VSvH0OoiehKPjzTLfz1dHO2sQI",
  authDomain: "auth-cbedf.firebaseapp.com",
  projectId: "auth-cbedf",
  storageBucket: "auth-cbedf.firebasestorage.app",
  messagingSenderId: "321056477970",
  appId: "1:321056477970:web:274a381b4b2b74fbe519cb",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const resultsEl = document.querySelector("#results");
const resultsStatusEl = document.querySelector("#results-status");
const watchlistEl = document.querySelector("#watchlist");
const watchlistCountEl = document.querySelector("#watchlist-count");
const authStatusEl = document.querySelector("#auth-status");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");

let currentUser = null;
let watchlist = [];

renderWatchlist();

loginButton.addEventListener("click", async () => {
  try {
    loginButton.disabled = true;
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    authStatusEl.textContent = "Google sign-in was cancelled or failed.";
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    watchlist = [];
    authStatusEl.textContent = "Sign in to save your watchlist.";
    loginButton.hidden = false;
    loginButton.disabled = false;
    logoutButton.hidden = true;
    renderWatchlist();
    refreshResultButtons();
    return;
  }

  authStatusEl.textContent = `Signed in as ${user.displayName || user.email}`;
  loginButton.hidden = true;
  logoutButton.hidden = false;
  watchlist = loadWatchlist();
  renderWatchlist();
  await loadFirestoreWatchlist();
  refreshResultButtons();
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = searchInput.value.trim();

  if (!query) {
    return;
  }

  resultsStatusEl.textContent = `Searching for "${query}"...`;
  resultsEl.innerHTML = "";

  try {
    const movies = await searchMovies(query);
    renderResults(movies, query);
  } catch (error) {
    resultsStatusEl.textContent = error.message;
  }
});

resultsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add-id]");

  if (!button) {
    return;
  }

  const movie = JSON.parse(button.dataset.movie);

  try {
    if (!currentUser) {
      throw new Error("Sign in with Google before saving movies.");
    }

    button.disabled = true;
    button.textContent = "Saving...";
    await addToWatchlist(movie);
    renderResultsButtonState(button, true);
  } catch (error) {
    resultsStatusEl.textContent = error.message;
    renderResultsButtonState(button, false);
  }
});

watchlistEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-id]");

  if (!button) {
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "Removing...";
    await removeFromWatchlist(button.dataset.removeId);
  } catch (error) {
    resultsStatusEl.textContent = error.message;
    renderWatchlist();
  }
});

async function searchMovies(query) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({ apikey: API_KEY, s: query, type: "movie" });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not reach OMDb. Please try again.");
  }

  const data = await response.json();

  if (data.Response === "False") {
    throw new Error(data.Error || "No movies found.");
  }

  return data.Search;
}

function renderResults(movies, query) {
  resultsStatusEl.textContent = `${movies.length} result${movies.length === 1 ? "" : "s"} for "${query}".`;
  resultsEl.innerHTML = movies.map(renderMovieCard).join("");
}

function renderMovieCard(movie) {
  const isSaved = watchlist.some((savedMovie) => savedMovie.imdbID === movie.imdbID);
  const movieData = escapeAttribute(JSON.stringify(movie));

  return `
    <article class="movie-card">
      ${renderPoster(movie)}
      <div class="movie-body">
        <div>
          <h3 class="movie-title">${escapeHtml(movie.Title)}</h3>
          <p class="movie-meta">${escapeHtml(movie.Year)} • ${escapeHtml(movie.Type)}</p>
        </div>
        <button
          class="${isSaved ? "secondary" : ""}"
          type="button"
          data-add-id="${escapeAttribute(movie.imdbID)}"
          data-movie="${movieData}"
          ${isSaved ? "disabled" : ""}
        >
          ${isSaved ? "In watchlist" : "Add to watchlist"}
        </button>
      </div>
    </article>
  `;
}

function renderWatchlist() {
  watchlistCountEl.textContent = `${watchlist.length} film${watchlist.length === 1 ? "" : "s"} saved`;

  if (watchlist.length === 0) {
    watchlistEl.innerHTML = '<p class="empty-state">Your saved films will appear here.</p>';
    return;
  }

  watchlistEl.innerHTML = watchlist
    .map(
      (movie) => `
        <article class="watchlist-item">
          ${renderPoster(movie)}
          <div class="watchlist-details">
            <h3>${escapeHtml(movie.Title)}</h3>
            <p class="movie-type">${escapeHtml(movie.Year)}</p>
            <button class="danger" type="button" data-remove-id="${escapeAttribute(movie.imdbID)}">
              Remove
            </button>
          </div>
        </article>
      `,
    )
    .join("");
}

async function loadFirestoreWatchlist() {
  if (!currentUser) {
    return;
  }

  try {
    const snapshot = await getDocs(getWatchlistCollection());
    watchlist = snapshot.docs
      .map((watchlistDoc) => watchlistDoc.data())
      .sort((firstMovie, secondMovie) => secondMovie.savedAtMillis - firstMovie.savedAtMillis);
    saveWatchlist();
    renderWatchlist();
  } catch (error) {
    resultsStatusEl.textContent = "Could not load your Firestore watchlist. Check your Firebase rules.";
  }
}

async function addToWatchlist(movie) {
  if (!currentUser) {
    throw new Error("Sign in with Google before saving movies.");
  }

  if (watchlist.some((savedMovie) => savedMovie.imdbID === movie.imdbID)) {
    return;
  }

  const savedMovie = {
    imdbID: movie.imdbID,
    Title: movie.Title,
    Year: movie.Year,
    Type: movie.Type,
    Poster: movie.Poster,
    savedAt: serverTimestamp(),
    savedAtMillis: Date.now(),
  };

  await setDoc(doc(getWatchlistCollection(), movie.imdbID), savedMovie);

  watchlist = [savedMovie, ...watchlist];
  saveWatchlist();
  renderWatchlist();
}

async function removeFromWatchlist(imdbID) {
  if (!currentUser) {
    throw new Error("Sign in with Google before removing movies.");
  }

  await deleteDoc(doc(getWatchlistCollection(), imdbID));

  watchlist = watchlist.filter((movie) => movie.imdbID !== imdbID);
  saveWatchlist();
  renderWatchlist();

  const resultButton = resultsEl.querySelector(`[data-add-id="${CSS.escape(imdbID)}"]`);

  if (resultButton) {
    renderResultsButtonState(resultButton, false);
  }
}

function renderResultsButtonState(button, isSaved) {
  button.textContent = isSaved ? "In watchlist" : "Add to watchlist";
  button.disabled = isSaved;
  button.classList.toggle("secondary", isSaved);
}

function refreshResultButtons() {
  resultsEl.querySelectorAll("[data-add-id]").forEach((button) => {
    const isSaved = watchlist.some((movie) => movie.imdbID === button.dataset.addId);
    renderResultsButtonState(button, isSaved);
  });
}

function renderPoster(movie) {
  if (!movie.Poster || movie.Poster === "N/A") {
    return '<div class="poster"><span class="poster-placeholder">No poster</span></div>';
  }

  return `
    <div class="poster">
      <img src="${escapeAttribute(movie.Poster)}" alt="${escapeAttribute(movie.Title)} poster" />
    </div>
  `;
}

function loadWatchlist() {
  if (!currentUser) {
    return [];
  }

  try {
    return JSON.parse(localStorage.getItem(`movie-watchlist-${currentUser.uid}`)) || [];
  } catch {
    return [];
  }
}

function saveWatchlist() {
  if (!currentUser) {
    return;
  }

  localStorage.setItem(`movie-watchlist-${currentUser.uid}`, JSON.stringify(watchlist));
}

function getWatchlistCollection() {
  return collection(db, "users", currentUser.uid, "watchlist");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };

    return entities[character];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
