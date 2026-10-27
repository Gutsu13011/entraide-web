# Entraide Web

Angular frontend for Entraide, a personal project focused on connecting
people with local service providers.

## Project background

Entraide started as a personal project to learn Angular and NestJS
through practice. It is now evolving into a full-stack portfolio
application, with the longer-term ambition of becoming a real local
service.

## Current features

- Responsive layouts for the provider list, detail page and provider form.
- Active navigation links for the provider list, private requests, login and registration, with a light green background and `aria-current="page"`
- Paginated service provider list
- Search, city and availability filters, sorting and pagination
- Service provider detail pages
- Review summaries and review lists on provider detail pages
- Inline review creation from completed sent requests, with validation, pending and error states and publication confirmation restored from the API
- Multiple service offerings per provider, with independent free or hourly pricing on detail pages
- Service offering creation and editing through a shared validated reactive form
- Service provider creation and editing through a shared validated reactive form
- Provider edit link and delete button displayed only to the profile owner
- Provider deletion with confirmation, pending state and retry after failure
- Existing profile data loaded before editing, with loading and error states
- Failed updates preserve entered values and allow another attempt
- Account first and last names prefilled and read-only in the provider creation form
- Service offering creation and edit links and delete buttons displayed only to the provider owner
- Individual offering deletion with confirmation, pending state and retry after failure
- Service request creation from an offering through a protected reactive form
- Offering title, description and free or hourly pricing displayed before sending a request
- Request submission with validation, pending state, duplicate prevention and retry after failure
- Private sent and received request pages through a shared list component
- Recipient actions to mark requests as read, accept or reject them, and complete accepted requests, with pending and error states
- Request participants, messages, historical offering titles and pricing, status and dates displayed in cards
- Inline conversations on sent and received request cards, with reply submission and read receipts
- Signed-in account links to request lists in the header, with shared unread-message badges
- Manual logout opens login and closes the current page, including private request lists
- HTTP integration with the NestJS backend
- Loading, empty and error states
- Automated tests with Vitest
- Account registration through a validated reactive form
- Login and logout, with the authenticated user's name displayed in the header
- Shared authentication state managed with NgRx SignalStore
- Return to the requested internal page after login, with the provider list as fallback
- Automatic bearer token attachment to requests targeting the backend API
- Persistent login restored at startup through an HttpOnly refresh cookie
- Shared token renewal and one automatic retry after an authenticated API request returns 401
- Reauthentication message and login redirect preserving the current page when renewal fails
- Authentication guards for provider and service offering creation and editing pages, request creation and request lists

## Project status

The application is under active development.
A first responsive interface is implemented, with further visual and
accessibility improvements planned.

Account registration, login and logout are implemented.
Access tokens and profile data are held in memory. After a page reload, the
application restores authentication through the HttpOnly refresh cookie. During
use, rejected access tokens are renewed transparently before retrying the request
once, provided the refresh session is still valid.

Service request creation and private sent and received request pages are
implemented. Recipients can mark requests as read, accept or reject them,
and mark accepted requests as completed. Requesters can publish reviews from
completed sent requests. Publication confirmation is restored from the API
when the request list is reopened. Both participants can open a conversation,
send replies and mark received messages as read after displaying the history.
The current version is intended for local development and demonstration.

## Requirements

- Node.js 26
- npm 11.12.1, as declared in `package.json`
- Entraide API running locally

## Local setup

First, follow the `entraide-api` README to install and configure the backend,
apply its database migrations, and start it on port `3000`.

Then, in a separate terminal, run these commands from the `entraide-web`
directory:

```bash
npm ci &&
npm start
```

Open http://localhost:4200 in your browser.

The frontend currently connects to the API at:
http://localhost:3000

A fresh backend database contains no service providers.
To explore the application with 12 fictional profiles, follow the
"Demo data" section in the `entraide-api` README.

The demo dataset provides two pages of results with the default page size,
so you can try pagination, search, filters and sorting immediately.

The demo dataset also includes 14 service offerings: 12 hourly and 2 free.
Open Sophie Martin or Hugo Petit to see both pricing types on one profile.

After logging in, you can create your own provider profile, edit it through
"Modifier ma fiche", and add free or hourly offerings from its detail page.
Use "Modifier cette offre" on an offering to edit its title, description or pricing.
Saving an edit returns to the updated detail page. Cancelling an edit returns
to the detail page without saving changes.

"Supprimer ma fiche" asks for confirmation before permanently deleting the
profile and its related offerings and reviews. Cancelling leaves the profile
unchanged. Successful deletion opens the provider list; failed deletion keeps
the detail page visible and allows another attempt.

