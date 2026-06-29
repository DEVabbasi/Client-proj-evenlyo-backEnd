const Module = require("module");
const path = require("path");

// Ensure Heroku env vars are used (ignore local serviceAccountKey.json).
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (String(request).includes("serviceAccountKey.json")) {
    const err = new Error(
      `Cannot find module '${request}'`,
    );
    err.code = "MODULE_NOT_FOUND";
    throw err;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
const logs = [];

const capture =
  (fn) =>
  (...args) => {
    logs.push(args.map(String).join(" "));
    fn(...args);
  };

console.log = capture(origLog);
console.warn = capture(origWarn);
console.error = capture(origError);

try {
  const { admin, projectId } = require("../config/firebase");
  console.log = origLog;
  console.warn = origWarn;
  console.error = origError;
  process.stdout.write(
    JSON.stringify({
      ok: !!admin.apps.length,
      projectId,
      apps: admin.apps.length,
      logs,
    }),
  );
} catch (e) {
  console.log = origLog;
  console.warn = origWarn;
  console.error = origError;
  process.stdout.write(
    JSON.stringify({ ok: false, error: e.message, logs }),
  );
  process.exit(1);
}
