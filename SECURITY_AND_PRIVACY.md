# Security and Privacy Notes for Social Apps

This project lets users sign in, save a movie watchlist, search for people, send friend requests, and compare watchlists with accepted friends.

Those features seem simple, but they raise important security and privacy questions. This document explains the main issues and the safer design choices.

## 1. Authentication Is Not the Same as Authorization

Authentication answers:

```txt
Who is this user?
```

Authorization answers:

```txt
What is this user allowed to do?
```

Signing in with Google proves a user has a Google account. It does not automatically mean they should be allowed to read every profile, every watchlist, or every friendship.

Good practice:

- Use Firebase Auth to know who is signed in.
- Use Firestore security rules to control what that user can read and write.
- Never rely only on JavaScript buttons being hidden or disabled.

Bad practice:

- Letting every signed-in user read every private document.
- Assuming users will only click the buttons you show them.

## 2. Keep Public and Private Data Separate

Some user data can be public inside the app:

```txt
displayName
username
avatar choice
```

Some user data should usually stay private:

```txt
email
Google profile photo
authentication provider
account settings
```

In this app, the public profile should not expose the user's email or Google profile picture.

Better public profile:

```txt
users/{uid}
  uid
  displayName
  username
  searchTerms
```

Avoid public profile fields like:

```txt
email
photoURL
emailLower
```

Why this matters:

- Email addresses can identify people outside the app.
- Google profile photos may reveal a real identity.
- Students should learn to collect and expose the minimum data needed.

## 3. Search Should Not Reveal Private Information

Searching by email can leak whether a person uses the app.

Example problem:

```txt
If I search someone@example.com and they appear, I now know that person has an account.
```

Better practice:

- Search by username.
- Search by display name.
- Let users choose whether they appear in search.

Possible setting:

```txt
searchVisibility: true | false
```

## 4. Use Friend Requests, Not One-Way Friends

One-way friends are simple, but they can be unsafe.

Problem:

```txt
User A adds User B and immediately sees User B's watchlist.
```

Better flow:

```txt
User A sends request to User B.
User B approves or rejects.
Only after approval can they compare watchlists.
```

Friendship statuses:

```txt
pending
accepted
rejected
blocked
```

This project currently uses friend requests so a user must approve before becoming an accepted friend.

## 5. Watchlists Should Be Private by Default

A watchlist may reveal personal interests, habits, language, age, or sensitive topics.

Good default:

```txt
Only the owner can see their watchlist.
Accepted friends can see it only after approval.
```

Possible future privacy setting:

```txt
watchlistVisibility: "private" | "friends" | "public"
```

Safer default:

```txt
watchlistVisibility: "private"
```

## 6. The Client Is Not Secure

The browser code is public. Anyone can open DevTools and inspect or modify JavaScript.

That means this is not enough:

```js
if (userIsFriend) {
  showWatchlist();
}
```

That improves the user experience, but it is not real security.

Real security must happen in Firestore rules or backend code.

Good practice:

- Use UI checks for a friendly experience.
- Use Firestore rules for actual protection.
- Use Cloud Functions for complex validation.

## 7. Firestore Rules Should Follow Least Privilege

Least privilege means:

```txt
Give users only the access they need, and nothing more.
```

Examples:

- A user can edit their own watchlist.
- A user cannot edit someone else's watchlist.
- A user can read a friend's watchlist only if the friendship is accepted.
- A user cannot create an accepted friendship by themselves.

Bad rule:

```js
allow read, write: if request.auth != null;
```

Better idea:

```js
allow write: if request.auth.uid == userId;
```

Even better:

```js
allow read: if request.auth.uid == userId || isAcceptedFriend(userId);
```

## 8. Prevent Fake Friendships

A user should not be able to create this by themselves:

```txt
status: "accepted"
```

The safer flow is:

```txt
Requester creates pending request.
Recipient changes pending to accepted or rejected.
```

For a serious production app, use a backend or Cloud Function to validate friendship transitions.

Example transitions:

```txt
none -> pending
pending -> accepted
pending -> rejected
accepted -> removed
```

Dangerous transition:

```txt
none -> accepted
```

## 9. Blocking Is Important

Any app with social features should eventually support blocking.

Blocking should prevent a user from:

- sending more friend requests
- viewing the blocker in search
- viewing the blocker's watchlist
- interacting with the blocker

Possible model:

```txt
users/{uid}/blocked/{blockedUid}
```

Or:

```txt
blocks/{blockId}
  blockerUid
  blockedUid
```

## 10. Invites Need Care

Question:

```txt
What happens if I try to add someone who is not in the app yet?
```

In this app right now:

- They do not appear in search.
- No invite is sent.
- No email is sent.
- No friend request is created.

That is safer than searching by email because it avoids revealing whether a particular email address has an account.

Safer invite options:

- Let users share their username.
- Add a copyable invite link.
- Let the invited person decide whether to sign in and send a request.

Example invite link:

```txt
https://example.com/?inviteFrom=USER_ID
```

Avoid sending email invitations directly from browser JavaScript. Email invites should use a backend or trusted service.

## 11. Do Not Store More Than You Need

Before storing data, ask:

```txt
Do we really need this?
Who can see it?
How long do we keep it?
Can the user delete it?
```

Good practice:

- Store only what the feature needs.
- Avoid storing emails in public documents.
- Avoid storing third-party profile photos unless needed.
- Give users a way to delete their data.

## 12. Usernames Should Be Unique

If users can choose usernames, the app should prevent duplicates.

Common model:

```txt
usernames/{usernameLower}
  uid
```

When a user chooses `sergio`, create:

```txt
usernames/sergio
  uid: "abc123"
```

Then no other user can claim the same username.

This usually requires careful Firestore rules or a Cloud Function.

## 13. Validate User Input

Examples of validation:

- username length
- allowed username characters
- display name length
- no empty movie IDs
- no unexpected fields in Firestore writes

Example username rule:

```txt
3 to 20 characters
lowercase letters, numbers, hyphens, underscores
```

Validation should happen in:

- the UI, for helpful feedback
- Firestore rules or backend, for real protection

## 14. Think About Abuse

Social features can be abused.

Questions to ask:

- Can someone spam friend requests?
- Can someone search every possible username?
- Can someone scrape all public profiles?
- Can someone harass another user?
- Can someone impersonate another user with a similar name?

Possible protections:

- rate limits
- blocking
- reporting
- private search visibility
- unique usernames
- Cloud Functions for sensitive actions

## 15. Good Questions for Students

When creating an app, ask:

1. What data am I collecting?
2. Does the app need this data?
3. Who can read this data?
4. Who can edit this data?
5. What happens if someone changes the JavaScript in DevTools?
6. What happens if someone tries to access another user's data directly?
7. Can users delete their account and data?
8. Can users block or report someone?
9. Is private data mixed with public data?
10. Are security rules enforcing the same behavior as the UI?

## 16. Current Project Design

This project currently aims for:

- Google sign-in for authentication
- public profiles without email or Google photo
- generated usernames
- friend requests instead of automatic friends
- accepted friends only for watchlist comparison
- Firestore rules for access control

Still useful future improvements:

- user-chosen unique usernames
- privacy settings for search visibility
- privacy settings for watchlist visibility
- blocking
- reporting
- account deletion cleanup
- Cloud Functions for stronger friend request validation

## Main Lesson

If an app has social features, it is not just a technical problem. It is also a privacy, safety, and trust problem.

Good apps do not only ask:

```txt
Can we build this?
```

They also ask:

```txt
Should we build it this way?
Who could be harmed?
What should be private by default?
```
