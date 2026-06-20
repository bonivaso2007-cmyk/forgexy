interface Env {
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
}

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const groqKey = context.env.GROQ_API_KEY;
  const geminiKey = context.env.GEMINI_API_KEY;

  const rawBody: any = await context.request.json().catch(() => ({}));
  const { messages, max_tokens, system, model: requestedModel } = rawBody;

  // Fallback function using Gemini if Groq is not available or fails
  const streamGeminiFallback = async (originalError?: string) => {
    if (!geminiKey) {
      return new Response(
        "data: " + JSON.stringify({ delta: { text: `\n[Engine Error]: Neither GROQ_API_KEY nor GEMINI_API_KEY is configured in Cloudflare. Please set them in your dashboard secrets.` } }) + "\n\ndata: [DONE]\n",
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }

    let userPrompt = "Hello";
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && typeof lastMsg.content === "string") {
        userPrompt = lastMsg.content;
      }
    }

    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${geminiKey}`;

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

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        "data: " + JSON.stringify({ delta: { text: `\n[Fallback Error]: ${response.status} - ${errText}` } }) + "\n\ndata: [DONE]\n",
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    (async () => {
      const reader = response.body?.getReader();
      if (!reader) {
        await writer.write(encoder.encode("data: " + JSON.stringify({ delta: { text: "Error: No reader" } }) + "\n\ndata: [DONE]\n"));
        await writer.close();
        return;
      }

      if (originalError) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ delta: { text: `[Groq Unavailable, Redirecting to Gemini Edge...]\n` } })}\n`));
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
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ delta: { text: `\n[Fallback Stream Error]: ${e.message}` } })}\n\ndata: [DONE]\n`));
        await writer.close();
      } catch {}
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  };

  // If Groq key doesn't exist, trigger Gemini fallback immediately
  if (!groqKey) {
    console.warn("GROQ_API_KEY is not defined. Initiating fallback stream.");
    return streamGeminiFallback("No groq key");
  }

  try {
    const groqMessages = [
      { role: "system", content: system || "You are a helpful assistant" },
      ...messages
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: requestedModel || "llama-3.3-70b-versatile",
        messages: groqMessages,
        max_completion_tokens: max_tokens || 1024,
        temperature: 1,
        stream: true
      })
    });

    if (!response.ok) {
      console.warn(`Groq API returned status ${response.status}. Redirecting to Gemini.`);
      return streamGeminiFallback(`Groq error ${response.status}`);
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    (async () => {
      const reader = response.body?.getReader();
      if (!reader) {
        await writer.write(encoder.encode("data: " + JSON.stringify({ delta: { text: "Error: Groq reader unavailable" } }) + "\n\ndata: [DONE]\n"));
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
          if (line.trim().startsWith("data: ")) {
            const raw = line.slice(5).trim();
            if (raw && raw !== "[DONE]") {
              try {
                const parsed = JSON.parse(raw);
                const content = parsed.choices?.[0]?.delta?.content || "";
                if (content) {
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ delta: { text: content } })}\n`));
                }
              } catch {}
            }
          }
        }
      }

      await writer.write(encoder.encode("data: [DONE]\n"));
      await writer.close();
    })().catch(async (e: any) => {
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ delta: { text: `\n[Stream Error]: ${e.message || "Connection interrupted."}` } })}\n\ndata: [DONE]\n`));
        await writer.close();
      } catch {}
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (e: any) {
    console.error("Groq edge call failed:", e);
    return streamGeminiFallback(e.message || "Connection failed");
  }
};
