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
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
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

const loginView = document.querySelector("#login-view");
const appView = document.querySelector("#app-view");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const resultsEl = document.querySelector("#results");
const resultsStatusEl = document.querySelector("#results-status");
const watchlistEl = document.querySelector("#watchlist");
const watchlistCountEl = document.querySelector("#watchlist-count");
const authStatusEl = document.querySelector("#auth-status");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const friendSearchForm = document.querySelector("#friend-search-form");
const friendSearchInput = document.querySelector("#friend-search-input");
const friendSearchStatusEl = document.querySelector("#friend-search-status");
const friendSearchResultsEl = document.querySelector("#friend-search-results");
const friendsListEl = document.querySelector("#friends-list");
const friendsCountEl = document.querySelector("#friends-count");
const friendWatchlistEl = document.querySelector("#friend-watchlist");
const friendWatchlistStatusEl = document.querySelector("#friend-watchlist-status");
const comparisonSummaryEl = document.querySelector("#comparison-summary");

let currentUser = null;
let watchlist = [];
let friends = [];
let selectedFriendId = null;

renderWatchlist();
renderFriends();

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
    friends = [];
    selectedFriendId = null;
    loginButton.disabled = false;
    loginView.hidden = false;
    appView.hidden = true;
    renderWatchlist();
    renderFriends();
    clearFriendComparison();
    refreshResultButtons();
    return;
  }

  loginView.hidden = true;
  appView.hidden = false;
  authStatusEl.textContent = `Signed in as ${user.displayName || user.email}`;
  loginButton.disabled = false;

  try {
    await saveUserProfile(user);
  } catch (error) {
    authStatusEl.textContent = "Signed in, but your profile could not be saved.";
  }

  watchlist = loadWatchlist();
  renderWatchlist();
  await Promise.all([loadFirestoreWatchlist(), loadFriends()]);
  refreshResultButtons();
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const queryText = searchInput.value.trim();

  if (!queryText) {
    return;
  }

  resultsStatusEl.textContent = `Searching for "${queryText}"...`;
  resultsEl.innerHTML = "";

  try {
    const movies = await searchMovies(queryText);
    renderResults(movies, queryText);
  } catch (error) {
    resultsStatusEl.textContent = error.message;
  }
});

resultsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add-id]");

  if (!button) {
    return;
  }

  try {
    if (!currentUser) {
      throw new Error("Sign in with Google before saving movies.");
    }

    const movie = JSON.parse(button.dataset.movie);
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

friendSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const searchTerm = friendSearchInput.value.trim().toLowerCase();

  if (!searchTerm) {
    return;
  }

  friendSearchStatusEl.textContent = `Searching for "${searchTerm}"...`;
  friendSearchResultsEl.innerHTML = "";

  try {
    const users = await searchUsers(searchTerm);
    renderFriendSearchResults(users);
  } catch (error) {
    friendSearchStatusEl.textContent = "Could not search users. Check your Firestore rules.";
  }
});

friendSearchResultsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add-friend-id]");

  if (!button) {
    return;
  }

  try {
    button.disabled = true;
    button.textContent = "Adding...";
    await addFriend(button.dataset.addFriendId);
    friendSearchStatusEl.textContent = "Friend added.";
  } catch (error) {
    friendSearchStatusEl.textContent = error.message;
  }
});

friendsListEl.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view-friend-id]");
  const removeButton = event.target.closest("[data-remove-friend-id]");

  if (viewButton) {
    await viewFriendWatchlist(viewButton.dataset.viewFriendId);
  }

  if (removeButton) {
    await removeFriend(removeButton.dataset.removeFriendId);
  }
});

async function searchMovies(queryText) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({ apikey: API_KEY, s: queryText, type: "movie" });

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

