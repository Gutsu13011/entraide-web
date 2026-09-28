# Entraide Web

Angular frontend for Entraide, a personal project focused on connecting
people with local service providers.

## Project background

Entraide started as a personal project to learn Angular and NestJS
through practice. It is now evolving into a full-stack portfolio
application, with the longer-term ambition of becoming a real local
service.

## Current features

- Responsive layouts for the provider list, detail page and creation form.
- Paginated service provider list
- Search, city and availability filters, sorting and pagination
- Service provider detail pages
- Review summaries and review lists on provider detail pages
- Multiple service offerings per provider, with independent free or hourly pricing on detail pages
- Service offering creation through a validated reactive form
- Service provider creation through a validated reactive form
- HTTP integration with the NestJS backend
- Loading, empty and error states
- Automated tests with Vitest

## Project status

The application is under active development.
A first responsive interface is implemented, with further visual and
accessibility improvements planned.

Authentication, user accounts and service request workflows are also planned.
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
npm ci
npm start
```

Open http://localhost:4200 in your browser.

The frontend currently connects to:
http://localhost:3000/service-providers

A fresh backend database contains no service providers.
To explore the application with 12 fictional profiles, follow the
"Demo data" section in the `entraide-api` README.

The demo dataset provides two pages of results with the default page size,
so you can try pagination, search, filters and sorting immediately.

The demo dataset also includes 14 service offerings: 12 hourly and 2 free.
Open Sophie Martin or Hugo Petit to see both pricing types on one profile.

You can also use the creation forms to add service providers and free or hourly
service offerings manually. Open a provider detail page to add an offering.

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
- Authentication and user accounts
- Managing existing service offerings from the frontend
- Service requests and status tracking
- Reviews linked to completed service requests