"Supprimer cette offre" asks for confirmation, then removes the selected offering
from the displayed list only after the API confirms success. The detail page,
profile and other offerings are preserved. Failure displays an error and allows
retry. Removing the last offering displays the empty state.

Demo profiles have no account owner, so their management links, delete
buttons and service request links are hidden.

## Authentication

Apply the backend database migrations before testing authentication and
provider ownership, including the users table and provider owner migrations.

Click "Créer un compte" to register with your first name, last name,
email and a password of at least 15 characters.

After registration, the application opens the login page.
Successful login retrieves the user profile and opens the provider list.
The header displays the user's name, links to sent and received requests,
and a logout button. Clicking "Se déconnecter" clears the frontend session
and opens the login page, closing the current page. Private request lists no
longer remain visible after manual logout, including when a response arrives
from an operation that was already pending.

Failed login keeps the entered values and displays an error message.
On a reload or direct URL entry, `provideAppInitializer` waits for
`AuthSession.restore()` to complete before application startup. A valid refresh
cookie obtains a new access token and profile before protected-route navigation.
Without a valid session, initialization completes anonymously and protected URLs
redirect to login. An API/network failure or the ten-second timeout also allows
startup, with a restoration error available on the login page.

The access token and profile remain in memory; no token is stored in localStorage
or sessionStorage. The browser manages the HttpOnly refresh cookie. Successful
logout revokes its backend session and clears the cookie, so a subsequent reload
does not restore the account.

`AuthStore.login()`, `refresh()` and `logout()` send requests to the local API
with `withCredentials: true`, allowing the browser to exchange the HttpOnly
refresh cookie. Refresh returns the same `{ accessToken }` shape as login;
logout completes on the API's empty 204 response. Errors propagate to callers
without automatic retries. Registration and bearer-authenticated profile lookup
do not opt into cross-origin cookies.

`AuthSession.logout()` clears local identity immediately and calls server
logout. While that request is pending, duplicate logout and new login attempts
are ignored. Success releases the loading state; a server/network error or ten
seconds without a response releases loading and displays a logout error, while
keeping local identity cleared. An explicit retry remains possible.

`AuthSession.restore()` returns a cold Observable: subscription starts refresh,
then retrieves the profile with the new token and stores both together. While
another authentication operation is pending, restoration is skipped. A 401
finishes anonymously without an error message; other failures show a restoration
error while still completing normally. The combined token/profile wait is
limited to ten seconds. Local cleanup or logout cancels pending restoration,
preventing late responses from signing the account back in. The application
initializer returns this Observable directly so Angular subscribes and waits
until restoration or its anonymous fallback completes.

`AuthSession.renewAccessToken()` returns a cold Observable of the renewed token
and preserves the current profile. Concurrent subscribers share one cookie refresh
request. When renewal completes, fails, or loses every subscriber, its shared
reference is released so a later call can start a fresh renewal. Local cleanup,
logout, or a new login cancels pending renewal; its maximum duration is ten
seconds. Errors are forwarded to the caller without clearing local identity in
this helper; the interceptor handles renewal failure and request retries.

Creating or editing a service provider or service offering, sending a service
request, and viewing sent or received request lists require login.
Unauthenticated visitors opening these pages are redirected to login. The guard
preserves the complete requested URL, including query parameters and fragment,
in the login URL's `returnUrl` query parameter. The login form reads this value
when it is created and, after successful authentication, navigates to the parsed
internal destination with `replaceUrl: true`. Query parameters and fragments are
preserved. Missing or empty values, external or relative URLs, paths containing
backslashes, and paths whose first primary segment is `login` or `register` fall
back to `/`. Angular's URL parser also falls back to `/` for malformed encoding.
This validation does not check whether every supplied internal route exists.
A failed login stays on the form and keeps the destination for another attempt.
Runtime session loss uses the same return destination mechanism.

An HTTP interceptor attaches the session's access token to requests targeting
`http://localhost:3000`, while preserving any existing Authorization header.
Requests targeting other origins do not receive the session token.
The exact POST paths `/auth/login`, `/auth/register`, `/auth/refresh` and
`/auth/logout` bypass automatic token attachment, renewal and retry handling.
Their request bodies, existing headers and cookie-transport options are preserved,
and errors are forwarded to the caller. Query parameters do not affect path
matching. Other paths and HTTP methods retain the normal bearer behavior.

If a request using the automatically attached session token receives
`401 Unauthorized`, the interceptor renews the token and retries that request
once. Concurrent 401 responses share one renewal. A delayed 401 reuses the
already-renewed token when the profile still identifies the same local session.
Retry preserves the original method, URL, body, headers and cookie options,
replacing only the automatically attached Authorization value.

