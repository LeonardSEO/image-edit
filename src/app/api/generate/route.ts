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

        const defaultPrompt = "Replace the existing floor in the atmosphere photo with the PVC floor from the provided sample image(s), following strict, non-interpreted material transfer rules.\n\nUse the first image as the base atmosphere photo and keep it completely unchanged: identical camera angle, framing, room geometry, furniture, walls, decor, lighting direction, exposure, shadows, reflections, and overall mood. Do not relight, rebalance, enhance, or color-correct the scene.\n\nUse the floor sample image(s) as the single source of truth for the new PVC floor. The sample determines the exact color, pattern type, orientation, and surface behavior of the floor and must be copied exactly, not approximated.\n\nLock the PVC floor color to the sample image. Do not adjust the floor color based on room lighting, wall color, daylight, white balance, shadows, or atmosphere. No warming, cooling, brightening, desaturating, or harmonizing with the interior. The visible floor color must remain identical to the sample in all areas.\n\nMatch the PVC surface finish exactly as shown in the sample, including matte or satin sheen. Do not increase gloss, reflections, or specular highlights due to lighting. Light may create soft shading only, without changing perceived color or finish.\n\nCorrectly identify and apply the laying pattern shown in the sample. If the sample shows classic herringbone (visgraat), generate classic herringbone with straight 90-degree plank ends and staggered overlapping layout. If the sample shows Hungarian point (Hongaarse punt), generate Hungarian point with angled plank ends and mirrored V-shaped layout. The generated pattern must always match the sample exactly.\n\nApply the floor using the exact plank direction and orientation visible in the sample. Do not rotate, mirror, optimize, or reinterpret the layout.\n\nAccurately reproduce plank width, length, seam spacing, joint visibility, embossing depth, grain direction, printed texture, and repetition pattern exactly as visible in the sample. No smoothing, no invented grain, no pattern drift, and no structural reinterpretation.\n\nIntegrate the floor into the room with correct perspective and vanishing lines, preserving realistic contact shadows under furniture without altering floor color, finish, or texture.\n\nThe final result must look like the exact PVC floor from the sample — identical in color, pattern, orientation, and surface finish — physically installed in the room, without aesthetic correction or creative interpretation.";

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
