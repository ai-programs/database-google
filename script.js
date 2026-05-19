import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  deleteField,
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
const appViews = document.querySelectorAll("[data-view]");
const viewButtons = document.querySelectorAll("[data-view-target]");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const resultsEl = document.querySelector("#results");
const resultsStatusEl = document.querySelector("#results-status");
const watchlistEl = document.querySelector("#watchlist");
const watchlistCountEl = document.querySelector("#watchlist-count");
const authStatusEl = document.querySelector("#auth-status");
const loginStatusEl = document.querySelector("#login-status");
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
const homeWatchlistCountEl = document.querySelector("#home-watchlist-count");
const homeFriendsCountEl = document.querySelector("#home-friends-count");

let currentUser = null;
let watchlist = [];
let friends = [];
let friendships = [];
let pendingRequests = [];
let sentRequests = [];
let selectedFriendId = null;

renderWatchlist();
renderFriends();
showView("home");

loginStatusEl.textContent = "Sign in to continue.";

getRedirectResult(auth).catch((error) => {
  loginStatusEl.textContent = getAuthErrorMessage(error);
  loginButton.disabled = false;
});

loginButton.addEventListener("click", async () => {
  try {
    loginButton.disabled = true;
    loginStatusEl.textContent = "Opening Google sign-in...";
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (error.code === "auth/popup-blocked" || error.code === "auth/popup-closed-by-user") {
      loginStatusEl.textContent = "Redirecting to Google sign-in...";
      await signInWithRedirect(auth, googleProvider);
      return;
    }

    loginStatusEl.textContent = getAuthErrorMessage(error);
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.viewTarget);
  });
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    watchlist = [];
    friends = [];
    friendships = [];
    pendingRequests = [];
    sentRequests = [];
    selectedFriendId = null;
    loginButton.disabled = false;
    loginStatusEl.textContent = "Sign in to continue.";
    loginView.hidden = false;
    appView.hidden = true;
    showView("home");
    renderWatchlist();
    renderFriends();
    clearFriendComparison();
    refreshResultButtons();
    return;
  }

  loginView.hidden = true;
  appView.hidden = false;
  showView("home");
  authStatusEl.textContent = `Signed in as ${user.displayName || "Google account"}`;
  loginButton.disabled = false;

  try {
    await saveUserProfile(user);
  } catch (error) {
    authStatusEl.textContent = "Signed in, but your profile could not be saved.";
  }

  watchlist = loadWatchlist();
  renderWatchlist();
  await Promise.all([loadFirestoreWatchlist(), loadFriendships()]);
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
    await sendFriendRequest(button.dataset.addFriendId);
    friendSearchStatusEl.textContent = "Friend request sent.";
  } catch (error) {
    friendSearchStatusEl.textContent = error.message;
  }
});

friendsListEl.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view-friend-id]");
  const removeButton = event.target.closest("[data-remove-friend-id]");
  const acceptButton = event.target.closest("[data-accept-request-id]");
  const rejectButton = event.target.closest("[data-reject-request-id]");

  if (viewButton) {
    await viewFriendWatchlist(viewButton.dataset.viewFriendId);
  }

  if (removeButton) {
    await removeFriend(removeButton.dataset.removeFriendId);
  }

  if (acceptButton) {
    await acceptFriendRequest(acceptButton.dataset.acceptRequestId);
  }

  if (rejectButton) {
    await rejectFriendRequest(rejectButton.dataset.rejectRequestId);
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
  homeWatchlistCountEl.textContent = watchlist.length;

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
  const displayName = user.displayName || "Movie fan";
  const username = createUsername(displayName, user.uid);

  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      displayName,
      username,
      displayNameLower: displayName.toLowerCase(),
      usernameLower: username.toLowerCase(),
      searchTerms: buildSearchTerms(displayName, username),
      email: deleteField(),
      emailLower: deleteField(),
      photoURL: deleteField(),
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
  const friendship = getFriendshipWith(user.uid);
  const buttonState = getFriendRequestButtonState(friendship);

  return `
    <article class="person-card">
      ${renderPersonMain(user)}
      <div class="person-actions">
        <button
          class="${buttonState.disabled ? "secondary" : ""}"
          type="button"
          data-add-friend-id="${escapeAttribute(user.uid)}"
          ${buttonState.disabled ? "disabled" : ""}
        >
          ${buttonState.label}
        </button>
      </div>
    </article>
  `;
}