function renderResults(movies, queryText) {
  resultsStatusEl.textContent = `${movies.length} result${movies.length === 1 ? "" : "s"} for "${queryText}".`;
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
          <p class="movie-meta">${escapeHtml(movie.Year)} - ${escapeHtml(movie.Type)}</p>
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

async function saveUserProfile(user) {
  const displayName = user.displayName || user.email || "Movie fan";
  const email = user.email || "";

  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      displayName,
      email,
      photoURL: user.photoURL || "",
      displayNameLower: displayName.toLowerCase(),
      emailLower: email.toLowerCase(),
      searchTerms: buildSearchTerms(displayName, email),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function loadFirestoreWatchlist() {
  if (!currentUser) {
    return;
  }

  try {
    const snapshot = await getDocs(getWatchlistCollection(currentUser.uid));
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

  await setDoc(doc(getWatchlistCollection(currentUser.uid), movie.imdbID), savedMovie);

  watchlist = [savedMovie, ...watchlist];
  saveWatchlist();
  renderWatchlist();
}

async function removeFromWatchlist(imdbID) {
  if (!currentUser) {
    throw new Error("Sign in with Google before removing movies.");
  }

  await deleteDoc(doc(getWatchlistCollection(currentUser.uid), imdbID));

  watchlist = watchlist.filter((movie) => movie.imdbID !== imdbID);
  saveWatchlist();
  renderWatchlist();

  const resultButton = resultsEl.querySelector(`[data-add-id="${CSS.escape(imdbID)}"]`);

  if (resultButton) {
    renderResultsButtonState(resultButton, false);
  }
}

async function searchUsers(searchTerm) {
  if (!currentUser) {
    throw new Error("Sign in before searching for friends.");
  }

  const usersQuery = query(
    collection(db, "users"),
    where("searchTerms", "array-contains", searchTerm),
    limit(10),
  );
  const snapshot = await getDocs(usersQuery);

  return snapshot.docs
    .map((userDoc) => userDoc.data())
    .filter((user) => user.uid !== currentUser.uid);
}

function renderFriendSearchResults(users) {
  friendSearchStatusEl.textContent = `${users.length} user${users.length === 1 ? "" : "s"} found.`;

  if (users.length === 0) {
    friendSearchResultsEl.innerHTML = '<p class="empty-state">No matching users yet.</p>';
    return;
  }

  friendSearchResultsEl.innerHTML = users.map(renderSearchPersonCard).join("");
}

function renderSearchPersonCard(user) {
  const isFriend = friends.some((friend) => friend.uid === user.uid);

  return `
    <article class="person-card">
      ${renderPersonMain(user)}
      <div class="person-actions">
        <button
          class="${isFriend ? "secondary" : ""}"
          type="button"
          data-add-friend-id="${escapeAttribute(user.uid)}"
          ${isFriend ? "disabled" : ""}
        >
          ${isFriend ? "Added" : "Add friend"}
        </button>
      </div>
    </article>
  `;
}

async function loadFriends() {
  if (!currentUser) {
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, "users", currentUser.uid, "friends"));
    friends = snapshot.docs
      .map((friendDoc) => friendDoc.data())
      .sort((firstFriend, secondFriend) => firstFriend.displayName.localeCompare(secondFriend.displayName));
    renderFriends();
  } catch (error) {
    friendsListEl.innerHTML = '<p class="empty-state">Could not load friends. Check your Firestore rules.</p>';
  }
}

function renderFriends() {
  friendsCountEl.textContent = `${friends.length} friend${friends.length === 1 ? "" : "s"} added`;

  if (friends.length === 0) {
    friendsListEl.innerHTML = '<p class="empty-state">Add a friend to compare watchlists.</p>';
    return;
  }

  friendsListEl.innerHTML = friends
    .map(
      (friend) => `
        <article class="person-card ${selectedFriendId === friend.uid ? "active" : ""}">
          ${renderPersonMain(friend)}
          <div class="person-actions">
            <button type="button" data-view-friend-id="${escapeAttribute(friend.uid)}">View</button>
            <button class="danger" type="button" data-remove-friend-id="${escapeAttribute(friend.uid)}">Remove</button>
          </div>
        </article>
      `,
    )
    .join("");
}

async function addFriend(friendUid) {
  if (!currentUser) {
    throw new Error("Sign in before adding friends.");
  }

  const friendSnapshot = await getDoc(doc(db, "users", friendUid));

  if (!friendSnapshot.exists()) {
    throw new Error("That user could not be found.");
  }

  const friend = friendSnapshot.data();
  const friendData = {
    uid: friend.uid,
    displayName: friend.displayName,
    email: friend.email,
    photoURL: friend.photoURL || "",
    addedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "users", currentUser.uid, "friends", friend.uid), friendData);
  friends = [friendData, ...friends.filter((savedFriend) => savedFriend.uid !== friend.uid)].sort(
    (firstFriend, secondFriend) => firstFriend.displayName.localeCompare(secondFriend.displayName),
  );
  renderFriends();

  const searchTerm = friendSearchInput.value.trim().toLowerCase();

  if (searchTerm) {
    renderFriendSearchResults(await searchUsers(searchTerm));
  }
}

