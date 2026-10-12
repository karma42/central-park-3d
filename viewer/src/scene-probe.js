// Checks whether a scene module URL exists before importing it.
// HEAD first; some static hosts answer HEAD with 405/501, so anything other than 2xx/404 retries with GET.
export async function moduleExists(url, fetchFn = fetch) {
  try {
    const head = await fetchFn(url, { method: 'HEAD', cache: 'no-store' });
    if (head.ok) return true;
    if (head.status === 404) return false;
  } catch {
    // Network error or HEAD refused outright: try GET below.
  }
  try {
    const res = await fetchFn(url, { method: 'GET', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}
