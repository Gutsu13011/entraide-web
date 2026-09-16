# Entraide Web

Angular frontend for Entraide, a personal project focused on connecting
people with local service providers.

## Project background

Entraide started as a personal project to learn Angular and NestJS
through practice. It is now evolving into a full-stack portfolio
application, with the longer-term ambition of becoming a real local
service.

## Current features

- Paginated service provider list
- Search with pagination
- Service provider detail pages
- Service provider creation through a validated reactive form
- HTTP integration with the NestJS backend
- Loading, empty and error states
- Automated tests with Vitest

## Project status

The application is under active development.
The interface currently focuses on functionality; visual design and
responsive polish are planned.

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
so you can try pagination and search immediately.

You can also use the creation form to add service providers manually.

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

- Visual design and responsive layouts
- Additional provider filters and sorting controls
- Authentication and user accounts
- Multiple services per provider
- Service requests and status tracking
- Reviews linked to completed service requests
