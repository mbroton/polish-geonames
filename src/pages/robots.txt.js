export function GET({ site }) {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL(`${base}sitemap-index.xml`, site)}\n`,
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}
