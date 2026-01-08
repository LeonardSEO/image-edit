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

        const defaultPrompt = "Photorealistic interior image edit using multiple reference images: keep the base atmosphere photo exactly the same in terms of camera angle, composition, furniture, walls, lighting, shadows, and overall mood. Replace only the existing floor in the base image with the floor material, color, pattern, and texture taken from the second reference atmosphere photo. Accurately transfer the floor's plank dimensions, laying pattern (e.g. herringbone, straight, tiles), grain structure, finish (matte, satin, glossy), and natural variations. Ensure correct perspective, scale, and alignment with the room geometry. Maintain realistic contact shadows, reflections, and light interaction between the new floor and all objects. High-end interior photography quality, seamless material blending, natural color balance, ultra-realistic details, no visual artifacts or distortions.";

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
                "HTTP-Referer": "https://vloerenconcurrent.com", // Optional, for OpenRouter rankings
                "X-Title": "Vloerenconcurrent AI Visualizer", // Optional
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
                "modalities": ["image", "text"]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('OpenRouter Error:', data);
            return NextResponse.json(
                { error: data.error?.message || 'Fout bij het aanroepen van de AI' },
                { status: response.status }
            );
        }

        // The model returns the image in the content or as a tool call depending on the provider,
        // but usually for image generation models it's in the content or a specific field.
        // ByteDance Seedream 4.5 via OpenRouter typically returns the image URL in the message content.
        const message = data?.choices?.[0]?.message;
        const imageFromImages = message?.images?.[0]?.image_url?.url;
        const imageFromContentArray = Array.isArray(message?.content)
            ? message.content.find((item: { type?: string }) => item.type === 'image_url')?.image_url?.url
            : null;
        const imageFromContentString = typeof message?.content === 'string' ? message.content : null;

        const generatedImageUrl = imageFromImages || imageFromContentArray || imageFromContentString;
        if (!generatedImageUrl) {
            return NextResponse.json(
                { error: 'Geen afbeelding ontvangen van de AI' },
                { status: 502 }
            );
        }

        return NextResponse.json({ imageUrl: generatedImageUrl });

    } catch (error: any) {
        console.error('API Route Error:', error);
        return NextResponse.json(
            { error: 'Interne serverfout' },
            { status: 500 }
        );
    }
}