async function removeFriend(friendUid) {
  await deleteDoc(doc(db, "users", currentUser.uid, "friends", friendUid));
  friends = friends.filter((friend) => friend.uid !== friendUid);

  if (selectedFriendId === friendUid) {
    selectedFriendId = null;
    clearFriendComparison();
  }

  renderFriends();
}

async function viewFriendWatchlist(friendUid) {
  const friend = friends.find((savedFriend) => savedFriend.uid === friendUid);

  if (!friend) {
    return;
  }

  selectedFriendId = friendUid;
  renderFriends();
  friendWatchlistStatusEl.textContent = `Loading ${friend.displayName}'s watchlist...`;
  friendWatchlistEl.innerHTML = "";
  comparisonSummaryEl.innerHTML = "";

  try {
    const snapshot = await getDocs(getWatchlistCollection(friendUid));
    const friendWatchlist = snapshot.docs
      .map((watchlistDoc) => watchlistDoc.data())
      .sort((firstMovie, secondMovie) => secondMovie.savedAtMillis - firstMovie.savedAtMillis);
    const commonMovies = getCommonMovies(friendWatchlist);

    friendWatchlistStatusEl.textContent = `${friend.displayName} has ${friendWatchlist.length} film${friendWatchlist.length === 1 ? "" : "s"} saved.`;
    renderComparisonSummary(friend, commonMovies);
    renderFriendWatchlist(friendWatchlist, commonMovies);
  } catch (error) {
    friendWatchlistStatusEl.textContent = "Could not load this friend's watchlist.";
  }
}

function renderComparisonSummary(friend, commonMovies) {
  comparisonSummaryEl.innerHTML = `
    <h3>${commonMovies.length} film${commonMovies.length === 1 ? "" : "s"} in common with ${escapeHtml(friend.displayName)}</h3>
    <p>${commonMovies.length > 0 ? commonMovies.map((movie) => escapeHtml(movie.Title)).join(", ") : "No overlap yet. Add more films to find a match."}</p>
  `;
}

function renderFriendWatchlist(friendWatchlist, commonMovies) {
  if (friendWatchlist.length === 0) {
    friendWatchlistEl.innerHTML = '<p class="empty-state">This friend has not saved any films yet.</p>';
    return;
  }

  const commonIds = new Set(commonMovies.map((movie) => movie.imdbID));
  friendWatchlistEl.innerHTML = friendWatchlist
    .map((movie) => renderFriendMovieCard(movie, commonIds.has(movie.imdbID)))
    .join("");
}

function renderFriendMovieCard(movie, isCommon) {
  return `
    <article class="movie-card">
      ${renderPoster(movie)}
      <div class="movie-body">
        <div>
          <h3 class="movie-title">${escapeHtml(movie.Title)}</h3>
          <p class="movie-meta">${escapeHtml(movie.Year)}${isCommon ? " - In common" : ""}</p>
        </div>
      </div>
    </article>
  `;
}

function getCommonMovies(friendWatchlist) {
  const myMovieIds = new Set(watchlist.map((movie) => movie.imdbID));
  return friendWatchlist.filter((movie) => myMovieIds.has(movie.imdbID));
}

function clearFriendComparison() {
  friendWatchlistStatusEl.textContent = "Choose a friend to compare watchlists.";
  comparisonSummaryEl.innerHTML = "";
  friendWatchlistEl.innerHTML = "";
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

function renderPersonMain(user) {
  return `
    <div class="person-main">
      ${renderAvatar(user)}
      <div class="person-details">
        <h3>${escapeHtml(user.displayName || "Movie fan")}</h3>
        <p>${escapeHtml(user.email || "No email shared")}</p>
      </div>
    </div>
  `;
}

function renderAvatar(user) {
  if (user.photoURL) {
    return `<div class="avatar"><img src="${escapeAttribute(user.photoURL)}" alt="${escapeAttribute(user.displayName || "User")} avatar" /></div>`;
  }

  return `<div class="avatar">${escapeHtml((user.displayName || user.email || "?").charAt(0).toUpperCase())}</div>`;
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

function getWatchlistCollection(userId) {
  return collection(db, "users", userId, "watchlist");
}

function buildSearchTerms(displayName, email) {
  const terms = new Set();
  const textParts = `${displayName} ${email}`.toLowerCase().split(/[^a-z0-9@.]+/);

  textParts.forEach((part) => {
    for (let index = 1; index <= part.length; index += 1) {
      terms.add(part.slice(0, index));
    }
  });

  return [...terms].filter(Boolean).slice(0, 120);
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