async function loadFriendships() {
  if (!currentUser) {
    return;
  }

  try {
    const friendshipsQuery = query(
      collection(db, "friendships"),
      where("participants", "array-contains", currentUser.uid),
    );
    const snapshot = await getDocs(friendshipsQuery);

    friendships = snapshot.docs.map((friendshipDoc) => ({
      id: friendshipDoc.id,
      ...friendshipDoc.data(),
    }));
    friends = friendships
      .filter((friendship) => friendship.status === "accepted")
      .map(getOtherFriendProfile)
      .sort(sortByDisplayName);
    pendingRequests = friendships.filter(
      (friendship) => friendship.status === "pending" && friendship.recipientUid === currentUser.uid,
    );
    sentRequests = friendships.filter(
      (friendship) => friendship.status === "pending" && friendship.requesterUid === currentUser.uid,
    );
    renderFriends();
  } catch (error) {
    friendsListEl.innerHTML = '<p class="empty-state">Could not load friend requests. Check your Firestore rules.</p>';
  }
}

function renderFriends() {
  friendsCountEl.textContent = `${friends.length} friend${friends.length === 1 ? "" : "s"} added`;
  homeFriendsCountEl.textContent = friends.length;

  if (friends.length === 0 && pendingRequests.length === 0 && sentRequests.length === 0) {
    friendsListEl.innerHTML = '<p class="empty-state">Send or approve a friend request to compare watchlists.</p>';
    return;
  }

  friendsListEl.innerHTML = `
    ${renderPendingRequests()}
    ${renderSentRequests()}
    ${renderAcceptedFriends()}
  `;
}

