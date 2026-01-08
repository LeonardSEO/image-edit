import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { roomImage, floorImages } = await request.json();

        if (!roomImage || !Array.isArray(floorImages) || floorImages.length === 0) {
            return NextResponse.json(
                { error: 'De sfeerfoto en minimaal een vloerfoto zijn verplicht' },
                { status: 400 }
            );
        }

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'API key niet geconfigureerd' },
                { status: 500 }
            );
        }

        const defaultPrompt = "Photorealistic interior image edit with accurate PVC floor pattern recognition and transfer.\n\nUse the first image as the base atmosphere photo and keep it completely unchanged: identical camera angle, framing, room geometry, furniture, walls, decor, lighting direction, exposure, shadows, reflections, and overall mood. Do not relight, rebalance, enhance, or reinterpret the scene.\n\nReplace only the existing floor with a PVC floor taken directly from the provided floor sample image(s). The floor sample image determines the exact type of laying pattern and is the single source of truth.\n\nThe model must correctly identify and apply the pattern shown in the sample image. If the sample shows classic herringbone (visgraat), generate classic herringbone with straight 90-degree plank ends, overlapping planks, and a staggered, asymmetrical layout. If the sample shows Hungarian point (Hongaarse punt), generate Hungarian point with angled plank ends and a mirrored V-shaped layout. Do not substitute or normalize patterns. The generated floor must always match the exact pattern type visible in the sample.\n\nApply the PVC floor using the exact laying direction and orientation shown in the sample image. Do not rotate, mirror, optimize, or reinterpret the direction for visual balance or composition.\n\nMatch the PVC surface finish exactly as shown in the sample: identical matte or satin sheen, identical gloss level, and identical light response. Do not increase shine, specular highlights, reflections, or contrast due to room lighting. The floor must visually behave like the sample PVC material, not like polished or lacquered wood.\n\nAccurately reproduce plank width, length, seam spacing, joint visibility, embossing depth, grain direction, printed texture, and repetition pattern exactly as visible in the sample. No smoothing, no invented grain, no pattern drift, and no structural reinterpretation.\n\nIntegrate the floor into the room with correct perspective and vanishing lines, preserving realistic contact shadows under furniture without altering floor brightness, finish, or texture.\n\nThe final result must look like the exact PVC floor from the sample — including its correct pattern type, orientation, and surface finish — has been physically installed in the room, without visual correction or creative interpretation.";

        const content = [
            {
                type: "text",
                text: defaultPrompt
            },
            {
                type: "image_url",
                image_url: {
                    url: roomImage
                }
            },
            ...floorImages.slice(0, 3).map((imageUrl: string) => ({
                type: "image_url",
                image_url: {
                    url: imageUrl
                }
            }))
        ];

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "https://vloerenconcurrent.com",
                "X-Title": "Vloerenconcurrent AI Visualizer",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "bytedance-seed/seedream-4.5",
                "messages": [
                    {
                        "role": "user",
                        "content": content
                    }
                ],
                "modalities": ["image", "text"],
                "stream": true
            })
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error('OpenRouter Error:', errorBody);
            return NextResponse.json(
                { error: errorBody.error?.message || 'Fout bij het aanroepen van de AI' },
                { status: response.status }
            );
        }

        if (!response.body) {
            return NextResponse.json(
                { error: 'Geen streaming response ontvangen' },
                { status: 502 }
            );
        }

        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const decoder = new TextDecoder();
                const reader = response.body!.getReader();
                let buffer = '';
                let imageSent = false;

                const send = (event: string, data: string) => {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
                };

                send('status', 'AI is bezig met genereren...');

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? '';

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed.startsWith('data:')) continue;
                            const data = trimmed.replace('data:', '').trim();
                            if (!data || data === '[DONE]') continue;

                            let parsed: any = null;
                            try {
                                parsed = JSON.parse(data);
                            } catch {
                                continue;
                            }

                            const delta = parsed?.choices?.[0]?.delta;
                            const message = parsed?.choices?.[0]?.message;
                            const imageFromDelta = delta?.images?.[0]?.image_url?.url;
                            const imageFromMessage = message?.images?.[0]?.image_url?.url;
                            const imageFromContentArray = Array.isArray(message?.content)
                                ? message.content.find((item: { type?: string }) => item.type === 'image_url')?.image_url?.url
                                : null;
                            const imageFromContentString = typeof message?.content === 'string' ? message.content : null;

                            const imageUrl = imageFromDelta || imageFromMessage || imageFromContentArray || imageFromContentString;
                            if (imageUrl && !imageSent) {
                                imageSent = true;
                                send('image', imageUrl);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Streaming Error:', error);
                    send('error', 'Er is iets misgegaan bij het genereren');
                }

                if (!imageSent) {
                    send('error', 'Geen afbeelding ontvangen van de AI');
                }

                send('done', 'klaar');
                controller.close();
            },
            cancel() {
                response.body?.cancel();
            }
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive"
            }
        });

    } catch (error: any) {
        console.error('API Route Error:', error);
        return NextResponse.json(
            { error: 'Interne serverfout' },
            { status: 500 }
        );
    }
}
