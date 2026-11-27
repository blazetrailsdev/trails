# Releasing

Every public package in `packages/` is published to npm in lockstep, at one
version, by `.github/workflows/release.yml`.

## Cutting a release

1. `pnpm release:version <major.minor.patch[-pre]>` rewrites every public
   `package.json` and `trailties/lib/gem-version.ts`. Open a PR with the
   result and merge it.
2. Tag the merge commit `v<version>` and push the tag.

The workflow builds, runs `scripts/package-publish-shape.test.ts`, checks that
the tag matches `packages/trails/package.json`, and runs
`pnpm -r publish --provenance`. A version containing `-alpha` is published
under the `alpha` dist-tag; anything else goes to `latest`.

## Authentication: npm trusted publishing

The Publish job holds no npm credential. It has `id-token: write`, and pnpm
exchanges the job's GitHub OIDC token for a short-lived npm token, which npm
grants only to a package with a Trusted Publisher for repository
`blazetrailsdev/trails`, workflow `release.yml`.

To see a package's configuration:

```sh
npm trust list @blazetrails/<pkg>
```

## Adding a package

npm accepts a Trusted Publisher only on a package that already exists, so a
new public package cannot be created by the workflow. Before the first tag
that includes it, an owner of the `blazetrails` npm org:

1. Publishes it once from their machine, logged in interactively
   (`npm login --auth-type=web`), from a build of the release commit:

   ```sh
   pnpm --filter @blazetrails/<pkg> publish --access public --tag alpha --otp=<code>
   ```

2. Adds the Trusted Publisher, which needs 2FA and is refused to a token that
   bypasses it:

   ```sh
   npm trust github @blazetrails/<pkg> --file release.yml --repo blazetrailsdev/trails --allow-publish
   ```

3. Pushes the next release tag within two days. npm expires a Trusted
   Publisher configuration that has not completed a publish in that window,
   and it must then be deleted and added again.
