# Entraide Web

Projet d’apprentissage Angular 22 représentant une liste d’intervenants locaux.

## Fonctionnalités

- Liste des intervenants
- Fiche détaillée avec routage
- Formulaire réactif validé
- Lecture et création via HTTP
- États de chargement, liste vide et erreur
- Tests avec Vitest

## Installation

Commande `npm install`.

## Running the application

The frontend uses Entraide API, a separate NestJS backend.
Before starting it, follow the backend README to install its dependencies,
configure the application, and apply the database migrations.

Use two separate terminals:

1. In the `entraide-api` directory, run `npm run start:dev` to start NestJS on port 3000.
2. In the `entraide-web` directory, run `npm start` to start Angular on port 4200.

Local URLs:

- Application: `http://localhost:4200`
- Service providers API: `http://localhost:3000/service-providers`

## Tests

Commande :

`npm test -- --watch=false`

## Build

Commande :

`npm run build`