Renewal errors, including network failures and the ten-second timeout, request
reauthentication if the original session is still current and are forwarded to
the caller. A retried request that also returns 401 requests reauthentication
without starting another renewal. Other retry errors are forwarded without
clearing authentication.

`AuthSession.requiredReauthentication()` clears local identity, cancels pending
authentication work, sets `reauthenticationRequired` and exposes a reconnect
message through `errorMessage`. It does not call server logout or revoke the
refresh cookie. The root component observes this flag and navigates to login
with the current page in `returnUrl` and `replaceUrl: true`. Existing login and
registration pages retain their URL. Navigation stays centralized even when
multiple requests share a failed renewal.

Starting login, manual logout, ordinary local cleanup or startup restoration
resets the flag. Manual logout keeps its explicit login navigation and does not
show a reauthentication message. Ordinary anonymous visits still use the guard
without an expired-session message. A failed reconnection preserves the return
destination for another attempt; successful reconnection opens it and restarts
the account's unread-count polling.

Local cleanup, logout and a new login cancel pending renewal. Requests from an
older login are not replayed in the new session, including a later login to the
same account. Late errors cannot clear a newer identity or token. Requests
forwarded without automatic token attachment keep their caller-owned error
handling. Expiration is detected through API responses rather than a browser
timer; startup restoration and runtime renewal serve different stages of the
session lifecycle.

The backend independently enforces authentication on protected endpoints
and ownership checks for provider updates, deletion and offering creation, updates and deletion.

Each account can create at most one provider profile. The creation form
prefills the account's first and last names and displays them as read-only.
The API also derives these names and the profile owner from the authenticated
account when creating the profile.

The edit and add-offering links and the delete button appear only when the
connected account owns the provider profile. They remain hidden for other
accounts, unauthenticated visitors and profiles without an owner.
The edit form also checks ownership after loading the profile and redirects
non-owners to its detail page.
The API independently rejects unauthorized updates, deletion and offering
creation, updates and deletion, including direct requests.

Editing uses `/service-providers/:id/edit` in the frontend and sends a PATCH
request to `/service-providers/:id` in the API. The form does not send the
profile ID or owner ID in the request body.

Offering editing uses
`/service-providers/:id/service-offerings/:offeringId/edit` in the frontend
and sends a PATCH request to
`/service-providers/:id/service-offerings/:offeringId` in the API.
The form loads the provider and its offerings, checks ownership, and prefills
the selected offering. Loading failures and missing offerings display an error
and prevent submission. Saving waits for the API response before returning
to the provider detail page; failed saves preserve the form and allow retry.

Switching from hourly to free pricing clears the hourly rate. Switching from
free to hourly pricing requires a new rate of at least 0.01. The API validates
pricing independently and stores a null hourly rate for free offerings.

Deletion sends a DELETE request to `/service-providers/:id`. The API returns
204 No Content on success. The frontend prevents duplicate deletion requests
while one is pending. Deleting a provider profile does not delete the user
account.

Individual offering deletion sends a DELETE request to
`/service-providers/:id/service-offerings/:offeringId` and expects
204 No Content. Profile and offering deletion cannot run simultaneously;
all deletion buttons are disabled while either operation is pending.

## Service requests

On a profile owned by another account, choose "Demander cette prestation"
on an offering. The link is also visible to anonymous visitors, who are
redirected to login. The profile owner sees offering management actions instead.
Profiles without an account owner cannot receive requests and have no request link.

The protected frontend route is
`/service-providers/:id/service-offerings/:offeringId/service-requests/new`.
It loads the provider's offerings and displays the selected offering's title,
description and pricing. Missing offerings and loading errors hide the form.
The return link navigates to the provider detail page without reloading the app.

The message must contain at least one non-whitespace character. Validation
feedback appears after interaction or an invalid submission. Sending posts only
`message` to
`/service-providers/:serviceProviderId/service-offerings/:serviceOfferingId/service-requests`.
The backend derives the requester from the verified token and the recipient
from the provider's owner, records the offering title and pricing snapshots,
and sets the initial status to `SENT`. Sending a request does not mean it has
been accepted by the provider.

The submit button shows progress and prevents duplicate requests while an
operation is pending. Success returns to the provider detail page; failure
keeps the message and allows retry. The return link remains available during
loading and after errors.

The "Demandes envoyées" and "Demandes reçues" links appear in the header
while signed in. They open the protected `/service-requests/sent` and
`/service-requests/received` pages, which call the matching private GET endpoints.
The API filters requests using the authenticated account; the frontend does not
send an account identifier. Both pages share a list component, with static route
data selecting the endpoint and page title.

