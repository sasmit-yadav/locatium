Manual QA scripts. Each needs the API running (default http://localhost:$PORT from backend/.env).

  fuzz.js            malformed / hostile payloads must return 4xx, never 5xx
  idor.js            one user must not read or change another user's portal data
  load.js            concurrent scoring + chat + ranking latency (single box)
  feature-parity.js  feature-extraction SQL parity check (needs DATABASE_URL)

Sign-in scripts read QA_USER_PASSWORD from the environment; nothing is hardcoded.
