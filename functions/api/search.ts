interface Env {
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
}

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const rawBody: any = await context.request.json().catch(() => ({}));
    const q = rawBody.q;
    if (!q) {
      return new Response(JSON.stringify({ snippets: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let snippets: string[] = [];

    // LAYER 1: DuckDuckGo HTML Scraper (live internet results at the edge)
    try {
      const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
      const response = await fetch(ddgUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
      });
      const html = await response.text();

      const titleMatches = [...html.matchAll(/<a[^>]*class=["']result__a["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
      const snippetMatches = [...html.matchAll(/<a[^>]*class=["']result__snippet["'][^>]*>([\s\S]*?)<\/a>/gi)];

      for (let i = 0; i < Math.min(titleMatches.length, snippetMatches.length); i++) {
        const href = titleMatches[i][1];
        const rawTitle = titleMatches[i][2];
        const rawSnippet = snippetMatches[i][1];

        const title = rawTitle.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
        const snippet = rawSnippet.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

        let url = href;
        if (href.includes("uddg=")) {
          const parts = href.split("uddg=");
          if (parts[1]) {
            const actualUrl = parts[1].split("&")[0];
            try {
              url = decodeURIComponent(actualUrl);
            } catch {
              url = actualUrl;
            }
          }
        }

        if (title && snippet) {
          snippets.push(`[${title}] (${url}) - ${snippet}`);
        }
      }
    } catch (ddgHtmlError) {
      console.warn("DDG HTML search failed, trying fallback:", ddgHtmlError);
    }

    // LAYER 2: DuckDuckGo Instant Answer API Fallback
    if (snippets.length === 0) {
      try {
        const ddgApiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`;
        const apiRes: any = await fetch(ddgApiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        }).then(r => r.json());

        if (apiRes.AbstractText) {
          snippets.push(`[${apiRes.Heading || q}] (${apiRes.AbstractURL || ""}) - ${apiRes.AbstractText}`);
        }

        if (apiRes.RelatedTopics && Array.isArray(apiRes.RelatedTopics)) {
          for (const topic of apiRes.RelatedTopics) {
            if (topic.Text && topic.FirstURL) {
              snippets.push(`[Topic] (${topic.FirstURL}) - ${topic.Text}`);
            } else if (topic.Topics && Array.isArray(topic.Topics)) {
              for (const sub of topic.Topics) {
                if (sub.Text && sub.FirstURL) {
                  snippets.push(`[Topic] (${sub.FirstURL}) - ${sub.Text}`);
                }
              }
            }
          }
        }
      } catch (ddgApiError) {
        console.warn("DDG API search failed, moving to Wikipedia:", ddgApiError);
      }
    }

    // LAYER 3: Wikipedia Semantic Search Fallback
    if (snippets.length === 0) {
      try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json`;
        const wikiRes: any = await fetch(wikiUrl).then(r => r.json());
        const wikiSearch = wikiRes.query?.search || [];

        snippets = wikiSearch.map((item: any) => {
          const cleanTitle = item.title;
          const cleanSnippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();
          const wikiArticleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanTitle.replace(/\s+/g, "_"))}`;
          return `[Wikipedia: ${cleanTitle}] (${wikiArticleUrl}) - ${cleanSnippet}`;
        });
      } catch (wikiError) {
        console.warn("Wikipedia search failed:", wikiError);
      }
    }

    return new Response(JSON.stringify({ snippets: snippets.slice(0, 6) }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization" 
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ snippets: [], error: error.message }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization" 
      },
    });
  }
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    }
  });
};