Sent requests display the recipient's first and last names; received requests
display the requester's names. Each card includes the message, creation date,
status displayed as "Demande envoyée", "Demande lue", "Demande acceptée" or
"Demande refusée", or "Prestation terminée", and the offering title and pricing
snapshots. Changing or deleting an offering does not remove these historical
values from the request list. The cards preserve message line breaks and the
order returned by the API.

Loading, successful empty responses and loading failures have separate views.
Switching between the two pages loads the selected list. Manual logout removes
the account links and opens login, leaving the private list page.

### Recipient status actions

In "Demandes reçues", a `SENT` request offers "Marquer comme lue", "Accepter"
and "Refuser". A `READ` request offers only "Accepter" and "Refuser".
An `ACCEPTED` request offers "Marquer comme terminée" and can transition only
to `COMPLETED`. Rejected and completed requests have no further status actions.
Sent lists have no status update actions; eligible completed requests can offer review creation.

Actions send only `status` to `PATCH /service-requests/:id/status`. All status
buttons are disabled during an update, with progress shown on the selected
card. The card is replaced with the API response only after success; the
other cards remain unchanged. Failure preserves the list, shows an error and
re-enables actions. A new attempt clears the previous error.

Viewing a list does not mark requests as read. The API independently checks
that the authenticated account is the recorded recipient and validates the
transition. If another action already changed the request, the API can return
`409 Conflict`; the interface currently shows the generic action error and
does not automatically reload the list. Status changes do not update other
open pages in real time. Historical requests remain actionable after their
offering is deleted.

Completion shows a green badge with white text and a circled check next to
the offering title. Like other updates, it waits for API confirmation before
changing the card; a failed attempt keeps the accepted state and allows retry.
The API independently requires the recorded recipient and an accepted request.
Completion currently records only the status, without a completion timestamp.

### Request conversations

Each sent or received request card offers "Voir la discussion". Opening it
loads replies from `GET /service-requests/:id/messages`. Only one discussion
is open in a list at a time. "Fermer la discussion" removes its component;
opening it again fetches fresh history. The initial request text remains
separate from the replies. Conversations remain available after offering or
provider deletion, including on completed requests.

Replies display their author's name, creation date and content, preserving
line breaks and separating messages with a light border. A green check labelled
"Message lu" appears when the returned message has a non-null `readAt`.
Loading, empty history and loading failures have separate views. Loading
failures hide the reply form.

The reply form accepts non-blank text up to 2,000 characters and posts only
`content` to `POST /service-requests/:id/messages`. The API derives the author
from the authenticated account. The field becomes read-only and the send
button is disabled while sending. Success appends the saved message and
resets the draft; failure preserves the draft and history and allows retry.

After Angular renders the loaded history, the component checks for unread
messages written by the other participant only while the document is visible. If any exist, it sends the highest
identifier in that loaded history as `upToMessageId` to
`PATCH /service-requests/:id/messages/read`. The API marks only received,
previously unread messages up to that boundary. This does not change the
request's status. Empty histories, own messages alone and already-read
received messages do not trigger an update. Read-update failures display a
separate alert while preserving the discussion and reply form.

Closing the discussion cancels pending subscriptions and any scheduled
post-render callback. Late responses cannot update a closed component or
trigger a read update after closure. Cancelling a send on the client does not
undo a message the API may already have saved. Closing also discards the local
draft.

History loads immediately on opening. While the discussion remains open,
it refreshes every 10 seconds if the document is visible, the account is signed
in and the initial load succeeded. Ticks skip an existing history load or reply
submission. Background refreshes preserve the reply field, focus and draft;
a failed refresh shows a separate alert without hiding loaded messages or the
form, and the next eligible tick retries. An initial load failure still requires
closing and reopening the discussion to retry.

A valid reply submission cancels the pending history load before sending,
preventing an older response from replacing the newly saved reply. Invalid
submissions leave pending history loads active. Polling resumes after sending
finishes, including after a failed send. Closing the discussion stops its timer,
removes its visibility listener and cancels any pending history load. Hiding
the page skips future requests and read acknowledgements after rendering,
while an in-flight history load can still finish.

Returning to the page triggers an immediate history refresh through
`visibilitychange`, provided the account is signed in, the initial load
succeeded and no history load or reply submission is pending. The existing
10-second timer keeps its schedule. Both trigger sources share the same
subscription, which is cleaned up when the discussion closes. A background
loading error allows retrying on a later return as well as on a polling tick.