function renderPendingRequests() {
  if (pendingRequests.length === 0) {
    return "";
  }

  return `
    <div class="request-group">
      <h3>Requests to approve</h3>
      ${pendingRequests
        .map((friendship) => {
          const requester = friendship.requesterProfile;
          return `
            <article class="person-card">
              ${renderPersonMain(requester)}
              <div class="person-actions">
                <button type="button" data-accept-request-id="${escapeAttribute(friendship.id)}">Approve</button>
                <button class="secondary" type="button" data-reject-request-id="${escapeAttribute(friendship.id)}">Reject</button>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSentRequests() {
  if (sentRequests.length === 0) {
    return "";
  }

  return `
    <div class="request-group">
      <h3>Requests sent</h3>
      ${sentRequests
        .map((friendship) => `
          <article class="person-card">
            ${renderPersonMain(friendship.recipientProfile)}
            <div class="person-actions">
              <button class="secondary" type="button" disabled>Pending</button>
            </div>
          </article>
        `)
        .join("")}
    </div>
  `;
}

function renderAcceptedFriends() {
  if (friends.length === 0) {
    return "";
  }

  return `
    <div class="request-group">
      <h3>Accepted friends</h3>
      ${friends
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
        .join("")}
    </div>
  `;
}

async function sendFriendRequest(friendUid) {
  if (!currentUser) {
    throw new Error("Sign in before sending friend requests.");
  }

  if (friendUid === currentUser.uid) {
    throw new Error("You cannot add yourself as a friend.");
  }

  const friendSnapshot = await getDoc(doc(db, "users", friendUid));

  if (!friendSnapshot.exists()) {
    throw new Error("That user could not be found.");
  }

  const friend = friendSnapshot.data();
  const friendshipId = getFriendshipId(currentUser.uid, friend.uid);

  await setDoc(
    doc(db, "friendships", friendshipId),
    {
      participants: [currentUser.uid, friend.uid].sort(),
      requesterUid: currentUser.uid,
      recipientUid: friend.uid,
      requesterProfile: getCurrentUserPublicProfile(),
      recipientProfile: getPublicProfile(friend),
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await loadFriendships();

  const searchTerm = friendSearchInput.value.trim().toLowerCase();

  if (searchTerm) {
    renderFriendSearchResults(await searchUsers(searchTerm));
  }
}

async function acceptFriendRequest(friendshipId) {
  const friendship = friendships.find((savedFriendship) => savedFriendship.id === friendshipId);

  if (!friendship || friendship.recipientUid !== currentUser.uid) {
    return;
  }

  await setDoc(
    doc(db, "friendships", friendshipId),
    {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await loadFriendships();
}

async function rejectFriendRequest(friendshipId) {
  const friendship = friendships.find((savedFriendship) => savedFriendship.id === friendshipId);

  if (!friendship || friendship.recipientUid !== currentUser.uid) {
    return;
  }

  await setDoc(
    doc(db, "friendships", friendshipId),
    {
      status: "rejected",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await loadFriendships();
}

async function removeFriend(friendUid) {
  await deleteDoc(doc(db, "friendships", getFriendshipId(currentUser.uid, friendUid)));
  friendships = friendships.filter((friendship) => friendship.id !== getFriendshipId(currentUser.uid, friendUid));
  friends = friends.filter((friend) => friend.uid !== friendUid);

  if (selectedFriendId === friendUid) {
    selectedFriendId = null;
    clearFriendComparison();
  }

  renderFriends();
}

async function viewFriendWatchlist(friendUid) {
  if (!friends.some((savedFriend) => savedFriend.uid === friendUid)) {
    friendWatchlistStatusEl.textContent = "Only accepted friends can share watchlists.";
    return;
  }

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

function showView(viewName) {
  appViews.forEach((view) => {
    view.classList.toggle("active", view.dataset.view === viewName);
  });

  viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === viewName);
  });
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
        <p>@${escapeHtml(user.username || "movie-fan")}</p>
      </div>
    </div>
  `;
}

function renderAvatar(user) {
  return `<div class="avatar">${escapeHtml((user.displayName || user.username || "?").charAt(0).toUpperCase())}</div>`;
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

function getCurrentUserPublicProfile() {
  const displayName = currentUser.displayName || "Movie fan";
  const username = createUsername(displayName, currentUser.uid);

  return {
    uid: currentUser.uid,
    displayName,
    username,
  };
}

function getPublicProfile(user) {
  return {
    uid: user.uid,
    displayName: user.displayName || "Movie fan",
    username: user.username || createUsername(user.displayName || "Movie fan", user.uid),
  };
}

function getFriendshipWith(userId) {
  return friendships.find((friendship) => friendship.participants.includes(userId));
}

function getFriendRequestButtonState(friendship) {
  if (!friendship || friendship.status === "rejected") {
    return { label: "Send request", disabled: false };
  }

  if (friendship.status === "accepted") {
    return { label: "Friends", disabled: true };
  }

  if (friendship.requesterUid === currentUser.uid) {
    return { label: "Request sent", disabled: true };
  }

  return { label: "Respond in Friends", disabled: true };
}

function getOtherFriendProfile(friendship) {
  return friendship.requesterUid === currentUser.uid
    ? friendship.recipientProfile
    : friendship.requesterProfile;
}

function getFriendshipId(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join("_");
}

function sortByDisplayName(firstUser, secondUser) {
  return firstUser.displayName.localeCompare(secondUser.displayName);
}

function createUsername(displayName, uid) {
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

  return `${slug || "movie-fan"}-${uid.slice(0, 5).toLowerCase()}`;
}

function buildSearchTerms(displayName, username) {
  const terms = new Set();
  const textParts = `${displayName} ${username}`.toLowerCase().split(/[^a-z0-9-]+/);

  textParts.forEach((part) => {
    for (let index = 1; index <= part.length; index += 1) {
      terms.add(part.slice(0, index));
    }
  });

  return [...terms].filter(Boolean).slice(0, 120);
}

function getAuthErrorMessage(error) {
  if (error.code === "auth/unauthorized-domain") {
    return "This domain is not authorized in Firebase Authentication.";
  }

  if (error.code === "auth/popup-closed-by-user") {
    return "Google sign-in was closed before it finished.";
  }

  return "Google sign-in failed. Check the browser console for details.";
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
