// Client-address resolution for the rate limiter.
//
// The rule under test: X-Forwarded-For is a list the client prepends to and our
// own proxy appends to, so only the right-hand entries are trustworthy. Reading
// the leftmost one — what most snippets do — lets anyone reaching the origin
// mint a fresh identity per request and defeat every limiter at once.
//
// Run: node --experimental-strip-types .\scripts\verify-client-ip.ts
import { clientIp, looksLikeIp, trustedProxyHops } from "../lib/client-ip.ts";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${String(got)} want=${String(want)}`}`);
}

const h = (headers: Record<string, string>) => new Headers(headers);

// --- one trusted proxy: the rightmost entry wins, not the leftmost ----------
{
  // A client trying to pin itself as 1.2.3.4 in front of its real address.
  check(
    "forged prefix ignored",
    clientIp(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }), {}),
    "203.0.113.9"
  );
  check(
    "three forgeries ignored",
    clientIp(h({ "x-forwarded-for": "10.0.0.1, 172.16.0.1, 198.51.100.7" }), {}),
    "198.51.100.7"
  );
  check(
    "single entry accepted",
    clientIp(h({ "x-forwarded-for": "203.0.113.9" }), {}),
    "203.0.113.9"
  );
  check(
    "whitespace tolerated",
    clientIp(h({ "x-forwarded-for": "  1.2.3.4 ,   203.0.113.9  " }), {}),
    "203.0.113.9"
  );
}

// --- the address must look like an address ---------------------------------
// Otherwise a caller varies the header with junk and gets a fresh rate-limit
// bucket per request, which is the same attack by another route.
{
  check(
    "free-form suffix rejected",
    clientIp(h({ "x-forwarded-for": "1.2.3.4, definitely-not-an-ip" }), {}),
    "local"
  );
  check(
    "out-of-range octet rejected",
    clientIp(h({ "x-forwarded-for": "1.2.3.4, 999.999.999.999" }), {}),
    "local"
  );
  check(
    "x-real-ip junk rejected",
    clientIp(h({ "x-real-ip": "burner-account-7" }), {}),
    "local"
  );
  check("ipv4 accepted", looksLikeIp("192.168.0.1"), true);
  check("ipv6 accepted", looksLikeIp("2001:db8::1"), true);
  check("loopback accepted", looksLikeIp("::1"), true);
  check("hostname rejected", looksLikeIp("example.com"), false);
  check("empty rejected", looksLikeIp(""), false);
}

// --- fallbacks --------------------------------------------------------------
{
  check("x-real-ip used when no fwd", clientIp(h({ "x-real-ip": "203.0.113.5" }), {}), "203.0.113.5");
  check("no headers at all", clientIp(h({}), {}), "local");
  check("fwd with no valid entries", clientIp(h({ "x-forwarded-for": ",,," }), {}), "local");
}

// --- TRUSTED_PROXY_HOPS -----------------------------------------------------
{
  check("default hops", trustedProxyHops({}), 1);
  check("explicit two hops", trustedProxyHops({ TRUSTED_PROXY_HOPS: "2" }), 2);
  check("zero falls back to one", trustedProxyHops({ TRUSTED_PROXY_HOPS: "0" }), 1);
  check("negative falls back to one", trustedProxyHops({ TRUSTED_PROXY_HOPS: "-3" }), 1);
  check("garbage falls back to one", trustedProxyHops({ TRUSTED_PROXY_HOPS: "many" }), 1);
  check("fractional falls back to one", trustedProxyHops({ TRUSTED_PROXY_HOPS: "1.5" }), 1);

  // With a CDN in front of a load balancer, the last two entries are ours.
  check(
    "two trusted hops skips both forgeries",
    clientIp(
      h({ "x-forwarded-for": "1.2.3.4, 10.0.0.9, 203.0.113.9" }),
      { TRUSTED_PROXY_HOPS: "2" }
    ),
    "10.0.0.9"
  );
  // Fewer entries than trusted proxies must fall through, not wrap around.
  check(
    "index past the end falls through",
    clientIp(h({ "x-forwarded-for": "203.0.113.9" }), { TRUSTED_PROXY_HOPS: "3" }),
    "local"
  );
}

console.log(failures === 0 ? "\nAll client-ip checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);