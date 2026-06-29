/**
 * Verify forcePng Cloudinary transform for subcategory icons.
 * Run: node scripts/verify-force-png.js
 */
const { forcePng, withPngSubCategoryIcon } = require("../utils/cloudinary");
const https = require("https");

const SAMPLE_SVG =
  "https://res.cloudinary.com/dv0imczul/image/upload/v1773147806/u3rlqzfggzjqbfnprpvu.svg";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

function headRequest(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { method: "HEAD" }, (res) => {
        resolve({
          statusCode: res.statusCode,
          contentType: res.headers["content-type"],
        });
      })
      .on("error", reject);
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, json: JSON.parse(body) });
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function main() {
  console.log("=== forcePng unit tests ===\n");

  assert(forcePng("") === "", "empty string unchanged");
  assert(forcePng(null) === null, "null unchanged");
  assert(
    forcePng("https://example.com/image/upload/foo") ===
      "https://example.com/image/upload/foo",
    "non-Cloudinary URL unchanged"
  );

  const transformed = forcePng(SAMPLE_SVG);
  assert(
    transformed.includes("/image/upload/f_png/"),
    "SVG URL gets f_png segment"
  );
  assert(
    transformed ===
      "https://res.cloudinary.com/dv0imczul/image/upload/f_png/v1773147806/u3rlqzfggzjqbfnprpvu.svg",
    "exact transform for sample BBQ icon"
  );
  assert(forcePng(transformed) === transformed, "idempotent on second call");

  const doc = {
    _id: "69b0169fbbf24119d78f065a",
    name: { en: "Barbecue" },
    icon: SAMPLE_SVG,
  };
  const mapped = withPngSubCategoryIcon(doc);
  assert(mapped.icon.includes("/image/upload/f_png/"), "withPngSubCategoryIcon maps icon");
  assert(doc.icon === SAMPLE_SVG, "original doc icon unchanged in DB shape");

  console.log("\n=== Cloudinary HEAD check (transformed URL) ===\n");
  try {
    const { statusCode, contentType } = await headRequest(transformed);
    assert(statusCode === 200, `HTTP ${statusCode} for f_png URL`);
    assert(
      contentType && contentType.includes("image/png"),
      `Content-Type is PNG (${contentType})`
    );
  } catch (err) {
    console.log(`  FAIL: HEAD request — ${err.message}`);
    failed++;
  }

  const apiBase = process.env.API_BASE_URL;
  if (apiBase) {
    console.log(`\n=== Live API check (${apiBase}) ===\n`);
    try {
      const { statusCode, json } = await getJson(
        `${apiBase.replace(/\/$/, "")}/api/subcategories/69b0169fbbf24119d78f065a`
      );
      const icon = json?.data?.icon;
      assert(statusCode === 200, `API HTTP ${statusCode}`);
      assert(
        icon && icon.includes("/image/upload/f_png/"),
        "live API returns f_png icon (deploy required if FAIL)"
      );
    } catch (err) {
      console.log(`  SKIP: live API — ${err.message}`);
    }
  } else {
    console.log(
      "\n  SKIP: live API (set API_BASE_URL to test deployed backend)\n"
    );
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
