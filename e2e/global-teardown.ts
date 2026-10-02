/*
  Playwright calls the function returned by globalSetup, which stops the processes it started. This exists
  so a failure in setup still leaves a hook to report from, and so the contract is explicit rather than
  implied by a return value.
*/
export default async function globalTeardown() {
  // Nothing to do: globalSetup returns its own teardown, which Playwright runs first.
}
