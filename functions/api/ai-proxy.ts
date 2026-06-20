interface Env {
  GEMINI_API_KEY?: string;
}

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      "data: " + JSON.stringify({ delta: { text: "Error: GEMINI_API_KEY is not configured in Cloudflare environment variables." } }) + "\n\ndata: [DONE]\n",
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  try {
    const rawBody: any = await context.request.json().catch(() => ({}));
    const { system, messages, max_tokens, useSearch, responseMimeType } = rawBody;

    let userPrompt = "Hello";
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && typeof lastMsg.content === "string") {
        userPrompt = lastMsg.content;
      }
    }

    // Call dynamic REST API stream on google's official endpoint
    // Fallback to gemini-2.5-flash which is widely stable across regions
    const model = "gemini-2.5-flash"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const configPayload: any = {
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: max_tokens || 1400,
        temperature: 0.7,
      }
    };

    if (system) {
      configPayload.systemInstruction = {
        parts: [{ text: system }]
      };
    }

    if (responseMimeType) {
      configPayload.generationConfig.responseMimeType = responseMimeType;
    }

    if (useSearch === true) {
      configPayload.tools = [{ googleSearch: {} }];
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        "data: " + JSON.stringify({ delta: { text: `Error from Google: ${response.status} - ${errText}` } }) + "\n\ndata: [DONE]\n",
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }

    // Set up SSE stream output channel
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    // Parse the live Google SSE stream and forward mapped text to client
    (async () => {
      const reader = response.body?.getReader();
      if (!reader) {
        await writer.write(encoder.encode("data: " + JSON.stringify({ delta: { text: "Error: Failed to open model reader stream." } }) + "\n\ndata: [DONE]\n"));
        await writer.close();
        return;
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          
          const raw = trimmed.slice(5).trim();
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (text) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ delta: { text } })}\n`));
            }
          } catch {}
        }
      }

      // If any buffer remaining, try parsing it
      if (buffer.trim().startsWith("data:")) {
        try {
          const raw = buffer.trim().slice(5).trim();
          const parsed = JSON.parse(raw);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ delta: { text } })}\n`));
          }
        } catch {}
      }

      await writer.write(encoder.encode("data: [DONE]\n"));
      await writer.close();
    })().catch(async (e) => {
      console.error(e);
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ delta: { text: `\n[Edge Stream error]: ${e.message}` } })}\n\ndata: [DONE]\n`));
        await writer.close();
      } catch {}
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error: any) {
    return new Response(
      "data: " + JSON.stringify({ delta: { text: `Internal Server Error: ${error.message}` } }) + "\n\ndata: [DONE]\n",
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }
};
