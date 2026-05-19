# Agent Notes

Use this file to quickly recover project context in a future session.

## Project Summary

This is a static teaching project using only:

- `index.html`
- `styles.css`
- `script.js`
- Firebase CDN modules
- OMDb API

No build tool, package manager, framework, or bundler is currently used.

## Current App

The app is called Movie Night.

It supports:

- Google sign-in with Firebase Auth
- OMDb movie search
- Firestore-backed personal watchlists
- generated public usernames
- friend requests
- accepted-friend watchlist comparison
- minimal black-and-white UI

## Important Privacy Decisions

Do not reintroduce public email display.

Do not reintroduce Google profile photos as public avatars.

Do not search users by email.

Do not return to one-way friends.

Friendship should require approval before watchlists are shared.

Profiles should expose only app-safe data:

```txt
uid
displayName
username
searchTerms
```

## Data Model

Public profiles:

```txt
users/{uid}
```

Watchlists:

```txt
users/{uid}/watchlist/{imdbID}
```

Friend requests and friendships:

```txt
friendships/{sortedUidA_sortedUidB}
```

Friendship statuses:

```txt
pending
accepted
rejected
```

## Firebase Notes

Firebase config lives in `script.js` because this is a browser-only student project.

Firestore rules must match the current friend-request model. If the app shows permission errors, first check whether GitHub Pages is serving stale JavaScript.

The app intentionally uses cache-busting query strings in `index.html`:

```html
styles.css?v=20260519-privacy
script.js?v=20260519-privacy
```

Update those strings after important JS/CSS deploys if browser cache causes stale behavior.

## GitHub Pages Notes

Live URL:

```txt
https://ai-programs.github.io/database-google/
```

Firebase Auth authorized domains must include:

```txt
ai-programs.github.io
localhost
127.0.0.1
```

## Git Remote

The remote uses an SSH alias:

```txt
origin git@github-ai:ai-programs/database-google.git
```

The alias points to GitHub with `~/.ssh/id_ai_programs`.

## Verification

Before committing code changes, run:

```bash
node --check script.js
git diff --check
```

For docs-only changes, `git diff --check` is usually enough.

## Recent Intent

The project is for teen students. Keep explanations and docs educational, direct, and privacy-focused.

The main teaching goal is not just building features, but helping students ask security/privacy questions when building social apps.

## Useful Next Improvements

- Add UI for choosing a unique username.
- Add invite link flow for people not yet in the app.
- Add blocking.
- Add account deletion cleanup.
- Add watchlist visibility settings.
- Move friend request validation to Cloud Functions for stronger security.
- Improve Firestore rules once the final data model is stable.
