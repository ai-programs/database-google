# Movie Night

A small static web app for teaching students how to build a movie watchlist with:

- HTML, CSS, and vanilla JavaScript
- OMDb movie search
- Firebase Authentication with Google sign-in
- Firestore watchlists
- friend requests and accepted-friend watchlist comparison
- privacy/security discussion material for students

Live site:

```txt
https://ai-programs.github.io/database-google/
```

## Project Files

```txt
index.html                 App structure and views
styles.css                 Minimal black-and-white UI
script.js                  OMDb, Firebase Auth, Firestore, friends logic
SECURITY_AND_PRIVACY.md    Student-facing security/privacy guide
agents.md                  Context for future assistant/dev sessions
```

## Features

- Login-first screen with Google sign-in.
- Discreet signed-in top bar.
- Navigation tabs: Home, Search, Watchlist, Friends.
- Search OMDb for movies.
- Save/remove movies from your Firestore watchlist.
- Public app profile with generated username.
- No public email display.
- No Google profile photo display.
- Friend request flow with pending, accepted, and rejected states.
- Accepted friends can compare watchlists and see movies in common.

## Firebase Project

Firebase project currently used by the app:

```txt
projectId: auth-cbedf
authDomain: auth-cbedf.firebaseapp.com
```

Firebase config is in `script.js` because this is a static browser-only teaching project.

For a production app, avoid exposing unnecessary keys/secrets and move sensitive operations to backend code or Cloud Functions.

## OMDb

The OMDb API key is also in `script.js` for simplicity.

Current key:

```txt
21466d0f
```

## Local Development

Run a local server from the project folder:

```bash
python3 -m http.server 8000
```

Open:

```txt
http://localhost:8000
```

Do not rely on opening `index.html` directly from the filesystem. Firebase Auth and module imports work more reliably over HTTP.

## Firebase Authentication Setup

In Firebase Console:

```txt
Authentication > Sign-in method > Google > Enable
```

Authorized domains should include:

```txt
localhost
127.0.0.1
ai-programs.github.io
```

If testing from a local network IP, add that IP too, for example:

```txt
192.168.1.206
```

## Firestore Data Model

Profiles:

```txt
users/{uid}
  uid
  displayName
  username
  displayNameLower
  usernameLower
  searchTerms
  updatedAt
```

Watchlists:

```txt
users/{uid}/watchlist/{imdbID}
  imdbID
  Title
  Year
  Type
  Poster
  savedAt
  savedAtMillis
```

Friendships:

```txt
friendships/{uidA_uidB}
  participants: [uidA, uidB]
  requesterUid
  recipientUid
  requesterProfile
  recipientProfile
  status: "pending" | "accepted" | "rejected"
  createdAt
  acceptedAt
  updatedAt
```

Important privacy choice:

- The app should not store `email`, `emailLower`, or `photoURL` in public profile documents.
- The current code removes those old fields on next login with `deleteField()`.

## Firestore Rules

The project needs rules that allow:

- users to manage their own profile
- users to manage their own watchlist
- accepted friends to read each other's watchlists
- signed-in users to create pending friend requests
- request recipients to approve/reject requests

Use the latest rules discussed in the session as the starting point. For a production-grade version, move friendship state transitions to Cloud Functions because Firestore rules are limited for complex validation.

## GitHub Pages

The app is deployed with GitHub Pages from this repository.

After pushing changes, GitHub Pages can take a short time to update.

If the browser still shows old behavior, hard refresh or change the cache-busting query in `index.html`:

```html
<link rel="stylesheet" href="styles.css?v=..." />
<script type="module" src="script.js?v=..."></script>
```

## Security and Privacy Teaching Notes

Read:

```txt
SECURITY_AND_PRIVACY.md
```

This document explains why students should think about:

- authentication vs authorization
- public vs private data
- why not to expose emails
- why not to use Google profile photos by default
- friend requests instead of one-way friends
- watchlists being private by default
- Firestore rules
- blocking, invites, abuse, and validation

## Current Limitations

- No user-chosen username UI yet.
- Generated usernames are based on display name + UID prefix.
- No blocking feature yet.
- No reporting feature yet.
- No account deletion cleanup yet.
- No invite link feature yet.
- Friend request validation is client + Firestore rules, not Cloud Functions.
- Existing old Firestore documents may need cleanup if created before the privacy refactor.

## Useful Commands

Check JavaScript syntax:

```bash
node --check script.js
```

Check git status:

```bash
git status --short
```

Push to GitHub:

```bash
git push origin main
```

## Remote

The repo uses an SSH host alias for the AI Programs GitHub account:

```txt
origin git@github-ai:ai-programs/database-google.git
```

The alias is configured in `~/.ssh/config` and uses `~/.ssh/id_ai_programs`.
