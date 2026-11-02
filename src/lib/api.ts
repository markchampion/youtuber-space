import "server-only";

/** Wrap a route handler so thrown errors come back as JSON { error }. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 400 });
    }
  };
}

export function baseUrlOf(req: Request) {
  const u = new URL(req.url);
  // The renderer runs on this machine, so loopback is always reachable.
  return `http://127.0.0.1:${u.port || (u.protocol === "https:" ? 443 : 80)}`;
}
