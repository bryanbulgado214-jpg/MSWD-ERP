/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/prisma/tests/**/*.test.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Skips full type-checking during transform (equivalent to
        // `tsc --transpile-only`) — necessary in this project because
        // @prisma/client's generated types don't exist until `prisma
        // generate` succeeds, which requires reaching
        // binaries.prisma.sh. Every file here only ever uses
        // Prisma-generated TYPES in type positions, never as runtime
        // values (Prisma.Decimal is a type annotation, never
        // constructed directly — real Decimal instances always come
        // from Prisma Client's own return values or, in tests, from the
        // `decimal.js` package directly), so skipping type-checking at
        // transform time does not hide any real logic bugs — it only
        // skips re-verifying type shapes that a normal `npm run
        // typecheck` (or a real `prisma generate` on a machine with
        // network access) already covers separately.
        isolatedModules: true,
      },
    ],
  },
};
