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
- Paginated service provider list
- Search, city and availability filters, sorting and pagination
- Service provider detail pages
- Review summaries and review lists on provider detail pages
- Inline review creation from completed sent requests, with validation, pending and error states and local publication confirmation
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
- Signed-in account links to request lists in the header
- Manual logout opens login and closes the current page, including private request lists
- HTTP integration with the NestJS backend
- Loading, empty and error states
- Automated tests with Vitest
- Account registration through a validated reactive form
- Login and logout, with the authenticated user's name displayed in the header
- Shared authentication state managed with NgRx SignalStore
- Automatic navigation to the provider list after successful login
- Automatic bearer token attachment to requests targeting the backend API
- Session cleared when the API rejects its automatically attached token with a 401 response
- Authentication guards for provider and service offering creation and editing pages, request creation and request lists

## Project status

The application is under active development.
A first responsive interface is implemented, with further visual and
accessibility improvements planned.

Account registration, login and logout are implemented.
Authentication state is currently stored in memory and is cleared when
the page is reloaded.

Service request creation and private sent and received request pages are
implemented. Recipients can mark requests as read, accept or reject them,
and mark accepted requests as completed. Requesters can publish reviews from
completed sent requests. Publication confirmation is currently kept in memory
for the lifetime of the request list page. Reply messages are planned.
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
Reloading the application clears the session and requires another login.

Creating or editing a service provider or service offering, sending a service
request, and viewing sent or received request lists require login.
Unauthenticated visitors opening these pages are redirected to login.

An HTTP interceptor attaches the session's access token to requests targeting
`http://localhost:3000`, while preserving any existing Authorization header.
Requests targeting other origins do not receive the session token.

If a request using the automatically attached session token receives
`401 Unauthorized`, the interceptor clears the session if that token is still
the current one. The header returns to its logged-out state; the user can log
in again. The error is forwarded to the component, and no automatic retry or
navigation occurs. A delayed 401 from an older token does not clear a newer
session. Other HTTP errors and requests forwarded without token attachment do
not trigger logout. Expiration is detected when the API rejects a request,
not by a timer in the interface.

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

Reply messages are not implemented yet.

## Reviews from completed requests

In "Demandes envoyées", a completed request with a non-null `serviceProviderId`
shows "Donner mon avis". Received requests and requests whose provider was
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

The list tracks reviewed request identifiers in memory. Returning to the list
resets this local confirmation, so an already reviewed request may show the
action again; the API still rejects a duplicate with `409 Conflict`. Restoring
review indicators from the private API responses is planned. Public review
lists and summaries are fetched when opening the provider detail page; this
submission flow does not update other open pages in real time.

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
- Session persistence
- A session expiry notification and return to login
- A mobile account menu with the authenticated user's name always visible
- Login redirection using `replaceUrl: true` to improve browser back navigation
- Service request reply messages
- Persistent review indicators when returning to sent requests