The read PATCH returns no content and does not replace locally loaded read
dates; the next history refresh or reopening fetches the latest server values.
Conversation history and header counters use separate polling intervals.
There is no real-time push. Real-time notifications and delayed email reminders
are planned.

### Unread-message counters

While signed in, the request links in the header display green badges for
positive unread-message counts. Each count represents received replies in
that request category, not the number of requests. Own replies and the initial
request text are excluded. A zero count has no badge.

A shared NgRx SignalStore loads counts from
`GET /service-requests/messages/unread-counts` when the authenticated user
changes. The API derives the account from the bearer token. Logout or switching
accounts clears the previous counts and cancels any pending count request.

After the conversation's read PATCH succeeds, it refreshes the same store;
the header updates from the returned counts. Failed or cancelled read updates
do not refresh counts. A count refresh failure does not hide the conversation
or discard its draft. Counts are unknown until loaded or after a loading
failure, so no badges appear in those states; a refresh retains the previous
counts while it is pending.

While signed in, App also refreshes counts every 30 seconds when the document
is visible. Ticks are skipped while the document is hidden or a count request
is still pending, allowing slow responses to finish. Manual
refreshes after reading keep the same polling schedule. A server error allows
another attempt at the next tick. A 401 triggers token renewal and one retry;
failed renewal or a repeated 401 clears local identity and stops polling. Logout, account changes and App destruction
stop the previous timer and remove the visibility listener. A newly signed-in account loads its own counts
immediately and starts a new timer.

The initial count load still runs when signing in on a hidden page. Hiding
the document does not cancel an in-flight request or clear loaded badges.
A `visibilitychange` listener refreshes counts immediately when the document
becomes visible, provided no count request is already pending. Hidden events
do not refresh counts. Returning to the page keeps the existing polling
schedule; its ticks skip a pending return-triggered request. A count loading
failure leaves the listener active for a later retry, while logout removes it.

Polling updates only header counts; it does not reload conversation history
or read dates. There is no real-time push, and browser scheduling can delay ticks.

## Reviews from completed requests

In "Demandes envoyées", a completed request with a non-null `serviceProviderId`
and `hasReview: false` shows "Donner mon avis". A reviewed request instead
shows "Votre avis a été publié". Received requests and requests whose provider was
deleted do not show this action. Deleting only the offering preserves the
provider link, so the request can still be reviewed.

Choosing the action opens an inline form on that card and disables other review
opening buttons. The form accepts an integer rating from 1 to 5 and a comment
containing at least one non-whitespace character. Validation feedback appears
after interaction or an invalid submission. The select retains numeric ratings.
The red "Annuler" button closes the form, discards its draft and re-enables the
other review actions without publishing anything. Reopening starts a fresh form.
Cancellation is disabled while publication is pending and becomes available
again if submission fails.

Submission posts only `serviceRequestId`, `rating` and `comment` to
`POST /service-providers/:serviceProviderId/reviews`. The authentication
interceptor attaches the access token. The API determines the author from the
requester's account and checks request ownership, completion and uniqueness.
Public review responses contain `id`, `authorName`, `rating`, `comment`,
`createdAt` and `serviceProviderId`.

While submission is pending, the publish button is disabled and displays
progress. Success emits the created review to the list, closes the form and
replaces the selected card's action with "Votre avis a été publié". Other
completed requests, including requests to the same provider, remain eligible.
An error keeps the form and entered values, shows a generic error message and
re-enables submission. The associated request status and snapshots are unchanged.

Private request responses include the required boolean `hasReview`. The list
uses that value for both the confirmation and the review opening guard. After
a successful publication, it replaces only the matching request with a copy
containing `hasReview: true`, then closes the form. Failed publication and
cancellation leave the requests unchanged. Reopening the list fetches the flag
again from the API, restoring confirmation without a separate local identifier
list. Other requests to the same provider retain their own flag. The API still
rejects duplicate reviews with `409 Conflict`. Received lists do not display
the requester-specific review action or confirmation. Public review lists and
summaries are fetched when opening the provider detail page; this submission
flow does not update other open pages in real time.

## Quality checks

Run the tests once:

```bash
npm test -- --watch=false
```

Create a production build:

```bash
npm run build
```

The build output is generated in `dist/entraide-web`.

## Continuous integration

The GitHub Actions workflow runs on pushes and pull requests targeting
`main`. It installs dependencies with `npm ci`, runs the tests and
creates a production build.

## Planned improvements

- Further visual and accessibility improvements
- A mobile account menu with the authenticated user's name always visible
- Real-time message notifications
- Delayed email reminders for unread messages
